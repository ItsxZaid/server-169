import {
    Client, Guild, Role, CategoryChannel, PermissionsBitField, OverwriteResolvable, ChannelType,
    RoleManager, Snowflake, TextChannel, ColorResolvable,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle
} from 'discord.js';
import { Logger } from '../utils/logger';
import { ALLIANCE_CHANNELS, ALLIANCE_TAG_IDENTIFIER, PENDING_APPLICANT_ROLE, RANK_ROLES, SPECIAL_RANK_ROLES } from '../utils/constants';

export interface ServerRoleCache {
    allianceRole?: Role;
    rankRoles: Map<string, Role | undefined>;
    specialRankRoles: Map<string, Role | undefined>;
    pendingRole?: Role;
}

export interface AllianceCache {
    roles: ServerRoleCache;
    allianceCategory: CategoryChannel;
}

export class ServerSetupManager {
    private static instance: ServerSetupManager;
    private client: Client;
    private cache: Map<Snowflake, Map<string, AllianceCache>>;

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
            const allianceCategories = this.findAllianceCategories(guild);
            if (allianceCategories.length === 0) return;
            for (const category of allianceCategories) {
                await this.setupSingleAlliance(guild, category);
            }
        } catch (error) {
            Logger.error(`[${guild.name}] Critical error during setup:`, error);
        }
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

    private async setupSingleAlliance(guild: Guild, allianceCategory: CategoryChannel): Promise<void> {
        const { name: categoryName } = allianceCategory;
        try {
            const roleAbbreviation = this.generateRoleAbbreviation(categoryName);
            const channelSlug = this.generateChannelSlug(categoryName);
            const roles = await this.ensureRolesExist(guild, roleAbbreviation, categoryName);
            if (!roles.allianceRole) return;

            await this.ensureAllianceCategoryPermissions(guild, allianceCategory, roles.allianceRole);
            await this.ensureAllianceChannelsExist(guild, allianceCategory, roles, channelSlug);

            const guildCache = this.cache.get(guild.id) || new Map<string, AllianceCache>();
            guildCache.set(categoryName, { roles, allianceCategory });
            this.cache.set(guild.id, guildCache);
        } catch (error) {
            Logger.error(`[${guild.name}] Error in alliance setup "${categoryName}":`, error);
        }
    }

    public findAllianceCategories(guild: Guild): CategoryChannel[] {
        return guild.channels.cache
            .filter((c): c is CategoryChannel => c.type === ChannelType.GuildCategory && c.name.endsWith(ALLIANCE_TAG_IDENTIFIER))
            .map(c => c);
    }

    public generateRoleAbbreviation(allianceName: string): string {
        const words = allianceName.replace(ALLIANCE_TAG_IDENTIFIER, '').trim().split(/\s+/);
        return words.length > 2 ? words.map(word => word.charAt(0).toUpperCase()).join('') : words.join(' ');
    }

    public generateChannelSlug(allianceName: string): string {
        return allianceName.replace(ALLIANCE_TAG_IDENTIFIER, '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }

    private async ensureRolesExist(guild: Guild, abbreviation: string, allianceName: string): Promise<ServerRoleCache> {
        const roleManager = guild.roles;
        const roles: ServerRoleCache = {
            allianceRole: await this.findOrCreateRole(roleManager, allianceName),
            pendingRole: await this.findOrCreateRole(roleManager, PENDING_APPLICANT_ROLE.name, PENDING_APPLICANT_ROLE.color),
            rankRoles: new Map(),
            specialRankRoles: new Map()
        };
        for (const rank of RANK_ROLES) {
            roles.rankRoles.set(rank.name, await this.findOrCreateRole(roleManager, rank.name, rank.color));
        }
        for (const { special_role, color } of SPECIAL_RANK_ROLES) {
            roles.specialRankRoles.set(special_role, await this.findOrCreateRole(roleManager, `${abbreviation} ${special_role}`, color));
        }
        return roles;
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

    private async ensureAllianceCategoryPermissions(guild: Guild, category: CategoryChannel, allianceRole: Role): Promise<void> {
        const basePermissions: OverwriteResolvable[] = [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: allianceRole.id, allow: [PermissionsBitField.Flags.ViewChannel] }
        ];
        await category.permissionOverwrites.set(basePermissions);
    }

    private async ensureAllianceChannelsExist(guild: Guild, category: CategoryChannel, roles: ServerRoleCache, allianceSlug: string): Promise<void> {
        const leadershipRoles: Role[] = Array.from(roles.specialRankRoles.values()).filter((r): r is Role => r !== undefined);

        for (const channelConfig of ALLIANCE_CHANNELS) {
            const formattedChannelName = channelConfig.name.replace('{alliance_name}', allianceSlug);
            const existingChannel = category.children.cache.find(c => c.name === formattedChannelName);

            const permissions = channelConfig.isLeadership && roles.allianceRole
                ? this.getLeadershipChannelPermissions(guild, leadershipRoles)
                : [];

            if (!(existingChannel instanceof TextChannel)) {
                await guild.channels.create({ name: formattedChannelName, type: ChannelType.GuildText, parent: category, permissionOverwrites: permissions });
            } else if (channelConfig.isLeadership) {
                await existingChannel.permissionOverwrites.set(permissions);
            }
        }
    }

    private getLeadershipChannelPermissions(guild: Guild, leadershipRoles: Role[]): OverwriteResolvable[] {
        const permissions: OverwriteResolvable[] = [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }
        ];

        leadershipRoles.forEach(role => {
            if (role) {
                permissions.push({ id: role.id, allow: [PermissionsBitField.Flags.ViewChannel] });
            }
        });

        return permissions;
    }

    public getGuildAlliancesCache(guildId: Snowflake): Map<string, AllianceCache> | undefined {
        return this.cache.get(guildId);
    }

    public getSpecificAllianceCache(guildId: Snowflake, allianceName: string): AllianceCache | undefined {
        return this.cache.get(guildId)?.get(allianceName);
    }
}
