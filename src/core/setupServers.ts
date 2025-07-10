import {
    Client, Guild, Role, CategoryChannel, PermissionsBitField, OverwriteResolvable, ChannelType,
    RoleManager, Snowflake, TextChannel, ColorResolvable,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle
} from 'discord.js';
import { Logger } from '../utils/logger';
import { ALLIANCE_CHANNELS, SERVER_CHANNELS, ALLIANCE_TAG_IDENTIFIER, PENDING_APPLICANT_ROLE, RANK_ROLES, SPECIAL_RANK_ROLES } from '../utils/constants';

export interface ServerRoleCache {
    mainRole: Role;
    rankRoles: Map<string, Role | undefined>;
    specialRankRoles: Map<string, Role | undefined>;
    pendingRole?: Role;
}

export interface ManagedCategoryCache {
    roles: ServerRoleCache;
    category: CategoryChannel;
}

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

        return { mainRole, pendingRole, rankRoles, specialRankRoles };
    }

    private async ensureCategoryPermissions(guild: Guild, category: CategoryChannel, mainRole: Role): Promise<void> {
        await category.permissionOverwrites.set([
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: mainRole.id, allow: [PermissionsBitField.Flags.ViewChannel] }
        ]);
    }

    private async ensureChannelsExist(guild: Guild, category: CategoryChannel, roles: ServerRoleCache, channelList: any[]): Promise<void> {
        for (const channelConfig of channelList) {
            const channelType = channelConfig.isVoiceChannel ? ChannelType.GuildVoice : ChannelType.GuildText;
            const formattedChannelName = channelConfig.name.replace('{alliance_name}', this.generateChannelSlug(category.name));

            const existingChannel = category.children.cache.find(c => c.name === formattedChannelName && c.type === channelType);

            const permissions = this.getChannelPermissions(guild, roles, channelConfig);

            if (!existingChannel) {
                await guild.channels.create({
                    name: formattedChannelName,
                    type: channelType,
                    parent: category,
                    permissionOverwrites: permissions
                });
            } else {
                await existingChannel.permissionOverwrites.set(permissions);
            }
        }
    }

    private getChannelPermissions(guild: Guild, roles: ServerRoleCache, config: any): OverwriteResolvable[] {
        const { mainRole, rankRoles, specialRankRoles } = roles;

        switch (config.permissionType) {
            case 'general':
                const allowPerms = [PermissionsBitField.Flags.ViewChannel];
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

    private generateRoleAbbreviation(allianceName: string): string {
        const words = allianceName.replace(ALLIANCE_TAG_IDENTIFIER, '').trim().split(/\s+/);
        return words.length > 2 ? words.map(word => word.charAt(0).toUpperCase()).join('') : words.join(' ');
    }

    private generateChannelSlug(allianceName: string): string {
        return allianceName.replace(ALLIANCE_TAG_IDENTIFIER, '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }
}