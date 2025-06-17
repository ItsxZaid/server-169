import {
  SlashCommandBuilder,
  CommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ChannelType,
  TextChannel,
  CategoryChannel,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("register-event")
  .setDescription(
    "Opens the event registration form. Use only in Events and reminders channel",
  );

export async function execute(interaction: CommandInteraction) {
  if (
    !interaction.inGuild() ||
    !interaction.channel ||
    interaction.channel.type !== ChannelType.GuildText
  ) {
    await interaction.reply({
      content: "This command can only be used in a server's text channel.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const channel = interaction.channel as TextChannel;
  const category = channel.parent as CategoryChannel;

  if (!category || channel.name !== "reminders-and-events") {
    await interaction.reply({
      content:
        "This command can only be run in a `reminders-and-events` channel inside a valid Server or Alliance category.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  let eventType: "server-wide" | "alliance-specific" | null = null;
  const categoryName = category.name.toLowerCase();

  if (categoryName === "server 169") {
    eventType = "server-wide";
  } else if (categoryName.includes("alliance")) {
    eventType = "alliance-specific";
  }

  if (!eventType) {
    await interaction.reply({
      content:
        "This command was run in an unrecognized category. Please use it within the main 'Server 169' or a specific 'Alliance' category.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const customId = `register_event_modal:${eventType}[${interaction.user.id}]`;

  const registerButton = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel("🚀 Launch Event Form")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    registerButton,
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Event Registration")
    .setDescription(
      "Ready to create a new event?\n\nClick the button below to launch the registration form and provide the event details.",
    )
    .addFields({
      name: "Event Scope",
      value: `You are creating a **${
        eventType === "server-wide" ? "Server-Wide" : "Alliance-Specific"
      }** event.`,
    })
    .setFooter({
      text: "This form is just for you. Others can't see this message.",
    });

  await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: [MessageFlags.Ephemeral],
  });
}
