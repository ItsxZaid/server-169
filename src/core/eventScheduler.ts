import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { Event, loadEvents, removeEvent } from '../utils/events';
import { Logger } from '../utils/logger';

const REMINDER_THRESHOLD = 15 * 60 * 1000;

export class EventScheduler {
    private scheduledEvents = new Map<string, NodeJS.Timeout>();

    constructor(private client: Client) { }

    public async initialize(): Promise<void> {
        const events = await loadEvents();
        Logger.info(`Loaded ${events.length} events. Scheduling reminders...`);
        for (const event of events) {
            this.scheduleReminder(event);
        }
    }

    public scheduleReminder(event: Event): void {
        const eventTime = new Date(event.eventTime).getTime();
        const reminderTime = eventTime - REMINDER_THRESHOLD;
        const now = Date.now();

        if (reminderTime <= now) {
            if (eventTime > now) {
                this.sendReminder(event);
            }
            removeEvent(event.id);
            return;
        }

        const timeout = setTimeout(() => {
            this.sendReminder(event);
            removeEvent(event.id);
            this.scheduledEvents.delete(event.id);
        }, reminderTime - now);

        this.scheduledEvents.set(event.id, timeout);
        Logger.info(`Reminder scheduled for event: ${event.name} at ${new Date(reminderTime).toISOString()}`);
    }

    private async sendReminder(event: Event): Promise<void> {
        const channel = await this.client.channels.fetch(event.channelId).catch(() => null) as TextChannel | null;
        if (!channel) {
            Logger.error(`Could not find channel with ID ${event.channelId} for event reminder.`);
            return;
        }

        const reminderEmbed = new EmbedBuilder()
            .setTitle(`🗓️ Event Reminder: ${event.name}`)
            .setDescription(event.description)
            .setColor('#5865F2')
            .addFields(
                { name: '⏰ Starts In', value: '15 minutes!', inline: true },
                { name: '🌐 Scope', value: event.isAllianceEvent ? `Alliance: ${event.allianceName}` : 'Server-Wide', inline: true }
            )
            .setTimestamp(new Date(event.eventTime))
            .setFooter({ text: '🕰' });

        if (event.imageUrl) {
            reminderEmbed.setImage(event.imageUrl);
        }

        await channel.send({ content: '@here', embeds: [reminderEmbed] });

        Logger.info(`Sent reminder for event: ${event.name}`);
    }
}