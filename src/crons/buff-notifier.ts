import { EmbedBuilder } from "discord.js";
import { and, gte, lte, eq } from "drizzle-orm";
import { CronJob } from "../types";
import { buff_bookings } from "../db/schema";

const job: CronJob = {
  meta: {
    id: "buff-notifier",
    schedule: "* * * * *",
  },
  execute: async (client, db) => {
    console.log("[CRON] Checking for upcoming buff duties...");

    const now = new Date();

    const notificationWindowStart = new Date(now.getTime() + 5 * 60 * 1000);
    const notificationWindowEnd = new Date(now.getTime() + 6 * 60 * 1000);

    try {
      const upcomingBookings = await db
        .select()
        .from(buff_bookings)
        .where(
          and(
            gte(buff_bookings.slot_time, notificationWindowStart.toISOString()),
            lte(buff_bookings.slot_time, notificationWindowEnd.toISOString()),
            eq(buff_bookings.notification_sent, false),
          ),
        );

      if (upcomingBookings.length === 0) {
        return;
      }

      for (const booking of upcomingBookings) {
        const giverId =
          booking.giver_discord_id || process.env.DEFAULT_BUFF_GIVER_ID;
        const requesterId = booking.booked_by_discord_id;

        if (!giverId) {
          console.error(
            `[CRON] No buff giver ID found for booking ${booking.id}.`,
          );
          continue;
        }

        const giver = await client.users.fetch(giverId);
        const requester = await client.users.fetch(requesterId);

        if (giver) {
          const reminderEmbed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle("Buff Duty Reminder")
            .setDescription(`You have a buff to give in **5 minutes!**`)
            .addFields(
              {
                name: "User to Buff",
                value: `${requester} (${requester.tag})`,
              },
              {
                name: "Buff Type",
                value:
                  booking.buff_type.charAt(0).toUpperCase() +
                  booking.buff_type.slice(1),
              },
              {
                name: "Time",
                value: `<t:${Math.floor(new Date(booking.slot_time).getTime() / 1000)}:T>`,
              },
            );

          await giver.send({ embeds: [reminderEmbed] });

          await db
            .update(buff_bookings)
            .set({ notification_sent: true })
            .where(eq(buff_bookings.id, booking.id));

          console.log(
            `[CRON] Sent buff reminder to ${giver.tag} for booking ${booking.id}.`,
          );
        }
      }
    } catch (error) {
      console.error(
        "[CRON] An error occurred during the buff-notifier job:",
        error,
      );
    }
  },
};

export default job;
