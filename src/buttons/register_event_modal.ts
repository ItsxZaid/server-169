import {
  ActionRowBuilder,
  ButtonInteraction,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { CustomClient, DB } from "../types";

export async function execute(
  interaction: ButtonInteraction,
  db: DB,
  client: CustomClient,
) {
  try {
    const customId = interaction.customId;
    const firstColonIndex = customId.indexOf(":");
    const bracketIndex = customId.indexOf("[");

    const eventType = customId.substring(firstColonIndex + 1, bracketIndex);
    const targetUserId = customId.substring(
      bracketIndex + 1,
      customId.length - 1,
    );

    if (interaction.user.id !== targetUserId) {
      await interaction.reply({
        content: "You are not authorized to use this button.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const modalCustomId = `register_event_modal:${eventType}[${targetUserId}]`;

    const modal = new ModalBuilder()
      .setCustomId(modalCustomId)
      .setTitle("Register a New Event");

    const eventNameInput = new TextInputBuilder()
      .setCustomId("eventName")
      .setLabel("Event Name")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("e.g., Server vs Server War")
      .setRequired(true);

    const descriptionInput = new TextInputBuilder()
      .setCustomId("eventDescription")
      .setLabel("Event Description & Rules")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(
        "Describe the event, what to expect, and list any rules for participation.",
      )
      .setRequired(true);

    const dateInput = new TextInputBuilder()
      .setCustomId("eventDate")
      .setLabel("Date of the Event")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("YYYY-MM-DD (e.g., 2025-08-15)")
      .setRequired(true);

    const timeInput = new TextInputBuilder()
      .setCustomId("eventTime")
      .setLabel("Time of the Event (in UTC)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("HH:MM (e.g., 14:30 for 2:30 PM UTC)")
      .setRequired(true);

    const imageUrlInput = new TextInputBuilder()
      .setCustomId("imageUrl")
      .setLabel("Image URL (Optional)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("https://your-image-url.com/banner.png")
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(eventNameInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(dateInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(timeInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(imageUrlInput),
    );

    await interaction.showModal(modal);
  } catch (error) {
    console.error("Error showing event registration modal:", error);
    await interaction.reply({
      content:
        "There was an error trying to open the event form. Please try again later.",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
