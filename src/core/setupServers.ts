import {
    Client, Guild, Role, CategoryChannel, PermissionsBitField, OverwriteResolvable, ChannelType,
    RoleManager, Snowflake, TextChannel, ColorResolvable,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle,
    VoiceChannel,
    NewsChannel,
    GuildChannel
} from 'discord.js';
import { Logger } from '../utils/logger';
import { ALLIANCE_CHANNELS, SERVER_CHANNELS, ALLIANCE_TAG_IDENTIFIER, PENDING_APPLICANT_ROLE, RANK_ROLES, SPECIAL_RANK_ROLES } from '../utils/constants';

export interface ServerRoleCache {
    mainRole: Role;
    rankRoles: Map<string, Role | undefined>;
    specialRankRoles: Map<string, Role | undefined>;
    pendingRole?: Role;
    allianceRole?: Role;
}

export interface ManagedCategoryCache {
    roles: ServerRoleCache;
    category: CategoryChannel;
    allianceCategory?: CategoryChannel;
}

type PermissibleChannel = CategoryChannel | TextChannel | VoiceChannel | NewsChannel;

export class ServerSetupManager {
    private static instance: ServerSetupManager;
    private client: Client;
    private cache: Map<Snowflake, Map<string, ManagedCategoryCache>>;

    private constructor(client: Client) {
        this.client = client;
        this.cache = new Map();
        Logger.info('ServerSetupManager initialized.');
    }

    public static getInstance(client: Client): ServerSetupManager {
        if (!ServerSetupManager.instance || ServerSetupManager.instance.client !== client) {
            ServerSetupManager.instance = new ServerSetupManager(client);
        }
        return ServerSetupManager.instance;
    }

    public getSpecificAllianceCache(guildId: Snowflake, allianceName: string): ManagedCategoryCache | undefined {
        const guildCache = this.cache.get(guildId);
        if (!guildCache) return undefined;
        return guildCache.get(allianceName);
    }

    public findAllianceCategories(guild: Guild): CategoryChannel[] {
        const guildCache = this.cache.get(guild.id);
        if (!guildCache) return [];
        return Array.from(guildCache.values())
            .filter(cache => cache.category.name.endsWith(ALLIANCE_TAG_IDENTIFIER))
            .map(cache => cache.category);
    }

    public generateRoleAbbreviation(allianceName: string): string {
        const words = allianceName.replace(ALLIANCE_TAG_IDENTIFIER, '').trim().split(/\s+/);
        return words.length > 2 ? words.map(word => word.charAt(0).toUpperCase()).join('') : words.join(' ');
    }

    public resetCache(): void {
        this.cache.clear();
    }

    public async initializeAllGuilds(): Promise<void> {
        this.resetCache();
        for (const guild of this.client.guilds.cache.values()) {
            await this.setupGuild(guild);
        }
    }

    public async setupGuild(guild: Guild): Promise<void> {
        try {
            await this.ensureWelcomeChannel(guild);
            const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory);

            for (const category of categories.values()) {
                if (category.name.endsWith(ALLIANCE_TAG_IDENTIFIER)) {
                    await this.setupCategory(guild, category as CategoryChannel, 'alliance');
                } else if (category.name.startsWith('Server ')) {
                    await this.setupCategory(guild, category as CategoryChannel, 'server');
                }
            }
            await this.applyCrossCategoryPermissions(guild);
        } catch (error) {
            Logger.error(`[${guild.name}] Critical error during setup:`, error);
        }
    }

    private async setupCategory(guild: Guild, category: CategoryChannel, type: 'alliance' | 'server'): Promise<void> {
        try {
            const roles = await this.ensureRolesExist(guild, category.name, type);
            await this.ensureCategoryPermissions(guild, category, roles.mainRole);
            const channelList = type === 'alliance' ? ALLIANCE_CHANNELS : SERVER_CHANNELS;
            await this.ensureChannelsExist(guild, category, roles, channelList);

            const guildCache = this.cache.get(guild.id) || new Map<string, ManagedCategoryCache>();
            guildCache.set(category.name, { roles, category });
            this.cache.set(guild.id, guildCache);
        } catch (error) {
            Logger.error(`[${guild.name}] Error in category setup "${category.name}":`, error);
        }
    }

    private async ensureRolesExist(guild: Guild, categoryName: string, type: 'alliance' | 'server'): Promise<ServerRoleCache> {
        const roleManager = guild.roles;
        const mainRole = await this.findOrCreateRole(roleManager, categoryName);
        const pendingRole = await this.findOrCreateRole(roleManager, PENDING_APPLICANT_ROLE.name, PENDING_APPLICANT_ROLE.color);

        const rankRoles = new Map<string, Role | undefined>();
        for (const rank of RANK_ROLES) {
            rankRoles.set(rank.name, await this.findOrCreateRole(roleManager, rank.name, rank.color));
        }

        const specialRankRoles = new Map<string, Role | undefined>();
        if (type === 'alliance') {
            const roleAbbreviation = this.generateRoleAbbreviation(categoryName);
            for (const { special_role, color } of SPECIAL_RANK_ROLES) {
                specialRankRoles.set(special_role, await this.findOrCreateRole(roleManager, `${roleAbbreviation} ${special_role}`, color));
            }
        }

        return { mainRole, pendingRole, rankRoles, specialRankRoles, allianceRole: mainRole };
    }

    private async ensureCategoryPermissions(guild: Guild, category: CategoryChannel, mainRole: Role): Promise<void> {
        const requiredOverwrites: OverwriteResolvable[] = [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: mainRole.id, allow: [PermissionsBitField.Flags.ViewChannel] }
        ];
        await this.syncPermissions(category, requiredOverwrites);
    }

    private async ensureChannelsExist(guild: Guild, category: CategoryChannel, roles: ServerRoleCache, channelList: any[]): Promise<void> {
        for (const channelConfig of channelList) {
            const channelType = channelConfig.isVoiceChannel ? ChannelType.GuildVoice : ChannelType.GuildText;
            const formattedChannelName = channelConfig.name.replace('{alliance_name}', this.generateChannelSlug(category.name));

            let channel = category.children.cache.find(c => c.name === formattedChannelName && c.type === channelType);
            const permissions = this.getChannelPermissions(guild, roles, channelConfig);

            if (!channel) {
                channel = await guild.channels.create({
                    name: formattedChannelName,
                    type: channelType,
                    parent: category,
                    permissionOverwrites: permissions
                });
            } else {
                await this.syncPermissions(channel as PermissibleChannel, permissions);
            }

            if (channelConfig.name.includes('events-and-reminders') && channel.type === ChannelType.GuildText) {
                await this.ensureEventButton(channel as TextChannel);
            }
        }
    }

    private async ensureEventButton(channel: TextChannel): Promise<void> {
        const messages = await channel.messages.fetch({ limit: 10 });
        const botMessage = messages.find(m => m.author.id === this.client.user?.id && m.content.includes("Use the button below to create a new event."));

        if (!botMessage) {
            const createEventButton = new ButtonBuilder()
                .setCustomId('create_event_start')
                .setLabel('Create Event')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📆');
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(createEventButton);
            await channel.send({
                content: 'Use the button below to create a new event.',
                components: [row]
            });
        }
    }

    private getChannelPermissions(guild: Guild, roles: ServerRoleCache, config: any): OverwriteResolvable[] {
        const { mainRole, rankRoles, specialRankRoles } = roles;

        switch (config.permissionType) {
            case 'general':
                let allowPerms: bigint[] = [PermissionsBitField.Flags.ViewChannel];
                if (config.isVoiceChannel) {
                    allowPerms.push(PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak);
                } else {
                    allowPerms.push(PermissionsBitField.Flags.SendMessages);
                }
                return [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: mainRole.id, allow: allowPerms }
                ];
            case 'announcement':
                return [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: mainRole.id, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.SendMessages] },
                    { id: this.client.user!.id, allow: [PermissionsBitField.Flags.SendMessages] }
                ];
            case 'r5_only':
                const r5Role = rankRoles.get('R5');
                if (!r5Role) return [];
                return [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: mainRole.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: r5Role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                ];
            case 'leadership':
                const leadershipRoles = Array.from(specialRankRoles.values()).filter((r): r is Role => r !== undefined);
                const perms: OverwriteResolvable[] = [{ id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }];
                leadershipRoles.forEach(role => {
                    perms.push({ id: role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
                });
                return perms;
            default:
                return [];
        }
    }

    private async findOrCreateRole(roleManager: RoleManager, name: string, color?: ColorResolvable): Promise<Role> {
        const existingRole = roleManager.cache.find(r => r.name === name);
        if (existingRole) {
            if (color && existingRole.hexColor.toUpperCase() !== (color as string).toUpperCase()) {
                await existingRole.setColor(color).catch(e => Logger.error(`Failed to set color for role ${name}`, e));
            }
            return existingRole;
        }
        return roleManager.create({ name, color: color || 'Default', permissions: [], mentionable: true });
    }

    private async ensureWelcomeChannel(guild: Guild): Promise<void> {
        const channelName = 'welcome-please-come-here-first-to-see-more-pages';
        let welcomeChannel = guild.channels.cache.find(c => c.name === channelName && c.type === ChannelType.GuildText) as TextChannel;

        if (!welcomeChannel) {
            try {
                welcomeChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [{ id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.SendMessages] }],
                }) as TextChannel;
            } catch (error) {
                Logger.error(`[${guild.name}] Failed to create welcome channel:`, error);
                return;
            }
        }

        const messages = await welcomeChannel.messages.fetch({ limit: 10 });
        const existingMessage = messages.find(m => m.author.id === this.client.user?.id && m.components.length > 0);

        if (!existingMessage) {
            const registerButton = new ButtonBuilder()
                .setCustomId('register_start')
                .setLabel('Register')
                .setStyle(ButtonStyle.Success);
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(registerButton);
            await welcomeChannel.send({
                content: `Welcome! Please register to gain access to the server.`,
                components: [row],
            });
        }
    }

    private generateChannelSlug(allianceName: string): string {
        return allianceName.replace(ALLIANCE_TAG_IDENTIFIER, '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }

    private async applyCrossCategoryPermissions(guild: Guild): Promise<void> {
        const allianceRoles = guild.roles.cache.filter(role => role.name.endsWith(ALLIANCE_TAG_IDENTIFIER));
        if (allianceRoles.size === 0) return;

        const serverCategory = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.startsWith('Server ')) as CategoryChannel;
        if (!serverCategory) return;

        for (const channelConfig of SERVER_CHANNELS) {
            const channel = serverCategory.children.cache.find(c => c.name === channelConfig.name);
            if (!channel) continue;

            const newOverwrites: OverwriteResolvable[] = allianceRoles.map(role => {
                let permissionsToAllow = [PermissionsBitField.Flags.ViewChannel];
                if (channel.name === 'chit-chat') {
                    permissionsToAllow.push(PermissionsBitField.Flags.SendMessages);
                }
                return {
                    id: role.id,
                    allow: permissionsToAllow
                };
            });

            await this.syncPermissions(channel as PermissibleChannel, newOverwrites, true);
        }
    }

    private async syncPermissions(channel: PermissibleChannel, requiredOverwrites: OverwriteResolvable[], append: boolean = false): Promise<void> {
        let needsUpdate = false;
        const finalOverwrites: OverwriteResolvable[] = append ? channel.permissionOverwrites.cache.map(o => ({ id: o.id, allow: o.allow.bitfield, deny: o.deny.bitfield, type: o.type })) : [];

        for (const required of requiredOverwrites) {
            const existing = channel.permissionOverwrites.cache.get(required.id as Snowflake);
            const requiredAllow = new PermissionsBitField(required.allow || undefined);
            const requiredDeny = new PermissionsBitField(required.deny || undefined);

            if (!existing || existing.allow.bitfield !== requiredAllow.bitfield || existing.deny.bitfield !== requiredDeny.bitfield) {
                needsUpdate = true;
                const existingIndex = finalOverwrites.findIndex(o => o.id === required.id);
                if (existingIndex > -1) {
                    finalOverwrites[existingIndex] = required;
                } else {
                    finalOverwrites.push(required);
                }
            }
        }

        if (needsUpdate) {
            await channel.permissionOverwrites.set(finalOverwrites);
            Logger.info(`Permissions synchronized for channel: ${channel.name}`);
        }
    }
}