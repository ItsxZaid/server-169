import {
    Client,
    Guild,
    Role,
    CategoryChannel,
    PermissionsBitField,
    OverwriteResolvable,
    ChannelType,
    RoleManager,
    Snowflake,
    TextChannel,
    ColorResolvable
} from 'discord.js';
import { Logger } from '../utils/logger';

// LOL
const ALLIANCE_TAG_IDENTIFIER = 'Alliance';
const PENDING_APPLICANT_ROLE = { name: 'Candidate', color: '#808080' as ColorResolvable };

const RANK_ROLES: { name: string, color: ColorResolvable }[] = [
    { name: 'R1', color: '#1abc9c' },
    { name: 'R2', color: '#2ecc71' },
    { name: 'R3', color: '#3498db' },
    { name: 'R4', color: '#9b59b6' },
    { name: 'R5', color: '#e91e63' },
];

const SPECIAL_RANK_ROLES: { base_role: string, special_role: string, color: ColorResolvable }[] = [
    { base_role: 'R5', special_role: 'Overlord', color: '#f1c40f' },
    { base_role: 'R4', special_role: 'Strategos', color: '#e67e22' }
];

const ALLIANCE_CHANNELS = [
    { name: 'reminders-and-events', isLeadership: false },
    { name: '{alliance_name}-war-channel', isLeadership: false },
    { name: 'chit-chat', isLeadership: false },
    { name: '{alliance_name}-leadership-chat', isLeadership: true }
];

interface ServerRoleCache {
    allianceRole?: Role;
    rankRoles: Map<string, Role | undefined>;
    specialRankRoles: Map<string, Role | undefined>;
    pendingRole?: Role;
}

interface AllianceCache {
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
        this.resetCache();
    }

    public static getInstance(client: Client): ServerSetupManager {
        if (!ServerSetupManager.instance) {
            ServerSetupManager.instance = new ServerSetupManager(client);
        }
        return ServerSetupManager.instance;
    }

    public resetCache(): void {
        this.cache.clear();
        Logger.info('ServerSetupManager cache has been reset.');
    }

    public async initializeAllGuilds(): Promise<void> {
        Logger.info('Starting full guild setup initialization...');
        this.resetCache();
        const guilds = this.client.guilds.cache;
        if (guilds.size === 0) {
            Logger.warn('Bot is not in any guilds. Skipping setup.');
            return;
        }
        Logger.info(`Found ${guilds.size} guild(s) to process.`);
        for (const guild of guilds.values()) {
            await this.setupGuild(guild);
        }
        Logger.info('Full guild setup initialization complete.');
    }

    private async setupGuild(guild: Guild): Promise<void> {
        try {
            Logger.info(`[${guild.name}] Starting robust setup for all alliances...`);
            const allianceCategories = this.findAllianceCategories(guild);

            if (allianceCategories.length === 0) {
                Logger.warn(`[${guild.name}] No alliance categories found. Skipping.`);
                return;
            }

            Logger.info(`[${guild.name}] Found ${allianceCategories.length} alliance categories to process: ${allianceCategories.map(c => c.name).join(', ')}`);

            for (const category of allianceCategories) {
                await this.setupSingleAlliance(guild, category);
            }

            Logger.info(`[${guild.name}] Robust setup completed for all alliances.`);
        } catch (error) {
            Logger.error(`[${guild.name}] A critical error occurred during the main setup process:`, error);
        }
    }

    private async setupSingleAlliance(guild: Guild, allianceCategory: CategoryChannel): Promise<void> {
        const allianceCategoryName = allianceCategory.name;
        try {
            Logger.info(`[${guild.name}] >> Processing Alliance: "${allianceCategoryName}"`);

            const roleAbbreviation = this.generateRoleAbbreviation(allianceCategoryName);
            const channelSlug = this.generateChannelSlug(allianceCategoryName);
            Logger.info(`[${guild.name} | ${allianceCategoryName}] Generated Role Abbreviation: "${roleAbbreviation}"`);
            Logger.info(`[${guild.name} | ${allianceCategoryName}] Generated Channel Slug: "${channelSlug}"`);

            const roles = await this.ensureRolesExist(guild, allianceCategoryName, roleAbbreviation);
            if (!roles.allianceRole) {
                Logger.error(`[${guild.name} | ${allianceCategoryName}] Alliance role could not be created. Aborting setup for this alliance.`);
                return;
            }

            await this.ensureAllianceCategoryPermissions(guild, allianceCategory, roles.allianceRole);
            await this.ensureAllianceChannelsExist(guild, allianceCategory, roles, channelSlug);

            if (!this.cache.has(guild.id)) {
                this.cache.set(guild.id, new Map());
            }
            this.cache.get(guild.id)!.set(allianceCategoryName, { roles, allianceCategory });

            Logger.info(`[${guild.name}] >> Finished processing for Alliance: "${allianceCategoryName}"`);
        } catch (error) {
            Logger.error(`[${guild.name}] A critical error occurred during setup for alliance "${allianceCategoryName}":`, error);
        }
    }

    private findAllianceCategories(guild: Guild): CategoryChannel[] {
        return guild.channels.cache
            .filter(c => c.type === ChannelType.GuildCategory && c.name.endsWith(ALLIANCE_TAG_IDENTIFIER))
            .map(c => c as CategoryChannel);
    }

    private generateRoleAbbreviation(allianceName: string): string {
        const words = allianceName.replace(ALLIANCE_TAG_IDENTIFIER, '').trim().split(/\s+/);
        if (words.length > 2) {
            return words.map(word => word.charAt(0).toUpperCase()).join('');
        }
        return words.join(' ');
    }

    private generateChannelSlug(allianceName: string): string {
        return allianceName
            .replace(ALLIANCE_TAG_IDENTIFIER, '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
    }

    private async ensureRolesExist(guild: Guild, allianceName: string, abbreviation: string): Promise<ServerRoleCache> {
        const roleManager = guild.roles;
        const roles: ServerRoleCache = {
            allianceRole: await this.findOrCreateRole(roleManager, allianceName, '#7289DA'),
            pendingRole: await this.findOrCreateRole(roleManager, PENDING_APPLICANT_ROLE.name, PENDING_APPLICANT_ROLE.color),
            rankRoles: new Map(),
            specialRankRoles: new Map()
        };
        for (const rank of RANK_ROLES) {
            roles.rankRoles.set(rank.name, await this.findOrCreateRole(roleManager, rank.name, rank.color));
        }
        for (const { special_role, color } of SPECIAL_RANK_ROLES) {
            const specialRoleName = `${abbreviation} ${special_role}`;
            roles.specialRankRoles.set(special_role, await this.findOrCreateRole(roleManager, specialRoleName, color));
        }
        return roles;
    }

    private async findOrCreateRole(roleManager: RoleManager, name: string, color?: ColorResolvable): Promise<Role> {
        const existingRole = roleManager.cache.find(r => r.name === name);
        if (existingRole) {
            if (color && existingRole.hexColor.toUpperCase() !== (color as string).toUpperCase()) {
                await existingRole.setColor(color);
            }
            return existingRole;
        }
        Logger.info(`[${roleManager.guild.name}] Role "${name}" not found. Creating...`);
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
        const leadershipAndHighRankRoles: Role[] = [];
        roles.specialRankRoles.forEach(role => {
            if (role) leadershipAndHighRankRoles.push(role);
        });
        const r4Role = roles.rankRoles.get('R4');
        const r5Role = roles.rankRoles.get('R5');
        if (r4Role) leadershipAndHighRankRoles.push(r4Role);
        if (r5Role) leadershipAndHighRankRoles.push(r5Role);

        for (const channelConfig of ALLIANCE_CHANNELS) {
            const formattedChannelName = channelConfig.name.replace('{alliance_name}', allianceSlug);
            let channel = category.children.cache.find(c => c.name === formattedChannelName) as TextChannel | undefined;
            let channelPermissions: OverwriteResolvable[] = [];

            if (channelConfig.isLeadership) {
                channelPermissions.push({
                    id: roles.allianceRole!.id,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                });
                for (const leadershipRole of leadershipAndHighRankRoles) {
                    channelPermissions.push({
                        id: leadershipRole.id,
                        allow: [PermissionsBitField.Flags.ViewChannel]
                    });
                }
            }

            if (channel) {
                if (channelConfig.isLeadership) {
                    await channel.permissionOverwrites.set(channelPermissions);
                }
            } else {
                Logger.info(`[${guild.name} | ${category.name}] Channel "${formattedChannelName}" not found. Creating...`);
                await guild.channels.create({
                    name: formattedChannelName,
                    type: ChannelType.GuildText,
                    parent: category,
                    permissionOverwrites: channelConfig.isLeadership ? channelPermissions : undefined,
                });
            }
        }
    }

    public getGuildAlliancesCache(guildId: Snowflake): Map<string, AllianceCache> | undefined {
        return this.cache.get(guildId);
    }

    public getSpecificAllianceCache(guildId: Snowflake, allianceName: string): AllianceCache | undefined {
        return this.cache.get(guildId)?.get(allianceName);
    }
}
