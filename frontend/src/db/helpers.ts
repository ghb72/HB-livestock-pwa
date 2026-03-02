/**
 * Database helper utilities for ID generation and timestamps.
 */

import type { Table } from "dexie";

/**
 * Generate a sequential ID with a given prefix.
 *
 * Example: generateId("ANI", db.animals) → "ANI-042"
 */
export async function generateId(
  prefix: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: Table<any, any>,
): Promise<string> {
  const count = await table.count();
  const next = count + 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}

/** Current ISO 8601 timestamp. */
export function now(): string {
  return new Date().toISOString();
}

/** Get the active user ID from localStorage. */
export function currentUserId(): string {
  return localStorage.getItem("livestock_user_id") ?? "USR-001";
}
