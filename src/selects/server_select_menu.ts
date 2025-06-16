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

  const selectedServerId = interaction.values[0];
  const userDiscordId = interaction.user.id;

  await db
    .update(users)
    .set({
      server: parseInt(selectedServerId, 10),
      status: "pending",
    })
    .where(eq(users.user_discord_id, userDiscordId));

  await interaction.editReply({
    content:
      "✅ Thank you! Your registration is complete and is now pending approval.",
    components: [],
  });

  console.log(
    `[ServerSelect] Finalized registration for ${interaction.user.tag} (${userDiscordId}). Server ID: ${selectedServerId}. Status set to 'pending'.`,
  );
}
