import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
  ChannelType,
  CategoryChannel,
  MessageFlags,
  GuildMember,
} from "discord.js";
import { CronJob } from "../types";
import { format, addDays, subDays, startOfDay, endOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { and, gte, lte } from "drizzle-orm";
import { buff_bookings, NewBuffBooking } from "../db/schema";

const TIMEZONE = "Europe/London";
type BuffType = NewBuffBooking["buff_type"];

const job: CronJob = {
  meta: {
    id: "persistent-buttons",
    schedule: "*/5 * * * *",
  },
  execute: async (client, db) => {
    const guildId = process.env.SERVER_ID;
    if (!guildId) return;

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    const buffChannelName = "buff-management";
    const buffChannel = guild.channels.cache.find(
      (c) => c.name === buffChannelName && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;

    if (buffChannel) {
      try {
        const messages = await buffChannel.messages.fetch({ limit: 100 });
        const botMessages = messages.filter(
          (m) =>
            m.author.id === client.user?.id &&
            m.embeds[0]?.title?.includes("Buff Schedule"),
        );

        for (const msg of botMessages.values()) {
          await msg.delete().catch(() => {});
        }

        const targetDate = new Date();
        const dayStart = startOfDay(toZonedTime(targetDate, TIMEZONE));
        const dayEnd = endOfDay(dayStart);

        const bookingsForDay = await db
          .select()
          .from(buff_bookings)
          .where(
            and(
              gte(buff_bookings.slot_time, dayStart.toISOString()),
              lte(buff_bookings.slot_time, dayEnd.toISOString()),
            ),
          );

        const userIds = [
          ...new Set(bookingsForDay.map((b) => b.booked_by_discord_id)),
        ];
        const membersMap = new Map<string, string>();
        if (userIds.length > 0) {
          const members = await guild.members.fetch({ user: userIds });
          members.forEach((member) =>
            membersMap.set(member.id, member.displayName),
          );
        }

        const createScheduleEmbed = (
          buffType: BuffType,
          title: string,
          color: number,
        ) => {
          const typeBookings = bookingsForDay.filter(
            (b) => b.buff_type === buffType,
          );
          const bookingsMap = new Map();
          typeBookings.forEach((booking) => {
            const londonTime = toZonedTime(booking.slot_time, TIMEZONE);
            const hour = londonTime.getHours();
            bookingsMap.set(hour, booking);
          });

          const scheduleTable: string[] = [];
          for (let hour = 0; hour < 24; hour++) {
            const timeString = `${String(hour).padStart(2, "0")}:00`;
            const booking = bookingsMap.get(hour);
            const displayName = booking
              ? membersMap.get(booking.booked_by_discord_id)
              : null;
            const displayValue = booking
              ? `✅ ${displayName || `<@${booking.booked_by_discord_id}>`}`
              : `⬜ Available`;
            scheduleTable.push(`${timeString} : ${displayValue}`);
          }
          const description = `\`\`\`\n${scheduleTable.join("\n")}\n\`\`\``;

          return new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setDescription(description)
            .setFooter({
              text: `Schedule for ${format(
                targetDate,
                "EEEE, MMMM d",
              )} | All times are UK.`,
            });
        };

        const researchEmbed = createScheduleEmbed(
          "research",
          "🔬 Research Buff Schedule",
          0x3498db,
        );
        const trainingEmbed = createScheduleEmbed(
          "training",
          "⚔️ Training Buff Schedule",
          0xe74c3c,
        );
        const buildingEmbed = createScheduleEmbed(
          "building",
          "🏗️ Building Buff Schedule",
          0xf1c40f,
        );

        const prevDay = subDays(targetDate, 1);
        const nextDay = addDays(targetDate, 1);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`buffcal_nav:${format(prevDay, "yyyy-MM-dd")}`)
            .setLabel("⬅️ Previous Day")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(
              `buff_book_slot_init:${format(targetDate, "yyyy-MM-dd")}`,
            )
            .setLabel("✍️ Book a Buff Slot")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`buffcal_nav:${format(nextDay, "yyyy-MM-dd")}`)
            .setLabel("Next Day ➡️")
            .setStyle(ButtonStyle.Secondary),
        );

        await buffChannel.send({
          embeds: [researchEmbed, trainingEmbed, buildingEmbed],
          components: [row],
          flags: [MessageFlags.SuppressNotifications],
        });
      } catch (error) {}
    }
  },
};

export default job;
