import {
  ActionRowBuilder,
  ChannelType,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
} from "discord.js";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { DB } from "../types";

export async function execute(interaction: ModalSubmitInteraction, db: DB) {
  await interaction.deferReply({ ephemeral: true });

  const inGameName = interaction.fields.getTextInputValue("in_game_name_input");

  const rankSelect = new StringSelectMenuBuilder()
    .setCustomId("rank_select_menu")
    .setPlaceholder("Select your rank")
    .addOptions([
      { label: "R1", value: "R1" },
      { label: "R2", value: "R2" },
      { label: "R3", value: "R3" },
      { label: "R4", value: "R4" },
      { label: "R5", value: "R5" },
    ]);

  if (!interaction.guild) return;

  const allianceChannels = interaction.guild.channels.cache.filter(
    (ch) => ch.type === ChannelType.GuildText && ch.name.endsWith("Alliance"),
  );

  const allianceOptions =
    allianceChannels.size > 0
      ? allianceChannels.map((ch) => ({ label: ch.name, value: ch.name }))
      : [{ label: "No alliances found", value: "none" }];

  const allianceSelect = new StringSelectMenuBuilder()
    .setCustomId("alliance_select_menu")
    .setPlaceholder("Select your alliance")
    .addOptions(allianceOptions);

  const serverChannels = interaction.guild.channels.cache.filter(
    (ch) => ch.type === ChannelType.GuildText && ch.name.startsWith("Server"),
  );

  const serverOptions =
    serverChannels.size > 0
      ? serverChannels.map((ch) => ({ label: ch.name, value: ch.name }))
      : [{ label: "No servers found", value: "none" }];

  const serverSelect = new StringSelectMenuBuilder()
    .setCustomId("server_select_menu")
    .setPlaceholder("Select your server")
    .addOptions(serverOptions);

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
    ephemeral: true,
  });
}
