import {
  StringSelectMenuInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { eq } from "drizzle-orm";
import { DB, CustomClient } from "../types";
import { buff_bookings, NewBuffBooking, users } from "../db/schema";

export async function execute(
  interaction: StringSelectMenuInteraction,
  db: DB,
  client: CustomClient,
) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const [registeredUser] = await db
      .select()
      .from(users)
      .where(eq(users.user_discord_id, interaction.user.id))
      .limit(1);

    if (!registeredUser) {
      await interaction.editReply(
        "You must be registered in the system to book a buff slot. Please use the registration command first.",
      );
      return;
    }

    const [, buffType, dateInput] = interaction.customId.split(":");
    const slotTimestamp = parseInt(interaction.values[0]);
    if (isNaN(slotTimestamp)) {
      await interaction.editReply("Invalid time slot selected.");
      return;
    }
    const slotTime = new Date(slotTimestamp * 1000);
    const slotIso = slotTime.toISOString();

    const [existingBooking] = await db
      .select()
      .from(buff_bookings)
      .where(eq(buff_bookings.slot_time, slotIso))
      .limit(1);

    if (existingBooking) {
      await interaction.editReply({
        content:
          "Sorry, someone just booked that slot! Please try booking another time.",
        components: [],
      });
      return;
    }

    const newBooking: NewBuffBooking = {
      buff_type: buffType as "research" | "training" | "building",
      slot_time: slotIso,
      booked_by_discord_id: interaction.user.id,
      notification_sent: false,
    };

    await db.insert(buff_bookings).values(newBooking);
    console.log(
      `[DB] New buff booking created by ${
        interaction.user.tag
      } for slot ${slotIso}`,
    );

    const successEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("✅ Buff Slot Booked!")
      .setDescription("Your buff slot has been successfully reserved.")
      .addFields(
        {
          name: "Buff Type",
          value: buffType.charAt(0).toUpperCase() + buffType.slice(1),
          inline: true,
        },
        { name: "Time Slot", value: `<t:${slotTimestamp}:F>`, inline: true },
      )
      .setFooter({
        text: "The buff giver will be notified 5 minutes before the slot.",
      });

    await interaction.editReply({
      content: "All done!",
      embeds: [successEmbed],
      components: [],
    });
  } catch (error) {
    console.error("Error finalizing buff booking:", error);
    await interaction.editReply({
      content: "A critical error occurred while booking your slot.",
      components: [],
    });
  }
}
