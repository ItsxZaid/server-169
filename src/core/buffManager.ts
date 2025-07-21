import {
    Client, GuildMember, Interaction, ButtonInteraction, ModalBuilder, TextInputBuilder,
    TextInputStyle, ActionRowBuilder, ModalSubmitInteraction, CacheType, Events, StringSelectMenuBuilder, EmbedBuilder, TextChannel, Message,
    StringSelectMenuInteraction,
    ButtonBuilder
} from 'discord.js';
import { getStore, cancelSlot, addValidDate, addDeliverer } from '../utils/buffs';
import { BuffScheduler } from './buffScheduler';

const BUFF_MSG_CONTENT = "### Buff Management";

export class BuffManager {
    private activeMessage: Message | null = null;
    private currentDate: string;

    constructor(private client: Client, private scheduler: BuffScheduler) {
        this.currentDate = new Date().toISOString().slice(0, 10);
        this.client.on(Events.InteractionCreate, interaction => this.handleInteraction(interaction));
    }

    public async initialize(channel: TextChannel): Promise<void> {
        const messages = await channel.messages.fetch({ limit: 20 });
        this.activeMessage = messages.find(m => m.author.id === this.client.user?.id && m.content === BUFF_MSG_CONTENT) || null;

        if (!this.activeMessage) {
            this.activeMessage = await channel.send({ content: BUFF_MSG_CONTENT });
        }
        await this.updateBuffMessage();
    }

    private async handleInteraction(interaction: Interaction<CacheType>): Promise<void> {
        if (!interaction.inGuild()) return;

        if (interaction.isButton()) {
            if (interaction.message?.id !== this.activeMessage?.id) return;
            await this.handleButtonInteraction(interaction);
        }
    }

    private async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
        const [action, data] = interaction.customId.split(':');

        switch (action) {
            case 'buff_refresh':
                await interaction.deferUpdate();
                break;
            case 'buff_request':
                await this.handleRequest(interaction);
                return;
            case 'buff_my_bookings':
                await this.showMyBookings(interaction);
                return;
            case 'buff_cancel':
                await interaction.deferUpdate();
                await this.handleCancel(interaction, data);
                break;
        }
        await this.updateBuffMessage();
    }

    private async handleRequest(interaction: ButtonInteraction) {
        const modal = new ModalBuilder().setCustomId('buff_request_modal').setTitle('Request a Buff');
        const timeInput = new TextInputBuilder().setCustomId('time').setLabel("Time Slot (HH:00, 24h UTC)").setPlaceholder("Example: 14:00").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(timeInput));
        await interaction.showModal(modal);
    }

    public async handleRequestModal(interaction: ModalSubmitInteraction) {
        // This is where you would handle the modal submission for buff requests
    }

    private async showMyBookings(interaction: ButtonInteraction) {
        const store = getStore();
        const userBookings = Object.entries(store.bookings).flatMap(([date, bookings]) =>
            bookings.filter(b => b.userId === interaction.user.id).map(b => ({ date, ...b }))
        );

        if (userBookings.length === 0) {
            await interaction.reply({ content: "You have no upcoming buff bookings.", ephemeral: true });
            return;
        }

        const embed = new EmbedBuilder().setTitle('My Buff Bookings').setColor('#2ECC71');
        const fields = userBookings.map(b => ({ name: `${b.date} at ${b.time} UTC`, value: `Type: ${b.category}` }));
        embed.addFields(fields);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`buff_cancel:${userBookings[0]?.date}:${userBookings[0]?.time}`).setLabel('Cancel First Booking').setStyle(4).setDisabled(userBookings.length === 0)
        );

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    private async handleCancel(interaction: ButtonInteraction, data: string) {
        const [, date, time] = data.split(':');
        const success = await cancelSlot(date, time, interaction.user.id, interaction.user.username);
        if (success) {
            this.scheduler.cancelReminder(date, time);
        }
    }

    private async updateBuffMessage(): Promise<void> {
        if (!this.activeMessage) return;
        const store = getStore();
        const bookingsForDate = store.bookings[this.currentDate] || [];
        const embed = new EmbedBuilder()
            .setTitle(`Buff Bookings for: ${this.currentDate} (UTC)`)
            .setColor('#3498DB')
            .setTimestamp();

        const description = Array.from({ length: 24 }, (_, i) => {
            const time = `${String(i).padStart(2, '0')}:00`;
            const booking = bookingsForDate.find(b => b.time === time);
            return booking
                ? `\`${time}\` 🟩 **${booking.username}** (*${booking.category}*)`
                : `\`${time}\` ⬜️ FREE`;
        }).join('\n');

        embed.setDescription(description || "No bookings for this date.");
        await this.activeMessage.edit({ content: BUFF_MSG_CONTENT, embeds: [embed], components: this.createActionRows() });
    }

    private createActionRows(): ActionRowBuilder<any>[] {
        const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('buff_request').setLabel('Request Buff').setStyle(1),
            new ButtonBuilder().setCustomId('buff_my_bookings').setLabel('My Bookings').setStyle(2),
            new ButtonBuilder().setCustomId('buff_refresh').setLabel('Refresh').setStyle(2).setEmoji('🔄')
        );

        return [row1];
    }
}