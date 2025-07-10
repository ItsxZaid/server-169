import { ColorResolvable } from "discord.js";

export const ALLIANCE_TAG_IDENTIFIER = 'Alliance';

export const PENDING_APPLICANT_ROLE = {
    name: 'Candidate',
    color: '#808080' as ColorResolvable
};

export const RANK_ROLES: { name: string, color: ColorResolvable }[] = [
    { name: 'R1', color: '#1abc9c' },
    { name: 'R2', color: '#2ecc71' },
    { name: 'R3', color: '#3498db' },
    { name: 'R4', color: '#9b59b6' },
    { name: 'R5', color: '#e91e63' },
];

export const SPECIAL_RANK_ROLES = [
    { base_role: 'R5', special_role: 'Overlord', color: '#f1c40f' as ColorResolvable },
    { base_role: 'R4', special_role: 'Strategos', color: '#e67e22' as ColorResolvable },
];

export const ALLIANCE_CHANNELS = [
    { name: 'events-and-reminders', permissionType: 'announcement' },
    { name: '{alliance_name}-war-channel', permissionType: 'general' },
    { name: 'chit-chat', permissionType: 'general' },
    { name: '{alliance_name}-leadership-channel', permissionType: 'leadership' },
    { name: '{alliance_name}-leadership-chat', permissionType: 'leadership' },
    { name: '{alliance_name}-voice-channel', permissionType: 'general', isVoiceChannel: true },
];

export const SERVER_CHANNELS = [
    { name: 'r5-management-chat', permissionType: 'r5_only' },
    { name: 'buff-management', permissionType: 'general' },
    { name: 'chit-chat', permissionType: 'general' },
    { name: 'events-and-reminders', permissionType: 'announcement' },
];
