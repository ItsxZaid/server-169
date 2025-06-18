import {
  SlashCommandBuilder,
  CommandInteraction,
  GuildMember,
  MessageFlags,
  EmbedBuilder,
  ChatInputCommandInteraction,
  ChannelType,
} from "discord.js";
import { CustomClient, DB } from "../types";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export const data = new SlashCommandBuilder()
  .setName("event-manager-remove")
  .setDescription(
    "Removes server and alliance Event Manager roles from a user.",
  )
  .addUserOption((option) =>
    option
      .setName("target")
      .setDescription("The user to remove Event Manager roles from")
      .setRequired(true),
  );

export async function execute(
  interaction: CommandInteraction,
  client: CustomClient,
  db: DB,
) {
  if (!interaction.inGuild() || !interaction.isChatInputCommand()) {
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const executor = interaction.member as GuildMember;
    const targetMember = interaction.options.getMember("target") as GuildMember;

    if (!targetMember) {
      await interaction.editReply(
        "Could not find the specified user in this server.",
      );
      return;
    }

    const executorDbResult = await db
      .select({ alliance: users.alliance })
      .from(users)
      .where(eq(users.user_discord_id, executor.id))
      .limit(1);

    const targetDbResult = await db
      .select({ alliance: users.alliance })
      .from(users)
      .where(eq(users.user_discord_id, targetMember.id))
      .limit(1);

    if (executorDbResult.length === 0 || targetDbResult.length === 0) {
      await interaction.editReply(
        "Error: Either you or the target user are not registered in the system. Both must be registered.",
      );
      return;
    }

    const executorAllianceId = executorDbResult[0].alliance;
    const targetAllianceId = targetDbResult[0].alliance;

    if (executorAllianceId !== targetAllianceId) {
      await interaction.editReply(
        "You can only manage alliance roles for members of your own alliance.",
      );
      return;
    }

    const r5Role = interaction.guild?.roles.cache.find(
      (role) => role.name === "R5",
    );
    const serverEventManagerRole = interaction.guild?.roles.cache.find(
      (role) => role.name === "EVENT_MANAGER",
    );

    const allianceCategory =
      interaction.guild?.channels.cache.get(targetAllianceId);

    if (
      !allianceCategory ||
      allianceCategory.type !== ChannelType.GuildCategory
    ) {
      await interaction.editReply(
        `Error: Could not find the alliance category channel associated with the target user.`,
      );
      return;
    }

    const alliancePrefix = allianceCategory.name.split(" ")[0].toUpperCase();
    const allianceEventManagerRoleName = `EVENT_MANAGER_${alliancePrefix}`;
    const allianceEventManagerRole = interaction.guild?.roles.cache.find(
      (role) => role.name === allianceEventManagerRoleName,
    );

    if (!r5Role || !serverEventManagerRole) {
      await interaction.editReply(
        "Error: The server is missing the base `R5` or `EVENT_MANAGER` roles.",
      );
      return;
    }

    if (!executor.roles.cache.has(r5Role.id)) {
      await interaction.editReply(
        "You do not have the required `R5` role to use this command.",
      );
      return;
    }

    if (!allianceEventManagerRole) {
      await interaction.editReply(
        `Error: The alliance-specific role \`${allianceEventManagerRoleName}\` could not be found.`,
      );
      return;
    }

    const hasServerRole = targetMember.roles.cache.has(
      serverEventManagerRole.id,
    );
    const hasAllianceRole = targetMember.roles.cache.has(
      allianceEventManagerRole.id,
    );

    if (!hasServerRole && !hasAllianceRole) {
      const noRolesEmbed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle("Action Not Needed")
        .setDescription(
          `${targetMember.user.tag} does not have any Event Manager roles to remove.`,
        );
      await interaction.editReply({ embeds: [noRolesEmbed] });
      return;
    }

    await targetMember.roles.remove([
      serverEventManagerRole,
      allianceEventManagerRole,
    ]);
    console.log(
      `[INFO] Removed Event Manager roles from ${targetMember.user.tag} by ${executor.user.tag}.`,
    );

    const successEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("Event Manager Roles Removed")
      .setDescription(
        `Successfully removed the following roles from ${targetMember}:`,
      )
      .addFields(
        {
          name: "Server Role",
          value: `${serverEventManagerRole}`,
          inline: true,
        },
        {
          name: "Alliance Role",
          value: `${allianceEventManagerRole}`,
          inline: true,
        },
        { name: "Revoked by", value: `${executor.user.tag}` },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });
  } catch (error) {
    console.error("Error removing Event Manager roles:", error);
    await interaction.editReply(
      "An unexpected error occurred. I may be missing permissions to manage roles.",
    );
  }
}
