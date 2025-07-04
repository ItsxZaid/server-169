import { EmbedBuilder, TextChannel, ChannelType } from "discord.js";
import { CronJob } from "../types";
import { and, gte, lte, eq } from "drizzle-orm";
import { buff_bookings } from "../db/schema";
import { startOfDay, endOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const TIMEZONE = "UTC";

const job: CronJob = {
  meta: {
    id: "buff-reminder",
    schedule: "*/2 * * * *",
  },
  execute: async (client, db) => {
    const now = new Date();
    const utcHour = now.getUTCHours().toString().padStart(2, "0");
    const utcMinute = now.getUTCMinutes().toString().padStart(2, "0");

    console.log(
      `[CRON] Checking for upcoming buffs to remind... (UTC: ${utcHour}:${utcMinute})`,
    );

    const reminderWindowStart = new Date(now.getTime() + 5 * 60 * 1000);
    const reminderWindowEnd = new Date(now.getTime() + 8 * 60 * 1000);

    try {
      const upcomingBuffs = await db
        .select()
        .from(buff_bookings)
        .where(
          and(
            gte(buff_bookings.slot_time, reminderWindowStart.toISOString()),
            lte(buff_bookings.slot_time, reminderWindowEnd.toISOString()),
            eq(buff_bookings.notification_sent, false),
          ),
        );

      if (upcomingBuffs.length === 0) {
        console.log("[CRON] No upcoming buffs found in the reminder window.");
        return;
      }

      const guild = await client.guilds.fetch(process.env.SERVER_ID!);
      const buffChannel = guild.channels.cache.find(
        (c) => c.name === "buff-management" && c.type === ChannelType.GuildText,
      ) as TextChannel | undefined;

      if (!buffChannel) {
        console.error("[CRON] Buff channel not found.");
        return;
      }

      for (const buff of upcomingBuffs) {
        console.log(
          `[CRON] Found upcoming buff: ${buff.buff_type} for user ${buff.booked_by_discord_id}`,
        );

        const reminderEmbed = new EmbedBuilder()
          .setColor(0x00ff99)
          .setTitle(`💪 Buff Reminder: ${buff.buff_type}`)
          .setDescription(
            `<@${buff.booked_by_discord_id}>, your buff is starting in **~5 minutes**. Be prepared!`,
          )
          .setTimestamp(new Date(buff.slot_time));

        await buffChannel.send({
          content: `<@${buff.booked_by_discord_id}>`,
          embeds: [reminderEmbed],
        });

        console.log(
          `[CRON] Sent buff reminder for booking ID ${buff.id} to channel ${buffChannel.name}.`,
        );

        await db
          .update(buff_bookings)
          .set({ notification_sent: true })
          .where(eq(buff_bookings.id, buff.id));

        console.log(`[CRON] Marked buff ${buff.id} as reminder_sent.`);
      }
    } catch (error) {
      console.error(
        "[CRON] An error occurred during buff-reminder job:",
        error,
      );
    }
  },
};

export default job;
