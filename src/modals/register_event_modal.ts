import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalSubmitInteraction,
  TextChannel,
} from "discord.js";
import { eq } from "drizzle-orm";
import { DB } from "../types";
import { events, NewEvent, users } from "../db/schema";
import { isValid } from "date-fns";

export async function execute(interaction: ModalSubmitInteraction, db: DB) {
  console.log(
    `[EventModalSubmit] Interaction received from user: ${interaction.user.tag} (${interaction.user.id})`,
  );

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  console.log(`[EventModalSubmit] Deferred ephemeral reply.`);

  try {
    const [action, raw] = interaction.customId.split(":");
    const match = raw.match(/^(.+)\[(.+)\]$/);

    if (!match) throw new Error("Invalid customId format");

    const [, eventType, targetUserId] = match;

    console.log(
      `[EventModalSubmit] Parsed customId: action=${action}, eventType=${eventType}, userId=${targetUserId}`,
    );

    if (interaction.user.id !== targetUserId) {
      console.warn(
        `[EventModalSubmit] User mismatch! Interaction by ${interaction.user.id}, expected ${targetUserId}.`,
      );
      await interaction.editReply({
        content:
          "Error: You cannot submit a form that was opened by someone else.",
      });
      return;
    }

    const eventName = interaction.fields.getTextInputValue("eventName");
    const eventDescriptionAndRules =
      interaction.fields.getTextInputValue("eventDescription");
    const imageUrl = interaction.fields.getTextInputValue("imageUrl");
    const eventDate = interaction.fields.getTextInputValue("eventDate");
    const eventTime = interaction.fields.getTextInputValue("eventTime");
    console.log(
      `[EventModalSubmit] Retrieved form data: Name=${eventName}, Date=${eventDate}, Time=${eventTime}`,
    );

    const [day, month, year] = eventDate.split("-").map(Number);
    const [hour, minute] = eventTime.split(":").map(Number);

    const eventDateTime = new Date(
      Date.UTC(year, month - 1, day, hour, minute),
    );

    if (!isValid(eventDateTime)) {
      await interaction.editReply(
        "The date or time you entered appears to be invalid. Please use the format `DD-MM-YYYY` and `HH:MM`.",
      );
      return;
    }

    const creatorResult = await db
      .select({ alliance: users.alliance })
      .from(users)
      .where(eq(users.user_discord_id, interaction.user.id))
      .limit(1);

    if (creatorResult.length === 0) {
      console.warn(
        `[EventModalSubmit] Creator ${interaction.user.id} not found in the database.`,
      );
      await interaction.editReply(
        "Error: Could not find your user registration. Please ensure you are registered first.",
      );
      return;
    }
    const creator = creatorResult[0];
    console.log(
      `[EventModalSubmit] Found creator details: Alliance=${creator.alliance}`,
    );

    const newEventData: NewEvent = {
      title: eventName,
      description: eventDescriptionAndRules,
      type: eventType as "server-wide" | "alliance-specific",
      alliance_target:
        eventType === "alliance-specific" ? creator.alliance : null,
      event_time: eventDateTime.toISOString(), // Save as ISO string (UTC)
      created_by_discord_id: interaction.user.id,
      imageUrl: imageUrl || null,
    };

    const createdEvent = await db
      .insert(events)
      .values(newEventData)
      .returning();
    console.log(
      `[EventModalSubmit] Inserted new event into DB. Rows returned: ${createdEvent.length}`,
    );

    if (createdEvent.length === 0) {
      console.error(
        "[EventModalSubmit] Database insert failed to return the new event.",
      );
      await interaction.editReply(
        "There was a critical error saving the event to the database.",
      );
      return;
    }
    const eventId = createdEvent[0].id;

    const separator = "Rules:";
    const descriptionParts = eventDescriptionAndRules.split(separator);
    const infoText = descriptionParts[0].trim();
    const rulesText =
      descriptionParts.length > 1 ? descriptionParts[1].trim() : null;

    const announcementEmbed = new EmbedBuilder()
      .setColor(eventType === "server-wide" ? 0xed4245 : 0x3498db)
      .setTitle(`${eventName}`)
      .setDescription(infoText)
      .addFields(
        { name: "🗓️ Date", value: eventDate, inline: true },
        { name: "⏰ Time", value: `${eventTime} UTC`, inline: true },
        {
          name: "Scope",
          value: eventType === "server-wide" ? "Server-Wide" : `Alliance`,
          inline: true,
        },
      )
      .setTimestamp(eventDateTime);

    if (rulesText) {
      announcementEmbed.addFields({
        name: "📜 Rules & Info",
        value: rulesText,
      });
    }

    if (imageUrl) {
      announcementEmbed.setImage(imageUrl);
    }

    const channel = interaction.channel;
    if (channel && channel.type === ChannelType.GuildText) {
      await (channel as TextChannel).send({
        embeds: [announcementEmbed],
        components: [],
      });
      console.log(
        `[EventModalSubmit] Public announcement sent to channel ${interaction.channelId} for event ${eventId}.`,
      );
    } else {
      console.error(
        `[EventModalSubmit] Could not send message to channel ${interaction.channelId} because it is not a text channel.`,
      );
    }

    await interaction.editReply({
      content: `✅ Your event, "${eventName}", has been successfully created and announced.`,
    });
    console.log(`[EventModalSubmit] Final ephemeral confirmation sent.`);
  } catch (error) {
    console.error("[EventModalSubmit] A critical error occurred:", error);
    await interaction.editReply({
      content:
        "A critical error occurred while creating your event. Please contact an admin.",
    });
  }
}
