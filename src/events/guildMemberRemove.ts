import { GuildMember } from "discord.js";
import type { Client } from "discord.js";
import { DB } from "../types";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export const name = "guildMemberRemove";
export const once = false;

export async function execute(client: Client, member: GuildMember, db: DB) {
  try {
    const existingUser = await db.query.users.findFirst({
      where: eq(users.user_discord_id, member.id),
    });

    if (existingUser) {
      await db.delete(users).where(eq(users.user_discord_id, member.id));
      console.log(
        `[DB] Deleted record for user ${member.user.tag} (${member.id}) who left the server.`,
      );
    } else {
      console.log(
        `[INFO] User ${member.user.tag} (${member.id}) left, but had no record in the database.`,
      );
    }
  } catch (err) {
    console.error(
      `[ERROR] Failed to delete user record for ${member.user.tag} (${member.id}):`,
      err,
    );
  }
}
