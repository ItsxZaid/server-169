import { Client, Partials, Events, GatewayIntentBits, Guild, ChannelType, TextChannel } from 'discord.js';
import EventEmitter from 'events';
import { Logger } from '../utils/logger.js';
import { Server } from '../utils/db.js';
import { ServerSetupManager } from './setupServers.js';
import { MemberEventManager } from './memberEvents.js';
import { EventScheduler } from './eventScheduler.js';
import { EventHandler } from './eventHandler.js';
import { BuffScheduler } from './buffScheduler.js';
import { BuffManager } from './buffManager.js';
import { loadBuffs } from '../utils/buffs.js';

export interface DiscordClientConfig {
    token: string;
    intents: GatewayIntentBits[];
    partials?: Partials[];
    maxReconnectAttempts?: number;
    reconnectDelayMs?: number;
    servers?: Server[];
}

export enum ConnectionStatus {
    Disconnected = 'disconnected',
    Connecting = 'connecting',
    Connected = 'connected',
    Reconnecting = 'reconnecting',
    Stopping = 'stopping',
    Failed = 'failed',
}

export class DiscordConnectionError extends Error {
    constructor(message: string, public originalError?: unknown) {
        super(message);
        this.name = 'DiscordConnectionError';
    }
}

export class DiscordClientManager extends EventEmitter {
    private static instance: DiscordClientManager;
    private client: Client | null;
    private config: DiscordClientConfig;
    private currentStatus: ConnectionStatus;
    private reconnectAttempts: number;
    private reconnectTimeout: NodeJS.Timeout | null;

    private constructor(config: DiscordClientConfig) {
        super();
        this.config = {
            ...config,
            maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
            reconnectDelayMs: config.reconnectDelayMs ?? 5000,
            partials: config.partials ?? [
                Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember, Partials.Reaction
            ]
        };
        this.client = null;
        this.currentStatus = ConnectionStatus.Disconnected;
        this.reconnectAttempts = 0;
        this.reconnectTimeout = null;
        Logger.info('DiscordClientManager initialized.');
    }

    public static getInstance(config?: DiscordClientConfig): DiscordClientManager {

        if (!DiscordClientManager.instance) {
            if (!config || !config.token || !config.intents) {
                throw new Error('DiscordClientManager must be initialized with a valid config on first access.');
            }
            DiscordClientManager.instance = new DiscordClientManager(config);
        }
        return DiscordClientManager.instance;
    }

    private setStatus(newStatus: ConnectionStatus): void {
        if (this.currentStatus !== newStatus) {
            this.currentStatus = newStatus;
            this.emit('statusChange', newStatus);
        }
    }

    public async start(): Promise<void> {
        if ([ConnectionStatus.Connected, ConnectionStatus.Connecting, ConnectionStatus.Reconnecting].includes(this.currentStatus)) {
            return;
        }
        this.setStatus(ConnectionStatus.Connecting);
        try {
            this.client = new Client({ intents: this.config.intents, partials: this.config.partials });
            this.setupDiscordEventHandlers();
            await this.client.login(this.config.token);
            this.setStatus(ConnectionStatus.Connected);
            this.reconnectAttempts = 0;
        } catch (error) {
            Logger.error('Failed to start Discord client:', new DiscordConnectionError('Login failed', error));
            this.handleConnectionFailure();
            throw new DiscordConnectionError('Failed to start client.', error);
        }
    }

    public async stop(): Promise<void> {
        if ([ConnectionStatus.Disconnected, ConnectionStatus.Stopping].includes(this.currentStatus)) return;
        this.setStatus(ConnectionStatus.Stopping);
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
        if (this.client) this.client.destroy();
        this.client = null;
        this.setStatus(ConnectionStatus.Disconnected);
    }

    public async restart(): Promise<void> {
        await this.stop();
        await new Promise(resolve => setTimeout(resolve, 1500));
        await this.start();
    }

    public async updateConfig(newConfig: Partial<DiscordClientConfig>): Promise<void> {
        await this.stop();
        this.config = { ...this.config, ...newConfig };
        await this.start();
    }

    public getClient(): Client | null {
        return this.client;
    }

    public getStatus(): ConnectionStatus {
        return this.currentStatus;
    }

    private setupDiscordEventHandlers(): void {
        if (!this.client) return;

        this.client.once(Events.ClientReady, async (readyClient) => {
            Logger.info(`Logged in as ${readyClient.user.tag}!`);
            this.setStatus(ConnectionStatus.Connected);
            this.reconnectAttempts = 0;

            await loadBuffs();

            const ssm = ServerSetupManager.getInstance(readyClient);
            await ssm.initializeAllGuilds();
            new MemberEventManager(readyClient, ssm);

            const eventScheduler = new EventScheduler(readyClient);
            await eventScheduler.initialize();
            new EventHandler(readyClient, ssm, eventScheduler);

            const buffScheduler = new BuffScheduler(readyClient);
            buffScheduler.initialize();

            const buffManager = new BuffManager(readyClient, buffScheduler);
            const guild = readyClient.guilds.cache.first();
            if (guild) {
                const buffChannel = guild.channels.cache.find(c => c.name === 'buff-management' && c.type === ChannelType.GuildText) as TextChannel;
                if (buffChannel) {
                    await buffManager.initialize(buffChannel);
                }
            }
        });

        this.client.on(Events.GuildCreate, async (guild: Guild) => {
            if (!this.client) return;
            const ssm = ServerSetupManager.getInstance(this.client);
            await ssm.setupGuild(guild);
        });

        this.client.on(Events.Error, (error) => this.handleConnectionFailure(error));
        this.client.on(Events.Warn, (info) => Logger.warn('Discord client warning:', info));
        this.client.on(Events.ShardDisconnect, () => this.handleConnectionFailure());
        this.client.on(Events.ShardReconnecting, () => this.setStatus(ConnectionStatus.Reconnecting));
        this.client.on(Events.ShardResume, () => {
            this.setStatus(ConnectionStatus.Connected);
            this.reconnectAttempts = 0;
        });
    }

    private handleConnectionFailure(error?: Error): void {
        if (error) Logger.error('Discord client error:', new DiscordConnectionError('Client error', error));
        if ([ConnectionStatus.Stopping, ConnectionStatus.Failed].includes(this.currentStatus)) return;
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);

        if (this.reconnectAttempts < this.config.maxReconnectAttempts!) {
            this.reconnectAttempts++;
            this.setStatus(ConnectionStatus.Reconnecting);
            this.reconnectTimeout = setTimeout(() => {
                this.start().catch(err => Logger.error('Reconnect attempt failed:', err));
            }, this.config.reconnectDelayMs!);
        } else {
            this.setStatus(ConnectionStatus.Failed);
            this.client = null;
            this.emit('connectionFailed');
        }
    }
}