import {
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { and, gte, lte } from "drizzle-orm";
import { buff_bookings } from "../db/schema";
import { DB, CustomClient } from "../types";
import {
  format,
  startOfDay,
  endOfDay,
  addDays,
  subDays,
  parse,
} from "date-fns";

export async function execute(
  interaction: ButtonInteraction,
  db: DB,
  client: CustomClient,
) {
  await interaction.deferUpdate();

  try {
    const [, dateInput] = interaction.customId.split(":");
    let targetDate = parse(dateInput, "yyyy-MM-dd", new Date());

    if (isNaN(targetDate.getTime())) {
      await interaction.editReply(
        "An error occurred with the date. Please try again.",
      );
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

    const bookingsMap = new Map<number, (typeof bookingsForDay)[0]>();
    bookingsForDay.forEach((booking) => {
      const hour = new Date(booking.slot_time).getUTCHours();
      bookingsMap.set(hour, booking);
    });

    const scheduleLines: string[] = [];
    for (let hour = 0; hour < 24; hour++) {
      const slotTime = new Date(dayStart);
      slotTime.setUTCHours(hour);
      const timestamp = Math.floor(slotTime.getTime() / 1000);

      const booking = bookingsMap.get(hour);
      if (booking) {
        const buffType =
          booking.buff_type.charAt(0).toUpperCase() +
          booking.buff_type.slice(1);
        scheduleLines.push(
          `**<t:${timestamp}:t>** - ✅ [${buffType}] - Booked by <@${booking.booked_by_discord_id}>`,
        );
      } else {
        scheduleLines.push(`**<t:${timestamp}:t>** - ⬜ Available`);
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(
        `Buff Schedule for: ${format(targetDate, "EEEE, MMMM d, yyyy")}`,
      )
      .setDescription(scheduleLines.join("\n") || "No slots available.")
      .setFooter({ text: "All times are shown in your local timezone." });

    const prevDay = subDays(targetDate, 1);
    const nextDay = addDays(targetDate, 1);

    const navigationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`buffcal_nav:${format(prevDay, "yyyy-MM-dd")}`)
        .setLabel("⬅️ Previous Day")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`buff_book_slot_init:${format(targetDate, "yyyy-MM-dd")}`)
        .setLabel("✍️ Book a Buff Slot")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`buffcal_nav:${format(nextDay, "yyyy-MM-dd")}`)
        .setLabel("Next Day ➡️")
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({
      embeds: [embed],
      components: [navigationRow],
    });
  } catch (error) {
    console.error("Error handling buff calendar navigation:", error);
  }
}
