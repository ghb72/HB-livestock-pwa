/**
 * Hook to detect animals that haven't been seen in recent roundups.
 *
 * An animal is flagged as "missing" if:
 * - It has estado "Vivo(a)", AND
 * - It was NOT seen in the last 3 roundups, OR
 * - It was NOT seen in the last 30 days (if any roundups exist)
 */

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";

export interface MissingAnimalInfo {
  /** Set of animal_ids that are flagged as missing. */
  missingIds: Set<string>;
  /** Last seen date per animal_id (empty string if never seen). */
  lastSeenMap: Map<string, string>;
}

const MISSING_DAYS_THRESHOLD = 30;
const MISSING_VISITS_THRESHOLD = 3;

/**
 * Returns the set of animal IDs flagged as potentially missing
 * and the last-seen date for each animal.
 */
export function useMissingAnimals(): MissingAnimalInfo {
  const result = useLiveQuery(async () => {
    const allRecorridos = await db.recorridos.toArray();

    if (allRecorridos.length === 0) {
      return { missingIds: new Set<string>(), lastSeenMap: new Map<string, string>() };
    }

    // Get distinct roundup sessions sorted by date descending
    const sessionDates = new Map<string, string>();
    for (const entry of allRecorridos) {
      const existing = sessionDates.get(entry.recorrido_id);
      if (!existing || entry.fecha > existing) {
        sessionDates.set(entry.recorrido_id, entry.fecha);
      }
    }
    const sortedSessions = Array.from(sessionDates.entries())
      .sort((a, b) => b[1].localeCompare(a[1]));

    // Get the last N session IDs
    const recentSessionIds = new Set(
      sortedSessions.slice(0, MISSING_VISITS_THRESHOLD).map(([id]) => id),
    );

    // Build per-animal data
    const lastSeenMap = new Map<string, string>();
    const seenInRecentSessions = new Map<string, Set<string>>();

    for (const entry of allRecorridos) {
      // Track last seen date
      const currentLast = lastSeenMap.get(entry.animal_id) ?? "";
      if (entry.fecha > currentLast) {
        lastSeenMap.set(entry.animal_id, entry.fecha);
      }

      // Track which recent sessions this animal appeared in
      if (recentSessionIds.has(entry.recorrido_id)) {
        const sessions = seenInRecentSessions.get(entry.animal_id) ?? new Set();
        sessions.add(entry.recorrido_id);
        seenInRecentSessions.set(entry.animal_id, sessions);
      }
    }

    // Get all alive animals
    const aliveAnimals = await db.animals
      .where("estado")
      .equals("Vivo(a)")
      .toArray();

    const now = new Date();
    const missingIds = new Set<string>();

    for (const animal of aliveAnimals) {
      const lastSeen = lastSeenMap.get(animal.animal_id);

      // Never seen in any roundup → flag if we have enough roundups
      if (!lastSeen) {
        if (sortedSessions.length >= MISSING_VISITS_THRESHOLD) {
          missingIds.add(animal.animal_id);
        }
        continue;
      }

      // Check 30-day rule
      const daysSinceSeen = Math.floor(
        (now.getTime() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSinceSeen >= MISSING_DAYS_THRESHOLD) {
        missingIds.add(animal.animal_id);
        continue;
      }

      // Check 3-visit rule: not seen in any of the last 3 roundups
      const sessionsSeenIn = seenInRecentSessions.get(animal.animal_id);
      if (
        sortedSessions.length >= MISSING_VISITS_THRESHOLD &&
        (!sessionsSeenIn || sessionsSeenIn.size === 0)
      ) {
        missingIds.add(animal.animal_id);
      }
    }

    return { missingIds, lastSeenMap };
  });

  return result ?? { missingIds: new Set(), lastSeenMap: new Map() };
}
