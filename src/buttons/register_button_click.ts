// src/interactions/buttons/registerButtonClick.ts

import {
  ActionRowBuilder,
  ButtonInteraction,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { DB } from "../types";
import { users } from "../db/schema";
import { and, eq } from "drizzle-orm";

export async function execute(interaction: ButtonInteraction, db: DB) {
  const targetUserId = interaction.customId.split(":")[1];

  if (interaction.user.id !== targetUserId) {
    await interaction.reply({
      content: "This registration button is not for you.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.user_discord_id, targetUserId));

  if (existingUser.length > 0) {
    const user = existingUser[0];

    if (user.status === "pending") {
      await interaction.reply({
        content:
          "⏳ You have already submitted your registration. It is currently awaiting approval.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    if (user.status === "approved") {
      await interaction.reply({
        content: "✅ You are already registered and approved.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
  }

  try {
    const modal = new ModalBuilder()
      .setCustomId(`registration_modal_submit:${interaction.user.id}`)
      .setTitle("Server Registration");

    const nameInput = new TextInputBuilder()
      .setCustomId("in_game_name_input")
      .setLabel("What is your in-game name?")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("e.g., Player123");

    const firstActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);

    modal.addComponents(firstActionRow);

    await interaction.showModal(modal);
  } catch (error) {
    console.error("Failed to show registration modal:", error);
    await interaction.reply({
      content:
        "There was an error opening the registration form. Please try again later.",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
