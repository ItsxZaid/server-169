import express from 'express';
import { config } from 'dotenv';
import path from 'path';
import { loadSettings } from './utils/db';
import apiRoutes from './routes';
import { GatewayIntentBits } from 'discord.js';
import { DiscordClientManager } from './core/discordConnection';
import { Logger } from './utils/logger';

config();

const app = express();

app.use(express.json());

app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, '../views', 'index.html'));
});

app.use('/api', apiRoutes);

async function startServer() {
    app.listen(process.env.PORT || 3000, () => {
        Logger.info(`Server is running on port ${process.env.PORT || 3000}`);
    });
    Logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
}

startServer()
    .then(async () => {
        Logger.info('Server started successfully');
        try {
            const settings = await loadSettings();

            let config = {
                token: settings.botToken,
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.MessageContent,
                    GatewayIntentBits.GuildMembers
                ],
                servers: settings.servers,
            };

            DiscordClientManager.getInstance(config);

        } catch (error) {
            Logger.error('Error loading settings:', error);
        }
    }).catch((error) => {
        Logger.error('Error starting the server:', error)
    });