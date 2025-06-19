import {
  SlashCommandBuilder,
  CommandInteraction,
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
  parse,
  isValid,
} from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";

type BuffType = NewBuffBooking["buff_type"];
const TIMEZONE = "UTC";

export const data = new SlashCommandBuilder()
  .setName("buff-calendar")
  .setDescription("Displays the buff schedule for a specific date.")
  .addStringOption((option) =>
    option
      .setName("date")
      .setDescription(
        "The date to view in YYYY-MM-DD format (UTC). Defaults to today.",
      )
      .setRequired(false),
  );

export async function execute(
  interaction: CommandInteraction,
  client: CustomClient,
  db: DB,
) {
  if (!interaction.isChatInputCommand() || !interaction.guild) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const dateInput = interaction.options.getString("date");
    let targetDate: Date;

    if (dateInput) {
      targetDate = new Date(`${dateInput}T00:00:00Z`);
      if (isNaN(targetDate.getTime())) {
        await interaction.editReply({
          content: "❌ Invalid date format. Please use `yyyy-MM-DD`.",
        });
        return;
      }
    } else {
      targetDate = new Date();
    }

    const zonedTargetDate = toZonedTime(targetDate, TIMEZONE);
    const dayStart = startOfDay(zonedTargetDate);
    const dayEnd = endOfDay(zonedTargetDate);

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
          text: `Schedule for ${format(zonedTargetDate, "EEEE, MMMM d, yyyy")} | All times are UTC.`,
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

    const prevDay = subDays(zonedTargetDate, 1);
    const nextDay = addDays(zonedTargetDate, 1);

    const navigationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      // new ButtonBuilder()
      //   .setCustomId(
      //     `buffcal_nav:${formatInTimeZone(prevDay, TIMEZONE, "yyyy-MM-dd")}`,
      //   )
      //   .setLabel("⬅️ Previous Day")
      //   .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(
          `buff_book_slot_init:${formatInTimeZone(zonedTargetDate, TIMEZONE, "yyyy-MM-dd")}`,
        )
        .setLabel("✍️ Book a Slot")
        .setStyle(ButtonStyle.Primary),
      // new ButtonBuilder()
      //   .setCustomId(
      //     `buffcal_nav:${formatInTimeZone(nextDay, TIMEZONE, "yyyy-MM-dd")}`,
      //   )
      //   .setLabel("Next Day ➡️")
      //   .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({
      embeds: [researchEmbed, trainingEmbed, buildingEmbed],
      components: [navigationRow],
    });
  } catch (error) {
    await interaction.editReply({
      content: "❌ An unexpected error occurred. Please try again later.",
    });
  }
}
