import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from './logger';

export interface Server {
    id: string;
    name: string;
}

interface BotSettings {
    botToken: string;
    clientId: string;
    servers: Server[];
}

const SETTINGS_FILE = path.join(__dirname, '../../settings.json');

let currentSettings: BotSettings = {
    botToken: '',
    clientId: '',
    servers: []
};

/**
 * Loads bot settings from the settings.json file.
 * If the file doesn't exist, it initializes with default empty settings.
 */
export async function loadSettings(): Promise<BotSettings> {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf8');
        currentSettings = JSON.parse(data);
        Logger.info('Settings loaded successfully from settings.json');
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            Logger.warn('settings.json not found. Initializing with default empty settings.');
            await saveSettings(currentSettings);
        } else {
            Logger.error('Error loading settings from settings.json:', error);
            currentSettings = { botToken: '', clientId: '', servers: [] };
        }
    }
    return currentSettings;
}

/**
 * Saves the provided bot settings to the settings.json file.
 */
export async function saveSettings(newSettings: BotSettings): Promise<void> {
    currentSettings = newSettings;
    try {
        await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2), 'utf8');
        Logger.info('Settings saved successfully to settings.json');
    } catch (error) {
        Logger.error('Error saving settings to settings.json:', error);
    }
}

/**
 * Retrieves the current bot settings from memory.
 * Ensure loadSettings() has been called at application startup.
 */
export function getBotSettings(): BotSettings {
    return currentSettings;
}
