import {
  ButtonInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} from "discord.js";
import { DB, CustomClient } from "../types";

export async function execute(
  interaction: ButtonInteraction,
  db: DB,
  client: CustomClient,
) {
  try {
    const [, dateInput] = interaction.customId.split(":");

    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: `Please choose the type of buff you need for **${dateInput}**.`,
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`buff_book_type_select:${dateInput}`)
            .setPlaceholder("1. Select the type of buff")
            .addOptions([
              { label: "Research Buff", value: "research" },
              { label: "Training Buff", value: "training" },
              { label: "Building Buff", value: "building" },
            ]),
        ),
      ],
    });
  } catch (error) {
    console.error("Error initiating buff booking:", error);
    await interaction.followUp({
      content: "An error occurred while preparing the booking form.",
      ephemeral: true,
    });
  }
}
