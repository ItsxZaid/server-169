import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from './logger';
import { Snowflake } from 'discord.js';
import { AuditAction, logAuditEvent } from './auditLogger';

const BUFFS_FILE = path.join(__dirname, '../../buffs.json');

export const BUFF_CATEGORIES = ['Building', 'Research', 'Training'];
export const BUFF_ADMIN_ROLE = 'R5';

export interface BuffBooking {
    time: string; // "HH:00"
    userId: Snowflake;
    username: string;
    category: string;
}

export interface BuffData {
    [date: string]: BuffBooking[];
}

export interface BuffDeliverer {
    userId: Snowflake;
    username: string;
}

interface BuffStore {
    validDates: string[];
    bookings: BuffData;
    deliverers: BuffDeliverer[];
}

let store: BuffStore = {
    validDates: [],
    bookings: {},
    deliverers: []
};

export async function loadBuffs(): Promise<BuffStore> {
    try {
        const data = await fs.readFile(BUFFS_FILE, 'utf8');
        store = JSON.parse(data);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            await saveBuffs();
        } else {
            Logger.error('Error loading buff data:', error);
        }
    }
    return store;
}

export async function saveBuffs(): Promise<void> {
    try {
        await fs.mkdir(path.dirname(BUFFS_FILE), { recursive: true });
        await fs.writeFile(BUFFS_FILE, JSON.stringify(store, null, 2), 'utf8');
    } catch (error) {
        Logger.error('Error saving buff data:', error);
    }
}

export function getStore(): BuffStore {
    return store;
}

export async function addValidDate(date: string, adminUsername: string): Promise<void> {
    if (!store.validDates.includes(date)) {
        store.validDates.push(date);
        store.validDates.sort();
        await saveBuffs();
        await logAuditEvent(AuditAction.ADMIN_DATE_ADD, `Admin '${adminUsername}' added valid date: ${date}`);
    }
}

export async function addDeliverer(userId: Snowflake, username: string, adminUsername: string): Promise<void> {
    if (!store.deliverers.some(d => d.userId === userId)) {
        store.deliverers.push({ userId, username });
        await saveBuffs();
        await logAuditEvent(AuditAction.ADMIN_DELIVERER_ADD, `Admin '${adminUsername}' added deliverer: ${username} (${userId})`);
    }
}

export async function bookSlot(date: string, time: string, userId: Snowflake, username: string, category: string): Promise<boolean> {
    if (!store.bookings[date]) {
        store.bookings[date] = [];
    }
    if (store.bookings[date].some(b => b.time === time)) {
        return false;
    }
    store.bookings[date].push({ time, userId, username, category });
    store.bookings[date].sort((a, b) => a.time.localeCompare(b.time));
    await saveBuffs();
    await logAuditEvent(AuditAction.BOOKING_CREATE, `User '${username}' (${userId}) booked '${category}' buff for ${date} at ${time}`);
    return true;
}

export async function cancelSlot(date: string, time: string, userId: Snowflake, username: string, adminAction: boolean = false, adminUsername?: string): Promise<boolean> {
    if (!store.bookings[date]) return false;
    const initialLength = store.bookings[date].length;
    store.bookings[date] = store.bookings[date].filter(b => !(b.time === time && (adminAction || b.userId === userId)));

    if (store.bookings[date].length < initialLength) {
        await saveBuffs();
        if (adminAction) {
            await logAuditEvent(AuditAction.ADMIN_BOOKING_CANCEL, `Admin '${adminUsername}' cancelled booking for '${username}' on ${date} at ${time}`);
        } else {
            await logAuditEvent(AuditAction.BOOKING_CANCEL, `User '${username}' (${userId}) cancelled booking on ${date} at ${time}`);
        }
        return true;
    }
    return false;
}