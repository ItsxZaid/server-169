import {
  ActionRowBuilder,
  ButtonInteraction,
  EmbedBuilder,
  MessageFlags,
  ButtonStyle,
  ButtonBuilder,
} from "discord.js";
import { CustomClient, DB } from "../types";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export async function execute(
  interaction: ButtonInteraction,
  db: DB,
  client: CustomClient,
) {
  const [action, userId] = interaction.customId.split(":");
  const registerRoleId = process.env.REGISTER_ROLE_ID;

  try {
    await interaction.deferUpdate();

    await db
      .update(users)
      .set({
        rank: "R1",
        status: "onboarding",
      })
      .where(eq(users.user_discord_id, userId));

    const deniedUser = await db
      .select()
      .from(users)
      .where(eq(users.user_discord_id, userId))
      .limit(1);

    if (deniedUser.length > 0) {
      const member = await interaction.guild?.members.fetch(userId);
      if (member && registerRoleId) {
        const registeredRole =
          interaction.guild?.roles.cache.get(registerRoleId);
        if (registeredRole) {
          await member.roles.set([registeredRole.id]);
        } else {
          await member.roles.remove(
            member.roles.cache
              .filter((role) => role.id !== interaction.guild?.id)
              .map((role) => role.id),
          );
        }
      }

      await interaction.editReply({
        content: `Registration denied for <@${userId}>.`,
        components: [],
      });

      const user = await client.users.fetch(userId).catch(() => null);
      if (user) {
        await user.send(
          "Your registration was denied. Please contact an admin for more information.",
        );
      }
    } else {
      await interaction.editReply({
        content: "User not found.",
        components: [],
      });
    }
  } catch (error) {
    console.error("Error denying registration:", error);
    await interaction.editReply({
      content: "An error occurred while denying registration.",
      components: [],
    });
  }
}
