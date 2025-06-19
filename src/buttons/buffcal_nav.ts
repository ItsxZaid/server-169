import {
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { and, gte, lte } from "drizzle-orm";
import { buff_bookings, NewBuffBooking } from "../db/schema";
import { DB, CustomClient } from "../types";
import {
  format,
  startOfDay,
  endOfDay,
  addDays,
  subDays,
  isValid,
} from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";

const TIMEZONE = "UTC";
type BuffType = NewBuffBooking["buff_type"];

export async function execute(
  interaction: ButtonInteraction,
  db: DB,
  client: CustomClient,
) {
  if (!interaction.guild) return;
  await interaction.deferUpdate();

  try {
    const [, dateInput] = interaction.customId.split(":");
    const targetDate = new Date(dateInput + "T00:00:00.000Z");

    if (!isValid(targetDate)) {
      await interaction.editReply({
        content: "An error occurred with the date. Please try again.",
      });
      return;
    }

    const dayStart = startOfDay(targetDate);
    const dayEnd = endOfDay(targetDate);

    const bookingsForDay = await db
      .select()
      .from(buff_bookings)
      .where(
        and(
          gte(buff_bookings.slot_time, dayStart.toISOString()),
          lte(buff_bookings.slot_time, dayEnd.toISOString()),
        ),
      );

    const userIds = [
      ...new Set(bookingsForDay.map((b) => b.booked_by_discord_id)),
    ];
    const membersMap = new Map<string, string>();
    if (userIds.length > 0) {
      const members = await interaction.guild.members.fetch({ user: userIds });
      members.forEach((member) =>
        membersMap.set(member.id, member.displayName),
      );
    }

    const createScheduleEmbed = (
      buffType: BuffType,
      title: string,
      color: number,
    ) => {
      const typeBookings = bookingsForDay.filter(
        (b) => b.buff_type === buffType,
      );
      const bookingsMap = new Map();
      typeBookings.forEach((booking) => {
        const slotDate = new Date(booking.slot_time);
        const hour = slotDate.getUTCHours();
        bookingsMap.set(hour, booking);
      });

      const scheduleTable: string[] = [];
      for (let hour = 0; hour < 24; hour++) {
        const timeString = `${String(hour).padStart(2, "0")}:00`;
        const booking = bookingsMap.get(hour);
        const displayName = booking
          ? membersMap.get(booking.booked_by_discord_id)
          : null;
        const displayValue = booking
          ? `✅ ${displayName || `<@${booking.booked_by_discord_id}>`}`
          : `⬜ Available`;
        scheduleTable.push(`${timeString} : ${displayValue}`);
      }
      const description = `\`\`\`\n${scheduleTable.join("\n")}\n\`\`\``;

      return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setFooter({
          text: `Schedule for ${format(targetDate, "EEEE, MMMM d, yyyy")} | All times are UTC.`,
        });
    };

    const researchEmbed = createScheduleEmbed(
      "research",
      "🔬 Research Buff Schedule",
      0x3498db,
    );
    const trainingEmbed = createScheduleEmbed(
      "training",
      "⚔️ Training Buff Schedule",
      0xe74c3c,
    );
    const buildingEmbed = createScheduleEmbed(
      "building",
      "🏗️ Building Buff Schedule",
      0xf1c40f,
    );

    const prevDay = subDays(targetDate, 1);
    const nextDay = addDays(targetDate, 1);

    const navigationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `buffcal_nav:${formatInTimeZone(prevDay, TIMEZONE, "yyyy-MM-dd")}`,
        )
        .setLabel("⬅️ Previous Day")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(
          `buff_book_slot_init:${formatInTimeZone(
            targetDate,
            TIMEZONE,
            "yyyy-MM-dd",
          )}`,
        )
        .setLabel("✍️ Book a Slot")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(
          `buffcal_nav:${formatInTimeZone(nextDay, TIMEZONE, "yyyy-MM-dd")}`,
        )
        .setLabel("Next Day ➡️")
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({
      embeds: [researchEmbed, trainingEmbed, buildingEmbed],
      components: [navigationRow],
    });
  } catch (error) {
    console.error("Error in buffcal_nav button:", error);
  }
}
