import {
  SlashCommandBuilder,
  CommandInteraction,
  GuildMember,
  MessageFlags,
  EmbedBuilder,
} from "discord.js";
import { CustomClient, DB } from "../types";
import { buff_bookings } from "../db/schema";
import { eq } from "drizzle-orm";
import { parse } from "date-fns";

export const data = new SlashCommandBuilder()
  .setName("buff-schedule-assign")
  .setDescription("Manually assigns a giver to a booked buff slot.")
  .addUserOption((option) =>
    option
      .setName("giver")
      .setDescription("The user who will give the buff")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("slot")
      .setDescription(
        "The booked slot time in YYYY-MM-DD HH:00 format (e.g., 2025-06-18 14:00)",
      )
      .setRequired(true),
  );

export async function execute(
  interaction: CommandInteraction,
  client: CustomClient,
  db: DB,
) {
  if (!interaction.inGuild() || !interaction.isChatInputCommand()) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const executor = interaction.member as GuildMember;
    const targetGiver = interaction.options.getMember("giver") as GuildMember;
    const slotInput = interaction.options.getString("slot", true);

    const r5Role = interaction.guild?.roles.cache.find(
      (role) => role.name === "R5",
    );
    const r4Role = interaction.guild?.roles.cache.find(
      (role) => role.name === "R4",
    );

    if (!r5Role || !r4Role) {
      await interaction.editReply(
        "Error: This command requires `R5` and `R4` roles to exist.",
      );
      return;
    }

    const isR5 = executor.roles.cache.has(r5Role.id);
    const isR4 = executor.roles.cache.has(r4Role.id);

    if (!isR5 && !isR4) {
      await interaction.editReply(
        "You must have the `R5` or `R4` role to use this command.",
      );
      return;
    }

    const slotTime = parse(slotInput, "yyyy-MM-dd HH:mm", new Date());
    if (isNaN(slotTime.getTime())) {
      await interaction.editReply(
        "Invalid slot time format. Please use `YYYY-MM-DD HH:00`.",
      );
      return;
    }

    const slotIso = slotTime.toISOString();

    const [booking] = await db
      .select()
      .from(buff_bookings)
      .where(eq(buff_bookings.slot_time, slotIso))
      .limit(1);

    if (!booking) {
      await interaction.editReply(
        `No buff booking was found for the specified slot: **${slotInput}**.`,
      );
      return;
    }

    await db
      .update(buff_bookings)
      .set({ giver_discord_id: targetGiver.id })
      .where(eq(buff_bookings.slot_time, slotIso));

    console.log(
      `[INFO] Buff giver for slot ${slotIso} updated to ${targetGiver.user.tag} by ${executor.user.tag}.`,
    );

    const successEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("Buff Giver Assigned")
      .setDescription(
        `The giver for the buff slot has been successfully updated.`,
      )
      .addFields(
        {
          name: "Slot Time",
          value: `<t:${Math.floor(slotTime.getTime() / 1000)}:F>`,
        },
        {
          name: "Original Booker",
          value: `<@${booking.booked_by_discord_id}>`,
          inline: true,
        },
        { name: "Assigned Giver", value: `${targetGiver}`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });
  } catch (error) {
    console.error("Error assigning buff giver:", error);
    await interaction.editReply("An unexpected error occurred.");
  }
}
