import {
  SlashCommandBuilder,
  CommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ChatInputCommandInteraction,
} from "discord.js";
import { CustomClient, DB } from "../types";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export const data = new SlashCommandBuilder()
  .setName("register")
  .setDescription("Manually triggers the registration prompt for yourself.");

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient,
  db: DB,
) {
  try {
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.user_discord_id, interaction.user.id))
      .limit(1);

    if (existingUser.length === 0) {
      await db.insert(users).values({
        user_discord_id: interaction.user.id,
        server: "169",
        in_game_name: interaction.user.username,
        rank: "R1",
        alliance: "none",
        status: "onboarding",
      });
      console.log(
        `[Register Command] Created new user record for ${interaction.user.tag}`,
      );
    }

    const registerButton = new ButtonBuilder()
      .setCustomId(`register_button_click:${interaction.user.id}`)
      .setLabel("🚀 Complete Your Registration")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      registerButton,
    );

    await interaction.reply({
      content: "Click the button below to start or restart your registration.",
      components: [row],
      flags: [MessageFlags.Ephemeral],
    });
  } catch (error) {
    console.error(
      `[ERROR] Failed to execute /register command for ${interaction.user.tag}:`,
      error,
    );
    await interaction.reply({
      content:
        "There was an error processing your request. Please try again later.",
      ephemeral: true,
    });
  }
}
