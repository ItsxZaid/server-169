export enum AuditAction {
    BOOKING_CREATE = 'BOOKING_CREATE',
    BOOKING_CANCEL = 'BOOKING_CANCEL',
    ADMIN_DATE_ADD = 'ADMIN_DATE_ADD',
    ADMIN_DELIVERER_ADD = 'ADMIN_DELIVERER_ADD',
    ADMIN_BOOKING_CANCEL = 'ADMIN_BOOKING_CANCEL',
}

export async function logAuditEvent(action: AuditAction, message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${action}] ${message}\n`;

    try {
        console.log(logEntry)
    } catch (error) {
        console.error('Failed to write to audit log:', error);
    }
}