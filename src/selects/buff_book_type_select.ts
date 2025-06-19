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
import { startOfDay, endOfDay, isToday } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";

const TIMEZONE = "UTC";

export async function execute(
  interaction: StringSelectMenuInteraction,
  db: DB,
  client: CustomClient,
) {
  try {
    await interaction.deferUpdate();

    const [, dateInput] = interaction.customId.split(":");
    const selectedBuffType = interaction.values[0];

    const targetDate = new Date(dateInput + "T00:00:00.000Z");
    const dayStart = startOfDay(targetDate);
    const dayEnd = endOfDay(targetDate);

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
        return new Date(b.slot_time).getUTCHours();
      }),
    );

    const availableSlots: { label: string; value: string }[] = [];
    const now = new Date();
    const isBookingForToday = isToday(targetDate);

    for (let hour = 0; hour < 24; hour++) {
      const isAvailable = !bookedHours.has(hour);

      const nowInUtc = toZonedTime(new Date(), TIMEZONE);
      const dateIsInFuture = targetDate > nowInUtc;
      const isFutureSlot = dateIsInFuture || hour > nowInUtc.getUTCHours();

      if (isAvailable && isFutureSlot) {
        const dateString = `${dateInput}T${String(hour).padStart(2, "0")}:00:00`;

        const slotDateTime = new Date(dateString + "Z");

        const timestamp = Math.floor(slotDateTime.getTime() / 1000);
        const timeString = formatInTimeZone(slotDateTime, TIMEZONE, "HH:mm");

        availableSlots.push({
          label: `${timeString} UTC`,
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
          .setPlaceholder("2. Great! Now select an available time slot (UTC).")
          .setOptions(
            availableSlots.length > 0
              ? availableSlots
              : [
                  {
                    label: "No future slots available for this day.",
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
          : "Unfortunately, there are no more future slots available for the selected buff on this day.",
      components: [typeMenuRow, timeMenuRow],
    });
  } catch (error) {
    console.error("Error in buff_book_type_select:", error);
  }
}
