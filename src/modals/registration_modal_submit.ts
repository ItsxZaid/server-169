import {
  ActionRowBuilder,
  ChannelType,
  MessageFlags,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  TextChannel,
} from "discord.js";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { DB } from "../types";

export async function execute(interaction: ModalSubmitInteraction, db: DB) {
  console.log(
    `[ModalSubmit] Interaction received from user: ${interaction.user.tag}`,
  );

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  console.log(`[ModalSubmit] Deferred ephemeral reply`);

  const inGameName = interaction.fields.getTextInputValue("in_game_name_input");
  console.log(`[ModalSubmit] Retrieved in-game name: ${inGameName}`);

  await db
    .update(users)
    .set({
      in_game_name: inGameName,
    })
    .where(eq(users.user_discord_id, interaction.user.id));
  const guild = interaction.guild;
  if (!guild) {
    console.warn(`[ModalSubmit] No guild found for interaction.`);
    return;
  }

  console.log(`[ModalSubmit] Processing guild: ${guild.name} (${guild.id})`);

  const channels = guild.channels.cache;

  const allianceChannels = channels.filter(
    (ch) =>
      ch.type === ChannelType.GuildCategory && ch.name.endsWith("Alliance"),
  ) as Map<string, TextChannel>;
  console.log(`[ModalSubmit] Found ${allianceChannels.size} alliance channels`);

  const serverChannels = channels.filter(
    (ch) =>
      ch.type === ChannelType.GuildCategory && ch.name.startsWith("Server"),
  ) as Map<string, TextChannel>;
  console.log(`[ModalSubmit] Found ${serverChannels.size} server channels`);

  const rankSelect = new StringSelectMenuBuilder()
    .setCustomId("rank_select_menu")
    .setPlaceholder("1. Select your rank (Start here)")
    .addOptions(
      ["R1", "R2", "R3", "R4", "R5"].map((rank) => ({
        label: rank,
        value: rank,
      })),
    );

  const allianceOptions =
    allianceChannels.size > 0
      ? [...allianceChannels.values()].map((ch) => ({
          label: ch.name,
          value: ch.id,
        }))
      : [{ label: "No alliances found", value: "none" }];

  const allianceSelect = new StringSelectMenuBuilder()
    .setCustomId("alliance_select_menu")
    .setPlaceholder("2. Select your alliance (Please Choose Rank First)")
    .addOptions(allianceOptions)
    .setDisabled(true);

  const serverOptions =
    serverChannels.size > 0
      ? [...serverChannels.values()].map((ch) => ({
          label: ch.name,
          value: ch.id,
        }))
      : [{ label: "No servers found", value: "none" }];

  const serverSelect = new StringSelectMenuBuilder()
    .setCustomId("server_select_menu")
    .setPlaceholder("3. Select your server (Please Choose Rank First)")
    .addOptions(serverOptions)
    .setDisabled(true);
  await interaction.followUp({
    content: "Great! Now please select your rank, alliance, and server.",
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(rankSelect),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        allianceSelect,
      ),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        serverSelect,
      ),
    ],
    flags: [MessageFlags.Ephemeral],
  });

  console.log(`[ModalSubmit] Follow-up sent with select menus`);
}
