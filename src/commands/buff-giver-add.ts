import {
  SlashCommandBuilder,
  CommandInteraction,
  GuildMember,
  MessageFlags,
  EmbedBuilder,
} from "discord.js";
import { CustomClient, DB } from "../types";

export const data = new SlashCommandBuilder()
  .setName("buff-giver-add")
  .setDescription("Assigns the Buff Giver role to a user.")
  .addUserOption((option) =>
    option
      .setName("target")
      .setDescription("The user to be made a Buff Giver")
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
    const targetMember = interaction.options.getMember("target") as GuildMember;

    const r5Role = interaction.guild?.roles.cache.find(
      (role) => role.name === "R5",
    );
    const r4Role = interaction.guild?.roles.cache.find(
      (role) => role.name === "R4",
    );
    const buffGiverRole = interaction.guild?.roles.cache.find(
      (role) => role.name === "BUFF_GIVER",
    );

    if (!r5Role || !r4Role || !buffGiverRole) {
      await interaction.editReply(
        "Error: This command requires `R5`, `R4`, and `BUFF_GIVER` roles to exist.",
      );
      return;
    }

    const isR5 = executor.roles.cache.has(r5Role.id);
    const isR4 = executor.roles.cache.has(r4Role.id);

    if (!isR5 && !isR4) {
      await interaction.editReply(
        "You do not have the required `R5` or `R4` role to use this command.",
      );
      return;
    }

    if (!targetMember) {
      await interaction.editReply(
        "Could not find the specified user in this server.",
      );
      return;
    }

    if (targetMember.roles.cache.has(buffGiverRole.id)) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("Action Not Needed")
            .setDescription(
              `${targetMember.user.tag} already has the **Buff Giver** role.`,
            ),
        ],
      });
      return;
    }

    await targetMember.roles.add(buffGiverRole);
    console.log(
      `[INFO] Assigned Buff Giver role to ${targetMember.user.tag} by ${executor.user.tag}.`,
    );

    const successEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("Role Assigned Successfully")
      .setDescription(
        `The **Buff Giver** role has been assigned to ${targetMember}.`,
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });
  } catch (error) {
    console.error("Error assigning Buff Giver role:", error);
    await interaction.editReply("An unexpected error occurred.");
  }
}
