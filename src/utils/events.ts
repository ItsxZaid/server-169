import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from './logger';
import { Snowflake } from 'discord.js';

const EVENTS_FILE = path.join(__dirname, '../../events.json');

export interface Event {
    id: string;
    name: string;
    description: string;
    imageUrl: string;
    eventTime: string;
    guildId: Snowflake;
    channelId: Snowflake;
    isAllianceEvent: boolean;
    allianceName?: string;
}

let events: Event[] = [];

export async function loadEvents(): Promise<Event[]> {
    try {
        const data = await fs.readFile(EVENTS_FILE, 'utf8');
        events = JSON.parse(data);
        Logger.info('Events loaded successfully from events.json');
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            Logger.warn('events.json not found. Initializing with an empty array.');
            await saveEvents();
        } else {
            Logger.error('Error loading events from events.json:', error);
            events = [];
        }
    }
    return events;
}

export async function saveEvents(): Promise<void> {
    try {
        await fs.mkdir(path.dirname(EVENTS_FILE), { recursive: true });
        await fs.writeFile(EVENTS_FILE, JSON.stringify(events, null, 2), 'utf8');
    } catch (error) {
        Logger.error('Error saving events to events.json:', error);
    }
}

export async function addEvent(event: Event): Promise<void> {
    events.push(event);
    await saveEvents();
}

export async function removeEvent(eventId: string): Promise<void> {
    events = events.filter(e => e.id !== eventId);
    await saveEvents();
}

export function getEvents(): Event[] {
    return events;
}