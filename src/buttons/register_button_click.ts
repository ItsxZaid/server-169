import {
  ActionRowBuilder,
  ButtonInteraction,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { DB } from "../types";

export async function execute(interaction: ButtonInteraction, db: DB) {
  try {
    const modal = new ModalBuilder()
      .setCustomId(`registration_modal_submit`)
      .setTitle("Registration: Step 1");

    const nameInput = new TextInputBuilder()
      .setCustomId("in_game_name_input")
      .setLabel("What is your in-game name?")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const nameActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);

    modal.addComponents(nameActionRow);

    await interaction.showModal(modal);
  } catch (error) {
    console.error("Failed to show registration modal:", error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "There was an error showing the registration form.",
        flags: [MessageFlags.Ephemeral],
      });
    } else {
      await interaction.reply({
        content:
          "There was an error opening the registration form. Please try again later.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
}
