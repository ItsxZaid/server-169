import { EmbedBuilder } from "discord.js";
import { and, gte, lte, eq } from "drizzle-orm";
import { CronJob } from "../types";
import { buff_bookings } from "../db/schema";
import { formatInTimeZone } from "date-fns-tz";

const TIMEZONE = "Europe/London";

const job: CronJob = {
  meta: {
    id: "buff-notifier",
    schedule: "* * * * *",
  },
  execute: async (client, db) => {
    const now = new Date();
    const notificationWindowStart = new Date(now.getTime() + 4 * 60 * 1000);
    const notificationWindowEnd = new Date(now.getTime() + 5 * 60 * 1000);

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

      const buffGiverRole = await client.guilds
        .fetch(process.env.SERVER_ID!)
        .then((guild) =>
          guild.roles.cache.find((role) => role.name === "BUFF_GIVER"),
        );

      if (!buffGiverRole) {
        return;
      }

      for (const booking of upcomingBookings) {
        let giverId = booking.giver_discord_id;

        if (!giverId) {
          const membersWithRole = await client.guilds
            .fetch(process.env.SERVER_ID!)
            .then((guild) => guild.members.fetch({ withPresences: true }))
            .then((members) =>
              members.filter(
                (m) =>
                  m.roles.cache.has(buffGiverRole.id) &&
                  m.presence?.status === "online",
              ),
            );

          if (membersWithRole.size > 0) {
            giverId = membersWithRole.random()!.id;
          } else {
            giverId = process.env.DEFAULT_BUFF_GIVER_ID!;
          }
        }

        if (!giverId) {
          continue;
        }

        const giver = await client.users.fetch(giverId).catch(() => null);
        const requester = await client.users
          .fetch(booking.booked_by_discord_id)
          .catch(() => null);

        if (giver && requester) {
          const slotTime = new Date(booking.slot_time);
          const formattedTime = formatInTimeZone(
            slotTime,
            TIMEZONE,
            "HH:mm 'UK Time'",
          );
          const buffTypeDisplay =
            booking.buff_type.charAt(0).toUpperCase() +
            booking.buff_type.slice(1);

          const giverEmbed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle("✨ Buff Duty Reminder")
            .setDescription(`You have a buff to give in **5 minutes!**`)
            .addFields(
              {
                name: "👤 User to Buff",
                value: `${requester} (${requester.tag})`,
                inline: true,
              },
              {
                name: "🛠️ Buff Type",
                value: buffTypeDisplay,
                inline: true,
              },
              {
                name: "⏰ Time",
                value: formattedTime,
                inline: true,
              },
            );

          await giver.send({ embeds: [giverEmbed] });

          const requesterEmbed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle(`🔔 Reminder: Your ${buffTypeDisplay} Buff is Soon!`)
            .setDescription(
              `Your scheduled **${buffTypeDisplay}** buff is in **5 minutes** at **${formattedTime}**.`,
            )
            .setFooter({ text: "Please be online and ready!" });

          await requester.send({ embeds: [requesterEmbed] });

          await db
            .update(buff_bookings)
            .set({ notification_sent: true, giver_discord_id: giverId })
            .where(eq(buff_bookings.id, booking.id));
        }
      }
    } catch (error) {}
  },
};

export default job;
