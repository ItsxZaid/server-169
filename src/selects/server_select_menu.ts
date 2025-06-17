import {
  StringSelectMenuInteraction,
  Guild,
  Role,
  GuildMember,
  EmbedBuilder,
  TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} from "discord.js";
import { eq } from "drizzle-orm";
import { DB, CustomClient } from "../types";
import { users } from "../db/schema";

export async function execute(
  interaction: StringSelectMenuInteraction,
  db: DB,
  client: CustomClient,
) {
  await interaction.deferUpdate();

  const selectedServerId = interaction.values[0];
  const userDiscordId = interaction.user.id;
  const registerRoleId = process.env.REGISTER_ROLE_ID;
  const adminApprovalChannelId = process.env.ADMIN_APPROVAL_CHANNEL_ID;

  if (!registerRoleId || !adminApprovalChannelId) {
    console.error(
      "REGISTER_ROLE_ID or ADMIN_APPROVAL_CHANNEL_ID environment variable is not set.",
    );
    await interaction.editReply({
      content: "❌ Configuration error. Please contact an administrator.",
      components: [],
    });
    return;
  }

  try {
    await db
      .update(users)
      .set({
        server: selectedServerId,
        status: "pending",
      })
      .where(eq(users.user_discord_id, userDiscordId));

    const guild = interaction.guild;
    if (!guild) throw new Error("Could not retrieve guild from interaction.");

    const member = await guild.members.fetch(userDiscordId).catch(() => {
      throw new Error(`Could not find member with ID ${userDiscordId}.`);
    });

    const registerRole = await guild.roles
      .fetch(registerRoleId)
      .catch(() => null);
    if (registerRole) {
      await member.roles.add(registerRole);
    }

    const userRecord = (
      await db
        .select()
        .from(users)
        .where(eq(users.user_discord_id, userDiscordId))
        .limit(1)
    )[0];

    if (userRecord?.rank === "R5") {
      const approvalChannel = (await guild.channels
        .fetch(adminApprovalChannelId)
        .catch(() => null)) as TextChannel | null;

      if (!approvalChannel) {
        console.error(
          `Could not find admin approval channel: ${adminApprovalChannelId}`,
        );
      } else {
        let serverName = `Server ID: ${userRecord.server}`;
        const serverChannel = guild.channels.cache.get(
          String(selectedServerId),
        );

        if (serverChannel?.name) serverName = serverChannel.name;

        let allianceName = `Alliance ID: ${userRecord.alliance}`;
        const allianceCategory = userRecord.alliance
          ? guild.channels.cache.get(String(userRecord.alliance))
          : null;

        if (allianceCategory?.name) allianceName = allianceCategory.name;

        const approvalEmbed = new EmbedBuilder()
          .setColor("#FFD700")
          .setTitle("👑 R5 Rank Approval Request")
          .setAuthor({
            name: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL(),
          })
          .addFields(
            {
              name: "Discord User",
              value: `<@${userDiscordId}>`,
              inline: true,
            },
            {
              name: "In-Game Name",
              value: userRecord.in_game_name,
              inline: true,
            },
            { name: "Status", value: `\`${userRecord.status}\``, inline: true },
            { name: "Chosen Server", value: serverName, inline: true },
            { name: "Alliance", value: allianceName, inline: true },
            { name: "Rank", value: `**${userRecord.rank}**`, inline: true },
          )
          .setTimestamp()
          .setFooter({ text: `User ID: ${userDiscordId}` });

        const approveButton = new ButtonBuilder()
          .setCustomId(`approve_button_click:${userDiscordId}`)
          .setLabel("Approve")
          .setStyle(ButtonStyle.Success)
          .setEmoji("✔️");

        const denyButton = new ButtonBuilder()
          .setCustomId(`deny_button_click:${userDiscordId}`)
          .setLabel("Deny")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("✖️");

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          approveButton,
          denyButton,
        );

        await approvalChannel.send({
          embeds: [approvalEmbed],
          components: [actionRow],
        });

        console.log(
          `Sent R5 approval request for ${interaction.user.tag} with action buttons.`,
        );
      }
    } else {
      const allianceId = userRecord.alliance;
      let approvalChannel: TextChannel | null = null;

      if (allianceId) {
        const allianceCategory = await guild.channels
          .fetch(String(allianceId))
          .catch(() => null);

        if (allianceCategory?.type === ChannelType.GuildCategory) {
          const leadershipChannel = allianceCategory.children.cache.find(
            (ch) =>
              ch.type === ChannelType.GuildText &&
              ch.name.endsWith("leadership-chat"),
          ) as TextChannel | undefined;
          if (leadershipChannel) {
            approvalChannel = leadershipChannel;
          }
        }
      }

      if (!approvalChannel) {
        approvalChannel = (await guild.channels
          .fetch(adminApprovalChannelId)
          .catch(() => null)) as TextChannel | null;
      }

      if (!approvalChannel) {
        console.error(
          `Could not find any approval channel for user ${interaction.user.tag}. Alliance ID: ${allianceId}`,
        );
      } else {
        let serverName = `Server ID: ${userRecord.server}`;
        const serverChannel = guild.channels.cache.get(
          String(selectedServerId),
        );

        if (serverChannel?.name) serverName = serverChannel.name;

        let allianceName = `Alliance ID: ${userRecord.alliance}`;
        const allianceCategory = userRecord.alliance
          ? guild.channels.cache.get(String(userRecord.alliance))
          : null;

        if (allianceCategory?.name) allianceName = allianceCategory.name;

        const approvalEmbed = new EmbedBuilder()
          .setColor("#FFD700")
          .setTitle("Alliance Approval Request")
          .setAuthor({
            name: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL(),
          })
          .addFields(
            {
              name: "Discord User",
              value: `<@${userDiscordId}>`,
              inline: true,
            },
            {
              name: "In-Game Name",
              value: userRecord.in_game_name,
              inline: true,
            },
            { name: "Status", value: `\`${userRecord.status}\``, inline: true },
            { name: "Chosen Server", value: serverName, inline: true },
            { name: "Alliance", value: allianceName, inline: true },
            { name: "Rank", value: `**${userRecord.rank}**`, inline: true },
          )
          .setTimestamp()
          .setFooter({ text: `User ID: ${userDiscordId}` });

        const approveButton = new ButtonBuilder()
          .setCustomId(`approve_button_click:${userDiscordId}`)
          .setLabel("Approve")
          .setStyle(ButtonStyle.Success)
          .setEmoji("✔️");

        const denyButton = new ButtonBuilder()
          .setCustomId(`deny_button_click:${userDiscordId}`)
          .setLabel("Deny")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("✖️");

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          approveButton,
          denyButton,
        );

        await approvalChannel.send({
          embeds: [approvalEmbed],
          components: [actionRow],
        });

        console.log(
          `Sent approval request for ${interaction.user.tag} to the appropriate leadership channel.`,
        );
      }
    }

    await interaction.editReply({
      content:
        "✅ Thank you! Your registration is complete and is now pending approval.",
      components: [],
    });
  } catch (error) {
    console.error("Error during registration process:", error);
    await interaction.editReply({
      content:
        "❌ An unexpected error occurred. Please contact an administrator.",
      components: [],
    });
  }
}
