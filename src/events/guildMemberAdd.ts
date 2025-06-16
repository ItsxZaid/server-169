import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildMember,
  MessageFlags,
  TextChannel,
} from "discord.js";
import type { Client } from "discord.js";
import { DB } from "../types";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export const name = "guildMemberAdd";
export const once = false;

export async function execute(client: Client, member: GuildMember, db: DB) {
  const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
  if (!welcomeChannelId) {
    return;
  }

  const welcomeChannel = member.guild.channels.cache.get(welcomeChannelId) as
    | TextChannel
    | undefined;

  try {
    const existingUser = await db.query.users.findFirst({
      where: eq(users.user_discord_id, member.id),
    });

    if (existingUser) {
      if (welcomeChannel) {
        await welcomeChannel.send(
          `Glad to see you back, @${member.user.username}!`,
        );
      }
      await member.send(
        `Welcome back to ${member.guild.name}! We're happy to have you again.`,
      );
    } else {
      if (welcomeChannel) {
        await welcomeChannel.send(`
               👋 Welcome <@${member.id}>! 🎉 We're excited to have you here.`);

        const registerButton = new ButtonBuilder()
          .setCustomId(`register_button_click:${member.id}`)
          .setLabel("🚀 Complete Your Registration")
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          registerButton,
        );

        await welcomeChannel.send({
          content: `<@${member.id}>! Click the button below to register and unlock the server.`,
          components: [row],
        });
      }

      await db.insert(users).values({
        user_discord_id: member.id,
        server: 169,
        rank: "R1",
        alliance: "none",
        status: "onboarding",
      });
    }
  } catch (err) {
    console.error(
      `[ERROR] An error occurred during the guildMemberAdd event for ${member.user.tag}:`,
      err,
    );
  }
}
