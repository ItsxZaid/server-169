import { Client, Partials, Events, GatewayIntentBits } from 'discord.js';
import EventEmitter from 'events';
import { Logger } from '../utils/logger.js';
import { Server } from '../utils/db.js';
import { ServerSetupManager } from './setupServers.js';

export interface DiscordClientConfig {
    token: string;
    intents: GatewayIntentBits[];
    partials?: Partials[];
    maxReconnectAttempts?: number;
    reconnectDelayMs?: number;
    servers?: Server[];
}

enum ConnectionStatus {
    Disconnected = 'disconnected',
    Connecting = 'connecting',
    Connected = 'connected',
    Reconnecting = 'reconnecting',
    Stopping = 'stopping',
    Failed = 'failed',
}

class DiscordConnectionError extends Error {
    constructor(message: string, public originalError?: any) {
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

        Logger.info('DiscordClientManager initialized with provided configuration.');
    }

    public static getInstance(config?: DiscordClientConfig): DiscordClientManager {
        if (!DiscordClientManager.instance) {
            if (!config || !config.token || !config.intents) {
                throw new Error('DiscordClientManager must be initialized with a valid config (token, intents) on first access.');
            }
            DiscordClientManager.instance = new DiscordClientManager(config);
        } else if (config) {
            Logger.warn('Attempted to re-initialize DiscordClientManager with config. Using existing instance and its configuration.');
        }
        return DiscordClientManager.instance;
    }

    private setStatus(newStatus: ConnectionStatus): void {
        if (this.currentStatus !== newStatus) {
            Logger.debug(`Status change: ${this.currentStatus} -> ${newStatus}`);
            this.currentStatus = newStatus;
            this.emit('statusChange', newStatus);
        }
    }

    public async start(): Promise<void> {
        if (this.currentStatus === ConnectionStatus.Connected || this.currentStatus === ConnectionStatus.Connecting || this.currentStatus === ConnectionStatus.Reconnecting) {
            Logger.info('Discord client is already connected, connecting, or reconnecting. Skipping start.');
            return;
        }

        this.setStatus(ConnectionStatus.Connecting);
        Logger.info('Attempting to start Discord client...');

        try {
            this.client = new Client({
                intents: this.config.intents,
                partials: this.config.partials,
            });

            this.setupDiscordEventHandlers();

            await this.client.login(this.config.token);
            this.setStatus(ConnectionStatus.Connected);
            this.reconnectAttempts = 0;
            Logger.info('Discord client connected successfully.');
        } catch (error) {
            Logger.error('Failed to start Discord client:', new DiscordConnectionError('Login failed', error));
            this.handleConnectionFailure();
            throw new DiscordConnectionError('Failed to start Discord client due to login error.', error);
        }
    }

    public async stop(): Promise<void> {
        if (this.currentStatus === ConnectionStatus.Disconnected || this.currentStatus === ConnectionStatus.Stopping) {
            Logger.info('Discord client is already disconnected or stopping. Skipping stop.');
            return;
        }

        this.setStatus(ConnectionStatus.Stopping);
        Logger.info('Stopping Discord client...');

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.client) {
            try {
                this.client.destroy();
                this.client = null;
                this.setStatus(ConnectionStatus.Disconnected);
                Logger.info('Discord client stopped successfully.');
            } catch (error) {
                Logger.error('Error during Discord client destruction:', new DiscordConnectionError('Failed to destroy client gracefully', error));
                this.client = null;
                this.setStatus(ConnectionStatus.Disconnected);
            }
        } else {
            this.setStatus(ConnectionStatus.Disconnected);
            Logger.warn('Attempted to stop an uninitialized Discord client.');
        }
    }

    public async restart(): Promise<void> {
        Logger.info('Initiating Discord client restart...');
        await this.stop();
        await new Promise(resolve => setTimeout(resolve, 1500));
        await this.start();
        Logger.info('Discord client restart process completed.');
    }

    public async updateConfig(newConfig: Partial<DiscordClientConfig>): Promise<void> {
        Logger.info('Updating Discord client configuration...');

        await this.stop();

        if (newConfig.token) this.config.token = newConfig.token;
        if (newConfig.intents) this.config.intents = newConfig.intents;
        if (newConfig.partials) this.config.partials = newConfig.partials;
        if (newConfig.maxReconnectAttempts !== undefined) this.config.maxReconnectAttempts = newConfig.maxReconnectAttempts;
        if (newConfig.reconnectDelayMs !== undefined) this.config.reconnectDelayMs = newConfig.reconnectDelayMs;

        Logger.debug('New Discord client configuration applied. Restarting client...');
        await this.start();
    }


    public getClient(): Client | null {
        return this.client;
    }

    public getStatus(): ConnectionStatus {
        return this.currentStatus;
    }

    private setupDiscordEventHandlers(): void {
        if (!this.client) {
            Logger.error('Cannot setup event handlers: Discord client is null.');
            return;
        }

        this.client.on(Events.ClientReady, async () => {
            Logger.info(`Logged in as ${this.client!.user!.tag}!`);
            this.setStatus(ConnectionStatus.Connected);
            this.reconnectAttempts = 0;

            const ssmClient = ServerSetupManager.getInstance(this.client!);

            ssmClient.initializeAllGuilds();
        });

        this.client.on(Events.Error, (error) => {
            Logger.error('Discord client encountered an internal error:', new DiscordConnectionError('Client error', error));
            this.handleConnectionFailure();
        });

        this.client.on(Events.Warn, (info) => {
            Logger.warn('Discord client warning:', info);
        });

        this.client.on(Events.Debug, (info) => {
            Logger.debug('Discord client debug:', info);
        });

        this.client.on(Events.ShardDisconnect, (event, shardId) => {
            Logger.warn(`Discord client shard ${shardId} disconnected: Code ${event.code}, Reason: ${event.reason}`);
            this.setStatus(ConnectionStatus.Disconnected);
            this.handleConnectionFailure();
        });

        this.client.on(Events.ShardReconnecting, (shardId) => {
            this.setStatus(ConnectionStatus.Disconnected);
        });

        this.client.on(Events.ShardResume, (shardId, replayedEvents) => {
            Logger.info(`Discord client shard ${shardId} resumed (${replayedEvents} events replayed).`);
            this.setStatus(ConnectionStatus.Connected);
            this.reconnectAttempts = 0;
        });

        this.client.on(Events.MessageCreate, message => {
            if (message.author.bot) return;

            if (message.content === '!ping') {
                message.reply('Pong!');
                Logger.debug(`Handled !ping command from ${message.author.tag}`);
            }
        });
    }

    private handleConnectionFailure(): void {
        if (this.currentStatus === ConnectionStatus.Stopping || this.currentStatus === ConnectionStatus.Failed) {
            Logger.warn('Not attempting reconnect: client is in stopping or failed state.');
            return;
        }

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        if (this.reconnectAttempts < this.config.maxReconnectAttempts!) {
            this.reconnectAttempts++;
            this.setStatus(ConnectionStatus.Reconnecting);
            Logger.warn(`Attempting to reconnect in ${this.config.reconnectDelayMs! / 1000} seconds (Attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})...`);
            this.reconnectTimeout = setTimeout(() => {
                this.start().catch(err => {
                    Logger.error('Reconnect attempt failed:', err);
                });
            }, this.config.reconnectDelayMs!);
        } else {
            this.setStatus(ConnectionStatus.Failed);
            this.client = null;
            Logger.error(`Maximum reconnect attempts (${this.config.maxReconnectAttempts}) reached. Discord client remains disconnected.`);
            this.emit('connectionFailed');
        }
    }
}
