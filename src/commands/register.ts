import {
  SlashCommandBuilder,
  CommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("register")
  .setDescription("Manually triggers the registration prompt for yourself.");

export async function execute(interaction: CommandInteraction) {
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
}
