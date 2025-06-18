import {
  ButtonInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { and, gte, lte } from "drizzle-orm";
import { buff_bookings } from "../db/schema";
import { DB, CustomClient } from "../types";
import { format, startOfDay, endOfDay, parse } from "date-fns";

export async function execute(
  interaction: ButtonInteraction,
  db: DB,
  client: CustomClient,
) {
  try {
    const [, dateInput] = interaction.customId.split(":");
    let targetDate = parse(dateInput, "yyyy-MM-dd", new Date());

    if (isNaN(targetDate.getTime())) {
      await interaction.reply({
        content: "Invalid date in button ID.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const dayStart = startOfDay(targetDate);
    const dayEnd = endOfDay(targetDate);

    const bookingsForDay = await db
      .select({ slot_time: buff_bookings.slot_time })
      .from(buff_bookings)
      .where(
        and(
          gte(buff_bookings.slot_time, dayStart.toISOString()),
          lte(buff_bookings.slot_time, dayEnd.toISOString()),
        ),
      );

    const bookedHours = new Set(
      bookingsForDay.map((b) => new Date(b.slot_time).getUTCHours()),
    );

    const availableSlots: { label: string; value: string }[] = [];
    for (let hour = 0; hour < 24; hour++) {
      if (!bookedHours.has(hour)) {
        const slotTime = new Date(dayStart);
        slotTime.setUTCHours(hour);
        const timestamp = Math.floor(slotTime.getTime() / 1000);

        availableSlots.push({
          label: `${format(slotTime, "HH:mm")} UTC`,
          value: timestamp.toString(),
        });
      }
    }

    if (availableSlots.length === 0) {
      await interaction.editReply("There are no available slots for this day.");
      return;
    }

    const availableSlotOptions = availableSlots.slice(0, 25);

    const buffTypeMenu =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`buff_book_type_select:${dateInput}`)
          .setPlaceholder("1. Select the type of buff you need")
          .addOptions([
            { label: "Research Buff", value: "research" },
            { label: "Training Buff", value: "training" },
            { label: "Building Buff", value: "building" },
          ]),
      );

    const timeSlotMenu =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("buff_book_time_select:${dateInput}")
          .setPlaceholder("2. Select a time slot (after choosing a type)")
          .addOptions(
            availableSlotOptions.length > 0
              ? availableSlotOptions
              : [{ label: "...", value: "..." }],
          )
          .setDisabled(true),
      );

    await interaction.editReply({
      content: `Please select a buff type and an available time slot for **${format(targetDate, "MMM d, yyyy")}**.`,
      components: [buffTypeMenu, timeSlotMenu],
    });
  } catch (error) {
    console.error("Error initiating buff booking:", error);
    await interaction.editReply({
      content: "An error occurred while preparing the booking form.",
    });
  }
}
