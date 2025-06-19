import {
  StringSelectMenuInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ActionRow,
  StringSelectMenuComponent,
} from "discord.js";
import { DB, CustomClient } from "../types";
import { and, gte, lte, eq } from "drizzle-orm";
import { buff_bookings } from "../db/schema";
import { startOfDay, endOfDay, parse } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";

const TIMEZONE = "Europe/London";

export async function execute(
  interaction: StringSelectMenuInteraction,
  db: DB,
  client: CustomClient,
) {
  try {
    await interaction.deferUpdate();

    const [, dateInput] = interaction.customId.split(":");
    const selectedBuffType = interaction.values[0];

    const targetDate = parse(dateInput, "yyyy-MM-dd", new Date());
    const zonedTargetDate = toZonedTime(targetDate, TIMEZONE);
    const dayStart = startOfDay(zonedTargetDate);
    const dayEnd = endOfDay(zonedTargetDate);

    const bookingsForDay = await db
      .select({ slot_time: buff_bookings.slot_time })
      .from(buff_bookings)
      .where(
        and(
          eq(buff_bookings.buff_type, selectedBuffType as any),
          gte(buff_bookings.slot_time, dayStart.toISOString()),
          lte(buff_bookings.slot_time, dayEnd.toISOString()),
        ),
      );

    const bookedHours = new Set(
      bookingsForDay.map((b) => {
        const londonTime = toZonedTime(b.slot_time, TIMEZONE);
        return londonTime.getHours();
      }),
    );

    const availableSlots: { label: string; value: string }[] = [];
    for (let hour = 0; hour < 24; hour++) {
      if (!bookedHours.has(hour)) {
        const dateString = `${dateInput}T${String(hour).padStart(
          2,
          "0",
        )}:00:00`;
        const zonedSlotTime = toZonedTime(dateString, TIMEZONE);
        const timestamp = Math.floor(zonedSlotTime.getTime() / 1000);
        const timeString = formatInTimeZone(zonedSlotTime, TIMEZONE, "HH:mm");
        availableSlots.push({
          label: timeString,
          value: timestamp.toString(),
        });
      }
    }

    const [originalActionRow] = interaction.message
      .components as ActionRow<StringSelectMenuComponent>[];

    if (!originalActionRow || !originalActionRow.components[0]) {
      return;
    }

    const typeMenuRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        StringSelectMenuBuilder.from(
          originalActionRow.components[0],
        ).setDisabled(true),
      );

    const timeMenuRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`buff_book_time_select:${selectedBuffType}`)
          .setPlaceholder("2. Great! Now select an available time slot.")
          .setOptions(
            availableSlots.length > 0
              ? availableSlots
              : [
                  {
                    label: "No more slots available for this day.",
                    value: "none",
                  },
                ],
          )
          .setDisabled(availableSlots.length === 0),
      );

    await interaction.editReply({
      content:
        availableSlots.length > 0
          ? "Please select an available time slot for your chosen buff."
          : "Unfortunately, there are no more slots available for the selected buff on this day.",
      components: [typeMenuRow, timeMenuRow],
    });
  } catch (error) {}
}
