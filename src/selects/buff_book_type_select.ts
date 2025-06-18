import {
  StringSelectMenuInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { DB, CustomClient } from "../types";
import { and, gte, lte } from "drizzle-orm";
import { buff_bookings } from "../db/schema";
import { format, startOfDay, endOfDay, parse } from "date-fns";

export async function execute(
  interaction: StringSelectMenuInteraction,
  db: DB,
  client: CustomClient,
) {
  try {
    await interaction.deferUpdate();

    const [, dateInput] = interaction.customId.split(":");
    const selectedBuffType = interaction.values[0];

    let targetDate = parse(dateInput, "yyyy-MM-dd", new Date());
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

    const availableSlotOptions = availableSlots.slice(0, 25);

    const updatedTypeMenu = new StringSelectMenuBuilder()
      .setCustomId(`buff_book_type_select:${dateInput}`)
      .setPlaceholder(
        `Type: ${selectedBuffType.charAt(0).toUpperCase() + selectedBuffType.slice(1)} Buff`,
      )
      .setOptions([
        { label: "Research Buff", value: "research" },
        { label: "Training Buff", value: "training" },
        { label: "Building Buff", value: "building" },
      ])
      .setDisabled(true);

    const updatedTimeMenu = new StringSelectMenuBuilder()
      .setCustomId(`buff_book_time_select:${selectedBuffType}:${dateInput}`)
      .setPlaceholder("2. Great! Now select a time slot.")
      .setOptions(
        availableSlotOptions.length > 0
          ? availableSlotOptions
          : [{ label: "No slots available.", value: "none" }],
      )
      .setDisabled(false);

    const firstRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        updatedTypeMenu,
      );
    const secondRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        updatedTimeMenu,
      );

    await interaction.editReply({
      content: "Please select an available time slot for your chosen buff.",
      components: [firstRow, secondRow],
    });
  } catch (error) {
    console.error("Error handling buff type selection:", error);
    await interaction
      .editReply({
        content: "An error occurred. Please try again.",
        components: [],
      })
      .catch(() => {});
  }
}
