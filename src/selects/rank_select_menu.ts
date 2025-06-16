import {
  StringSelectMenuInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ActionRow,
  StringSelectMenuComponent,
  ComponentType,
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

  const selectedRank = interaction.values[0];

  const [rankRow, allianceRow, serverRow] = interaction.message
    .components as ActionRow<StringSelectMenuComponent>[];

  const originalRankMenu = rankRow.components[0];
  const updatedRankOptions = originalRankMenu.options.map((option) => {
    return {
      ...option,
      default: option.value === selectedRank,
    };
  });
  const updatedRankMenu =
    StringSelectMenuBuilder.from(originalRankMenu).setOptions(
      updatedRankOptions,
    );

  const updatedRankActionRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      updatedRankMenu,
    );

  const originalAllianceMenu = allianceRow.components[0];
  const updatedAllianceMenu = StringSelectMenuBuilder.from(originalAllianceMenu)
    .setPlaceholder("2. Select your alliance")
    .setDisabled(false);

  const updatedAllianceRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      updatedAllianceMenu,
    );

  const originalServerMenu = serverRow.components[0];
  const updatedServerMenu = StringSelectMenuBuilder.from(originalServerMenu)
    .setPlaceholder("3. Select your server (alliance first)")
    .setDisabled(true);

  const updatedServerRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      updatedServerMenu,
    );

  const userDiscordId = interaction.user.id;

  await db
    .update(users)
    .set({ rank: selectedRank as any })
    .where(eq(users.user_discord_id, userDiscordId));

  await interaction.editReply({
    components: [updatedRankActionRow, updatedAllianceRow, updatedServerRow],
  });

  console.log(
    `[RankSelect] Updated message for ${interaction.user.tag}. Alliance menu is now enabled.`,
  );
}
