import { Client, EmbedBuilder } from 'discord.js';
import { getStore, BuffBooking } from '../utils/buffs';
import { Logger } from '../utils/logger';

const REMINDER_THRESHOLD = 15 * 60 * 1000;

export class BuffScheduler {
    private scheduledBuffs = new Map<string, NodeJS.Timeout>();

    constructor(private client: Client) { }

    public initialize(): void {
        const store = getStore();
        for (const date in store.bookings) {
            for (const booking of store.bookings[date]) {
                this.scheduleReminder(date, booking);
            }
        }
    }

    public scheduleReminder(date: string, booking: BuffBooking): void {
        const bookingTime = new Date(`${date}T${booking.time}:00Z`).getTime();
        const reminderTime = bookingTime - REMINDER_THRESHOLD;
        const now = Date.now();
        const key = `${date}-${booking.time}`;

        if (bookingTime <= now) return;

        if (this.scheduledBuffs.has(key)) {
            clearTimeout(this.scheduledBuffs.get(key));
        }

        const timeout = setTimeout(() => {
            this.sendReminder(booking);
            this.scheduledBuffs.delete(key);
        }, reminderTime - now);

        this.scheduledBuffs.set(key, timeout);
    }

    public cancelReminder(date: string, time: string): void {
        const key = `${date}-${time}`;
        if (this.scheduledBuffs.has(key)) {
            clearTimeout(this.scheduledBuffs.get(key));
            this.scheduledBuffs.delete(key);
        }
    }

    private async sendReminder(booking: BuffBooking): Promise<void> {
        const store = getStore();
        if (store.deliverers.length === 0) return;

        const embed = new EmbedBuilder()
            .setTitle('Buff Delivery Reminder')
            .setDescription(`A **${booking.category}** buff is scheduled in **15 minutes**.`)
            .setColor('#E67E22')
            .addFields({ name: 'Recipient', value: booking.username, inline: true })
            .setTimestamp(new Date());

        for (const deliverer of store.deliverers) {
            try {
                const user = await this.client.users.fetch(deliverer.userId);
                await user.send({ embeds: [embed] });
            } catch (error) {
                Logger.error(`Failed to send buff reminder to ${deliverer.username}`, error);
            }
        }
    }
}