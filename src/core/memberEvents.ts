import {
    Client, GuildMember, Interaction, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder,
    TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, EmbedBuilder, CacheType, TextChannel,
    ModalSubmitInteraction, ButtonInteraction, StringSelectMenuInteraction, Events, Channel
} from 'discord.js';
import { ServerSetupManager } from './setupServers';
import { RANK_ROLES, SPECIAL_RANK_ROLES, ALLIANCE_TAG_IDENTIFIER, PENDING_APPLICANT_ROLE } from '../utils/constants';

interface RegistrationState {
    inGameName?: string;
    rank?: string;
    allianceName?: string;
}

export class MemberEventManager {
    private registrationState = new Map<string, RegistrationState>();

    constructor(private client: Client, private ssm: ServerSetupManager) {
        this.initializeListeners();
    }

    public initializeListeners(): void {
        this.client.on(Events.InteractionCreate, interaction => this.handleInteraction(interaction));
    }

    private async handleInteraction(interaction: Interaction<CacheType>): Promise<void> {
        if (!interaction.inGuild()) return;
        if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isStringSelectMenu()) return;

        const member = interaction.member as GuildMember;

        if (interaction.isButton()) {
            const customIdParts = interaction.customId.split(':');
            const action = customIdParts[0];

            switch (action) {
                case 'register_start':
                    const hasAllianceRole = member.roles.cache.some(role => role.name.endsWith(ALLIANCE_TAG_IDENTIFIER));
                    if (hasAllianceRole) {
                        await interaction.reply({ content: "You are already registered and cannot log in again.", ephemeral: true });
                        return;
                    }

                    const isCandidate = member.roles.cache.some(role => role.name === PENDING_APPLICANT_ROLE.name);
                    if (isCandidate) {
                        await interaction.reply({ content: "You have already submitted an application. Please wait for it to be reviewed.", ephemeral: true });
                        return;
                    }

                    await this.showNameModal(interaction);
                    break;
                case 'submit_application':
                    await this.submitApplication(interaction);
                    break;
                case 'approve':
                    const [, approveUserId, approveInGameName, approveRank, approveAllianceName] = customIdParts;
                    await this.handleApproval(interaction, approveUserId, approveInGameName, approveRank, approveAllianceName);
                    break;
                case 'reject':
                    const [__, rejectUserId, rejectAllianceName] = customIdParts;
                    await this.handleRejection(interaction, rejectUserId, rejectAllianceName);
                    break;
            }
        } else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'register_name_modal') {
                await this.handleNameSubmission(interaction);
            }
        } else if (interaction.isStringSelectMenu()) {
            const state = this.registrationState.get(interaction.user.id) || {};
            if (interaction.customId === 'register_rank_select') {
                state.rank = interaction.values[0];
                this.registrationState.set(interaction.user.id, state);
                await this.showAllianceSelection(interaction);
            } else if (interaction.customId === 'register_alliance_select') {
                state.allianceName = interaction.values[0];
                this.registrationState.set(interaction.user.id, state);
                await this.showConfirmation(interaction);
            }
        }
    }


    private async showNameModal(interaction: ButtonInteraction): Promise<void> {
        const modal = new ModalBuilder().setCustomId('register_name_modal').setTitle('Registration: In-Game Name');
        const nameInput = new TextInputBuilder().setCustomId('in_game_name').setLabel("What is your in-game name?").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput));
        await interaction.showModal(modal);
    }

    private async handleNameSubmission(interaction: ModalSubmitInteraction): Promise<void> {
        const inGameName = interaction.fields.getTextInputValue('in_game_name');
        this.registrationState.set(interaction.user.id, { inGameName });
        await this.showRankSelection(interaction);
    }

    private async showRankSelection(interaction: ModalSubmitInteraction | StringSelectMenuInteraction): Promise<void> {
        const rankOptions = RANK_ROLES.map(r => ({ label: r.name, value: r.name }));
        const selectMenu = new StringSelectMenuBuilder().setCustomId('register_rank_select').setPlaceholder('Select your rank').addOptions(rankOptions);
        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        const payload = { content: 'Please select your rank.', components: [row], ephemeral: true };

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply(payload);
        } else {
            await interaction.reply(payload);
        }
    }

    private async showAllianceSelection(interaction: StringSelectMenuInteraction | ModalSubmitInteraction): Promise<void> {
        const allianceCategories = this.ssm.findAllianceCategories(interaction.guild!);
        if (allianceCategories.length === 0) {
            const payload = { content: 'No alliances available for registration.', components: [] };
            if (interaction.isStringSelectMenu()) {
                await interaction.update(payload);
            } else {
                await interaction.reply({ ...payload, ephemeral: true });
            }
            return;
        }
        const allianceOptions = allianceCategories.map(c => ({ label: c.name, value: c.name }));
        const selectMenu = new StringSelectMenuBuilder().setCustomId('register_alliance_select').setPlaceholder('Select your alliance').addOptions(allianceOptions);
        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        if (interaction.isStringSelectMenu()) {
            await interaction.update({ content: 'Please select your alliance.', components: [row] });
        } else {
            await interaction.reply({ content: 'Please select your alliance.', components: [row], ephemeral: true });
        }
    }

    private async showConfirmation(interaction: StringSelectMenuInteraction): Promise<void> {
        const state = this.registrationState.get(interaction.user.id);
        if (!state?.inGameName || !state.rank || !state.allianceName) {
            await interaction.update({ content: 'An error occurred. Please start over.', components: [] });
            return;
        }

        const embed = new EmbedBuilder().setTitle('Registration Confirmation').setColor('#f1c40f').addFields(
            { name: 'In-Game Name', value: state.inGameName, inline: true },
            { name: 'Rank', value: state.rank, inline: true },
            { name: 'Alliance', value: state.allianceName, inline: true }
        );
        const submitButton = new ButtonBuilder().setCustomId('submit_application').setLabel('Submit Application').setStyle(ButtonStyle.Success);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(submitButton);
        await interaction.update({ content: 'Please confirm your details below. Press Submit to send your application to leadership.', embeds: [embed], components: [row] });
    }

    private async submitApplication(interaction: ButtonInteraction): Promise<void> {
        await interaction.deferUpdate();

        const applicant = interaction.member as GuildMember;
        const state = this.registrationState.get(applicant.id);
        if (!state?.inGameName || !state.rank || !state.allianceName) {
            await interaction.editReply({ content: 'Application data is missing. Please restart.' });
            return;
        }

        const allianceCache = this.ssm.getSpecificAllianceCache(interaction.guildId!, state.allianceName);
        if (!allianceCache) {
            await interaction.editReply({ content: 'Alliance data not found.' });
            return;
        }

        const candidateRole = allianceCache.roles.pendingRole;
        if (candidateRole) {
            await applicant.roles.add(candidateRole);
        }

        const leadershipChannel = allianceCache.category.children.cache.find(c => c.name.endsWith('leadership-channel')) as TextChannel;

        if (!leadershipChannel) {
            await interaction.editReply({ content: 'Could not find the leadership channel for this alliance.' });
            return;
        }

        const embed = new EmbedBuilder().setTitle('New Alliance Application').setColor('#3498db').addFields(
            { name: 'Applicant', value: applicant.user.toString(), inline: false },
            { name: 'In-Game Name', value: state.inGameName, inline: true },
            { name: 'Requested Rank', value: state.rank, inline: true },
            { name: 'Requested Alliance', value: state.allianceName, inline: true }
        );

        const approveButton = new ButtonBuilder().setCustomId(`approve:${applicant.id}:${state.inGameName}:${state.rank}:${state.allianceName}`).setLabel('Approve').setStyle(ButtonStyle.Success);
        const rejectButton = new ButtonBuilder().setCustomId(`reject:${applicant.id}:${state.allianceName}`).setLabel('Reject').setStyle(ButtonStyle.Danger);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(approveButton, rejectButton);

        await leadershipChannel.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: 'Your application has been submitted to leadership for review.', embeds: [], components: [] });

        this.registrationState.delete(applicant.id);
    }

    private async handleApproval(interaction: ButtonInteraction, userId: string, inGameName: string, rank: string, allianceName: string): Promise<void> {
        await interaction.deferUpdate();

        const applicant = await interaction.guild?.members.fetch(userId).catch(() => undefined);
        if (!applicant) {
            await interaction.editReply({ content: 'Could not find applicant.' });
            return;
        }

        const allianceCache = this.ssm.getSpecificAllianceCache(interaction.guildId!, allianceName);
        if (!allianceCache) {
            await interaction.editReply({ content: 'Could not find alliance data.' });
            return;
        }

        const roleAbbreviation = this.ssm.generateRoleAbbreviation(allianceName);
        const rankRole = allianceCache.roles.rankRoles.get(rank);
        const specialRoleEntry = SPECIAL_RANK_ROLES.find(r => r.base_role === rank);
        const specialRole = specialRoleEntry ? allianceCache.roles.specialRankRoles.get(specialRoleEntry.special_role) : undefined;
        const candidateRole = allianceCache.roles.pendingRole;
        const mainAllianceRole = allianceCache.roles.allianceRole;

        if (candidateRole) await applicant.roles.remove(candidateRole).catch(() => { });
        if (mainAllianceRole) await applicant.roles.add(mainAllianceRole).catch(() => { });
        if (rankRole) await applicant.roles.add(rankRole).catch(() => { });
        if (specialRole) await applicant.roles.add(specialRole).catch(() => { });

        const newNickname = `${inGameName} | ${roleAbbreviation} | ${rank}`;
        await applicant.setNickname(newNickname).catch(() => { });

        await applicant.send('Your application has been approved!').catch(() => { });
        await interaction.editReply({ content: `Application for ${applicant.user.tag} approved by ${interaction.user.tag}.`, components: [] });
    }

    private async handleRejection(interaction: ButtonInteraction, userId: string, allianceName: string): Promise<void> {
        await interaction.deferUpdate();

        const applicant = await interaction.guild?.members.fetch(userId).catch(() => undefined);
        if (!applicant) {
            await interaction.editReply({ content: 'Could not find applicant.' });
            return;
        }

        const allianceCache = this.ssm.getSpecificAllianceCache(interaction.guildId!, allianceName);
        if (allianceCache?.roles.pendingRole) {
            await applicant.roles.remove(allianceCache.roles.pendingRole).catch(() => { });
        }

        await applicant.send('Your application has been rejected.').catch(() => { });
        await interaction.editReply({ content: `Application for ${applicant.user.tag} rejected by ${interaction.user.tag}.`, components: [] });
    }
}