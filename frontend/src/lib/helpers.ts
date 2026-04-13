/**
 * Database helper utilities for ID generation and timestamps.
 */

/**
 * Generate a unique ID with a given prefix using crypto.randomUUID.
 *
 * Example: generateId("SAL") → "SAL-a1b2c3d4"
 */
export function generateId(prefix: string): string {
	const uuid = crypto.randomUUID().replace(/-/g, '');
	return `${prefix}-${uuid.slice(0, 8)}`;
}

/** Current ISO 8601 timestamp. */
export function now(): string {
	return new Date().toISOString();
}

/** Get the active user ID from localStorage. */
export function currentUserId(): string {
	return localStorage.getItem('livestock_user_id') ?? 'USR-001';
}
