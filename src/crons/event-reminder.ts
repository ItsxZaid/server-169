import {
  EmbedBuilder,
  TextChannel,
  ChannelType,
  CategoryChannel,
} from "discord.js";
import { and, gte, lte, eq } from "drizzle-orm";
import { CronJob } from "../types";
import { events } from "../db/schema";

const job: CronJob = {
  meta: {
    id: "event-reminder",
    schedule: "*/2 * * * *",
  },
  execute: async (client, db) => {
    const now = new Date();
    const utcHour = now.getUTCHours().toString().padStart(2, "0");
    const utcMinute = now.getUTCMinutes().toString().padStart(2, "0");

    console.log(
      `[CRON] Checking for upcoming events to remind... (UTC: ${utcHour}:${utcMinute})`,
    );

    const reminderWindowStart = new Date(now.getTime() + 14 * 60 * 1000);
    const reminderWindowEnd = new Date(now.getTime() + 16 * 60 * 1000);

    try {
      const upcomingEvents = await db
        .select()
        .from(events)
        .where(
          and(
            gte(events.event_time, reminderWindowStart.toISOString()),
            lte(events.event_time, reminderWindowEnd.toISOString()),
            eq(events.reminder_sent, false),
          ),
        );

      if (upcomingEvents.length === 0) {
        console.log("[CRON] No upcoming events found in the reminder window.");
        return;
      }

      for (const event of upcomingEvents) {
        console.log(
          `[CRON] Found upcoming event: ${event.title} (ID: ${event.id})`,
        );

        let targetChannel: TextChannel | undefined;
        const guild = await client.guilds.fetch(process.env.SERVER_ID!);

        if (event.type === "server-wide") {
          const serverCategory = guild.channels.cache.find(
            (c) =>
              c.type === ChannelType.GuildCategory &&
              c.name.toLowerCase() === "server 169",
          ) as CategoryChannel;
          if (serverCategory) {
            targetChannel = serverCategory.children.cache.find(
              (c) =>
                c.name === "reminders-and-events" &&
                c.type === ChannelType.GuildText,
            ) as TextChannel;
          }
        } else if (
          event.type === "alliance-specific" &&
          event.alliance_target
        ) {
          const allianceCategory = guild.channels.cache.find(
            (c) =>
              c.type === ChannelType.GuildCategory &&
              c.id === event.alliance_target,
          ) as CategoryChannel;
          if (allianceCategory) {
            targetChannel = allianceCategory.children.cache.find(
              (c) =>
                c.name === "reminders-and-events" &&
                c.type === ChannelType.GuildText,
            ) as TextChannel;
          }
        }

        if (targetChannel) {
          const reminderEmbed = new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle(`⏰ Event Reminder: ${event.title}`)
            .setDescription(
              `This event is starting in approximately **15 minutes!** Get ready!`,
            )
            .setTimestamp(new Date(event.event_time));

          await targetChannel.send({
            content: "@everyone",
            embeds: [reminderEmbed],
          });

          console.log(
            `[CRON] Sent reminder for event ${event.id} to channel ${targetChannel.name}.`,
          );

          await db
            .update(events)
            .set({ reminder_sent: true })
            .where(eq(events.id, event.id));

          console.log(`[CRON] Marked event ${event.id} as reminder_sent.`);
        } else {
          console.error(
            `[CRON] Could not find a target channel for event ${event.id}.`,
          );
          await db
            .update(events)
            .set({ reminder_sent: true })
            .where(eq(events.id, event.id));
        }
      }
    } catch (error) {
      console.error(
        "[CRON] An error occurred during the event-reminder job:",
        error,
      );
    }
  },
};

export default job;
