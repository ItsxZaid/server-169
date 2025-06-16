import {
  StringSelectMenuInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ActionRow,
  StringSelectMenuComponent,
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

  const selectedAllianceId = interaction.values[0];
  const userDiscordId = interaction.user.id;

  const [rankRow, allianceRow, serverRow] = interaction.message
    .components as ActionRow<StringSelectMenuComponent>[];

  const originalRankMenu = rankRow.components[0];
  const updatedRankActionRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      StringSelectMenuBuilder.from(originalRankMenu),
    );

  const originalAllianceMenu = allianceRow.components[0];
  const updatedAllianceOptions = originalAllianceMenu.options.map((option) => ({
    ...option,
    default: option.value === selectedAllianceId,
  }));
  const updatedAllianceMenu = StringSelectMenuBuilder.from(
    originalAllianceMenu,
  ).setOptions(updatedAllianceOptions);
  const updatedAllianceRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      updatedAllianceMenu,
    );

  const originalServerMenu = serverRow.components[0];
  const updatedServerMenu = StringSelectMenuBuilder.from(originalServerMenu)
    .setPlaceholder("3. Select your server")
    .setDisabled(false);
  const updatedServerRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      updatedServerMenu,
    );

  await db
    .update(users)
    .set({ alliance: selectedAllianceId })
    .where(eq(users.user_discord_id, userDiscordId));

  await interaction.editReply({
    components: [updatedRankActionRow, updatedAllianceRow, updatedServerRow],
  });

  console.log(
    `[AllianceSelect] Updated alliance to '${selectedAllianceId}' for ${interaction.user.tag}. Server menu is now enabled.`,
  );
}
