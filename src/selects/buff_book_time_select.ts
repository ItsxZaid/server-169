import {
  StringSelectMenuInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  TextChannel,
} from "discord.js";
import { eq, and, gte, lte } from "drizzle-orm";
import { DB, CustomClient } from "../types";
import { buff_bookings, NewBuffBooking, users } from "../db/schema";
import { format, startOfDay, endOfDay, isToday } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

const TIMEZONE = "UTC";
type BuffType = NewBuffBooking["buff_type"];

async function getUpdatedSchedulePayload(guild: any, db: DB, targetDate: Date) {
  const zonedTargetDate = toZonedTime(targetDate, TIMEZONE);
  const dayStart = startOfDay(zonedTargetDate);
  const dayEnd = endOfDay(zonedTargetDate);

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
    members.forEach((member: any) =>
      membersMap.set(member.id, member.displayName),
    );
  }

  const createScheduleEmbed = (
    buffType: BuffType,
    title: string,
    color: number,
  ) => {
    const typeBookings = bookingsForDay.filter((b) => b.buff_type === buffType);
    const bookingsMap = new Map();
    typeBookings.forEach((booking) => {
      const utcTime = toZonedTime(booking.slot_time, TIMEZONE);
      const hour = utcTime.getUTCHours();
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
          zonedTargetDate,
          "EEEE, MMMM d, yyyy",
        )} | All times are UTC.`,
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

  return { embeds: [researchEmbed, trainingEmbed, buildingEmbed] };
}

export async function execute(
  interaction: StringSelectMenuInteraction,
  db: DB,
  client: CustomClient,
) {
  try {
    await interaction.deferUpdate();

    const registeredUser = await db.query.users.findFirst({
      where: eq(users.user_discord_id, interaction.user.id),
    });

    if (!registeredUser) {
      await interaction.editReply({
        content:
          "You must be registered to book a slot. Please use the `/register` command first.",
        components: [],
      });
      return;
    }

    const [, buffType] = interaction.customId.split(":");
    const slotTimestamp = parseInt(interaction.values[0]);

    if (isNaN(slotTimestamp)) {
      await interaction.editReply({
        content: "Invalid time slot selected.",
        components: [],
      });
      return;
    }

    const slotTime = new Date(slotTimestamp * 1000);
    const slotIsoForDb = slotTime.toISOString();

    const existingBooking = await db.query.buff_bookings.findFirst({
      where: eq(buff_bookings.slot_time, slotIsoForDb),
    });

    if (existingBooking) {
      await interaction.editReply({
        content:
          "Sorry, someone just booked that slot! Please try booking another time.",
        components: [],
      });
      return;
    }

    const newBooking: NewBuffBooking = {
      buff_type: buffType as "research" | "training" | "building",
      slot_time: slotIsoForDb,
      booked_by_discord_id: interaction.user.id,
      notification_sent: false,
    };

    await db.insert(buff_bookings).values(newBooking);

    let footerText =
      "The schedule will update shortly. You will receive a DM reminder 5 minutes before your slot.";

    if (isToday(slotTime) && interaction.guild) {
      const buffChannelName = "buff-management";
      const buffChannel = interaction.guild.channels.cache.find(
        (c) => c.name === buffChannelName && c.type === ChannelType.GuildText,
      ) as TextChannel | undefined;

      if (buffChannel) {
        const messages = await buffChannel.messages.fetch({ limit: 10 });
        const messageToEdit = messages.find((m) =>
          m.embeds[0]?.title?.includes("Schedule"),
        );

        if (messageToEdit) {
          const payload = await getUpdatedSchedulePayload(
            interaction.guild,
            db,
            slotTime,
          );
          await messageToEdit.edit(payload);
          footerText =
            "The public schedule has been updated. You will receive a DM reminder 5 minutes before your slot.";
        }
      }
    }

    const utcTimeDisplay = formatInTimeZone(
      slotTime,
      TIMEZONE,
      "HH:mm 'on' EEEE, dd MMMM",
    );
    const buffTypeDisplay =
      buffType.charAt(0).toUpperCase() + buffType.slice(1);

    const successEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("✅ Buff Slot Booked!")
      .setDescription(
        `Your **${buffTypeDisplay} Buff** is confirmed for **${utcTimeDisplay} (UTC)**.`,
      )
      .setFooter({ text: footerText });

    await interaction.editReply({
      content: "",
      embeds: [successEmbed],
      components: [],
    });
  } catch (error) {
    console.error("Error during buff booking finalization:", error);
    await interaction.editReply({
      content: "A critical error occurred while booking your slot.",
      components: [],
    });
  }
}
