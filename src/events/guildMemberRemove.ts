import { GuildMember } from "discord.js";
import type { Client } from "discord.js";
import { DB } from "../types";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export const name = "guildMemberRemove";
export const once = false;

export async function execute(client: Client, member: GuildMember, db: DB) {
  console.log(
    `[EVENT] guildMemberRemove triggered for: ${member.user.tag} (${member.id})`,
  );

  try {
    const existingUser = await db.query.users.findFirst({
      where: eq(users.user_discord_id, member.id),
    });

    if (existingUser) {
      await db.delete(users).where(eq(users.user_discord_id, member.id));
      console.log(
        `[DB] Successfully deleted record for user ${member.user.tag} (${member.id}) who left the server.`,
      );

      const logChannelId = process.env.LOG_CHANNEL_ID;
      if (logChannelId) {
        const logChannel = member.guild.channels.cache.get(logChannelId);
        if (logChannel && logChannel.isTextBased()) {
          await logChannel.send(
            `📤 **Member Left:** ${member.user.tag} (${member.id})\n` +
              `**Database:** Record removed\n` +
              `**Time:** ${new Date().toISOString()}`,
          );
        }
      }
    } else {
      console.log(
        `[INFO] User ${member.user.tag} (${member.id}) left, but had no record in the database.`,
      );
    }
  } catch (error) {
    console.error(
      `[ERROR] Failed to process guildMemberRemove for ${member.user.tag} (${member.id}):`,
      error,
    );

    const errorChannelId = process.env.ERROR_CHANNEL_ID;
    if (errorChannelId) {
      const errorChannel = member.guild.channels.cache.get(errorChannelId);
      if (errorChannel && errorChannel.isTextBased()) {
        await errorChannel.send(
          `❌ **Error in guildMemberRemove:**\n` +
            `**User:** ${member.user.tag} (${member.id})\n` +
            `**Error:** ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }
  }
}
