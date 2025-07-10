import {
    Client, GuildMember, Interaction, ButtonInteraction, ModalBuilder, TextInputBuilder,
    TextInputStyle, ActionRowBuilder, ModalSubmitInteraction, CacheType, Events, CategoryChannel, ChannelType, TextChannel
} from 'discord.js';
import { v4 as uuidv4 } from 'uuid';
import { ServerSetupManager } from './setupServers';
import { addEvent, Event } from '../utils/events';
import { EventScheduler } from './eventScheduler';
import { Logger } from '../utils/logger';
import { ALLIANCE_TAG_IDENTIFIER } from '../utils/constants';

const CREATE_EVENT_CUSTOM_ID = 'create_event_start';

interface EventCreationState {
    guildId: string;
    targetType: 'server' | 'alliance';
    allianceName?: string;
}

export class EventHandler {
    private creationState = new Map<string, EventCreationState>();

    constructor(private client: Client, private ssm: ServerSetupManager, private scheduler: EventScheduler) {
        this.initializeListeners();
    }

    public initializeListeners(): void {
        this.client.on(Events.InteractionCreate, interaction => this.handleInteraction(interaction));
    }

    private async handleInteraction(interaction: Interaction<CacheType>): Promise<void> {
        if (!interaction.inGuild()) return;

        if (interaction.isButton() && interaction.customId.startsWith(CREATE_EVENT_CUSTOM_ID)) {
            await this.handleEventCreationStart(interaction);
        } else if (interaction.isModalSubmit() && interaction.customId === 'event_details_modal') {
            await this.handleModalSubmissions(interaction);
        }
    }

    private async handleEventCreationStart(interaction: ButtonInteraction): Promise<void> {
        const member = interaction.member as GuildMember;
        const isR5 = member.roles.cache.some(r => r.name === 'R5');
        const isR4 = member.roles.cache.some(r => r.name === 'R4');

        const channel = interaction.channel;
        if (!channel || !('parentId' in channel) || !channel.parentId) {
            await interaction.reply({ content: 'Cannot create an event in this channel.', ephemeral: true });
            return;
        }

        const category = await interaction.guild!.channels.fetch(channel.parentId) as CategoryChannel | null;
        if (!category) {
            await interaction.reply({ content: 'Could not determine the category for this channel.', ephemeral: true });
            return;
        }

        const isAllianceChannel = category.name.endsWith(ALLIANCE_TAG_IDENTIFIER);
        const isServerChannel = category.name.startsWith('Server ');

        if (!isAllianceChannel && !isServerChannel) {
            await interaction.reply({ content: 'Events can only be created in Server or Alliance channels.', ephemeral: true });
            return;
        }

        if (isServerChannel && !isR5) {
            await interaction.reply({ content: 'You must be R5 to create a server-wide event.', ephemeral: true });
            return;
        }

        if (isAllianceChannel && !isR4 && !isR5) {
            await interaction.reply({ content: 'You must be at least R4 to create an alliance event.', ephemeral: true });
            return;
        }

        const state: EventCreationState = {
            guildId: interaction.guildId!,
            targetType: isServerChannel ? 'server' : 'alliance',
            allianceName: isAllianceChannel ? category.name : undefined
        };
        this.creationState.set(interaction.user.id, state);

        await this.showEventDetailsModal(interaction);
    }

    private async showEventDetailsModal(interaction: ButtonInteraction): Promise<void> {
        const modal = new ModalBuilder()
            .setCustomId('event_details_modal')
            .setTitle('Create New Event');

        const nameInput = new TextInputBuilder().setCustomId('event_name').setLabel("Event Name").setStyle(TextInputStyle.Short).setRequired(true);
        const dateInput = new TextInputBuilder().setCustomId('event_date').setLabel("Event Date (YYYY-MM-DD)").setPlaceholder("Example: 2025-12-25").setStyle(TextInputStyle.Short).setRequired(true);
        const timeInput = new TextInputBuilder().setCustomId('event_time').setLabel("Event Time (HH:MM, 24h UTC)").setPlaceholder("Example: 14:00").setStyle(TextInputStyle.Short).setRequired(true);
        const descInput = new TextInputBuilder().setCustomId('event_desc').setLabel("Event Description").setStyle(TextInputStyle.Paragraph).setRequired(true);
        const imageInput = new TextInputBuilder().setCustomId('event_image').setLabel("Background Image URL (Optional)").setStyle(TextInputStyle.Short).setRequired(false);

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(dateInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(timeInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput)
        );

        await interaction.showModal(modal);
    }

    private async handleModalSubmissions(interaction: ModalSubmitInteraction): Promise<void> {
        const state = this.creationState.get(interaction.user.id);
        if (!state) {
            await interaction.reply({ content: "An error occurred, your session may have expired. Please try again.", ephemeral: true });
            return;
        }

        const eventName = interaction.fields.getTextInputValue('event_name');
        const eventDateStr = interaction.fields.getTextInputValue('event_date');
        const eventTimeStr = interaction.fields.getTextInputValue('event_time');
        const eventDesc = interaction.fields.getTextInputValue('event_desc');
        const eventImage = interaction.fields.getTextInputValue('event_image');

        const fullTimestamp = `${eventDateStr}T${eventTimeStr}:00Z`;
        const eventDate = new Date(fullTimestamp);

        if (isNaN(eventDate.getTime())) {
            await interaction.reply({ content: "Invalid date or time format. Please use YYYY-MM-DD and HH:MM.", ephemeral: true });
            return;
        }
        if (eventDate.getTime() <= Date.now()) {
            await interaction.reply({ content: "The event time must be in the future.", ephemeral: true });
            return;
        }

        let targetCategory: CategoryChannel | undefined;
        if (state.targetType === 'server') {
            targetCategory = interaction.guild!.channels.cache.find(c => c.name.startsWith('Server ') && c.type === ChannelType.GuildCategory) as CategoryChannel | undefined;
        } else {
            targetCategory = this.ssm.findAllianceCategories(interaction.guild!).find(c => c.name === state.allianceName);
        }

        if (!targetCategory) {
            await interaction.reply({ content: "Could not find the target category for this event.", ephemeral: true });
            return;
        }

        const reminderChannel = targetCategory.children.cache.find(c => c.name.includes('events-and-reminders'));
        if (!reminderChannel || !reminderChannel.isTextBased()) {
            await interaction.reply({ content: "Could not find the 'events-and-reminders' channel for this category.", ephemeral: true });
            return;
        }

        const newEvent: Event = {
            id: uuidv4(),
            name: eventName,
            description: eventDesc,
            imageUrl: eventImage || '',
            eventTime: eventDate.toISOString(),
            guildId: interaction.guildId!,
            channelId: reminderChannel.id,
            isAllianceEvent: state.targetType === 'alliance',
            allianceName: state.allianceName
        };

        await addEvent(newEvent);
        this.scheduler.scheduleReminder(newEvent);

        await interaction.reply({ content: `Event "${eventName}" has been successfully created and scheduled!`, ephemeral: true });
        this.creationState.delete(interaction.user.id);
    }
}