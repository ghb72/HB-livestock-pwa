/**
 * Missing animal detection — Svelte reactive version.
 *
 * An animal is flagged as "missing" if:
 * - It has estado "Vivo(a)", AND
 * - It was NOT seen in the last 3 roundups, OR
 * - It was NOT seen in the last 30 days (if any roundups exist)
 */

import { db } from '$lib/db';

export interface MissingAnimalInfo {
	missingIds: Set<string>;
	lastSeenMap: Map<string, string>;
}

const MISSING_DAYS_THRESHOLD = 30;
const MISSING_VISITS_THRESHOLD = 3;

const EMPTY: MissingAnimalInfo = {
	missingIds: new Set(),
	lastSeenMap: new Map()
};

export async function computeMissingAnimals(): Promise<MissingAnimalInfo> {
	const allRecorridos = await db.recorridos.where('deleted').equals(0).toArray();
	if (allRecorridos.length === 0) return EMPTY;

	const sessionDates = new Map<string, string>();
	for (const entry of allRecorridos) {
		const existing = sessionDates.get(entry.recorrido_id);
		if (!existing || entry.fecha > existing) {
			sessionDates.set(entry.recorrido_id, entry.fecha);
		}
	}

	const sortedSessions = Array.from(sessionDates.entries()).sort((a, b) =>
		b[1].localeCompare(a[1])
	);

	const recentSessionIds = new Set(
		sortedSessions.slice(0, MISSING_VISITS_THRESHOLD).map(([id]) => id)
	);

	const lastSeenMap = new Map<string, string>();
	const seenInRecentSessions = new Map<string, Set<string>>();

	for (const entry of allRecorridos) {
		const currentLast = lastSeenMap.get(entry.animal_id) ?? '';
		if (entry.fecha > currentLast) {
			lastSeenMap.set(entry.animal_id, entry.fecha);
		}

		if (recentSessionIds.has(entry.recorrido_id)) {
			const sessions = seenInRecentSessions.get(entry.animal_id) ?? new Set();
			sessions.add(entry.recorrido_id);
			seenInRecentSessions.set(entry.animal_id, sessions);
		}
	}

	const aliveAnimals = await db.animals
		.where('estado')
		.equals('Vivo(a)')
		.filter((a) => a.deleted === 0)
		.toArray();

	const now = new Date();
	const missingIds = new Set<string>();

	for (const animal of aliveAnimals) {
		const lastSeen = lastSeenMap.get(animal.animal_id);

		if (!lastSeen) {
			if (sortedSessions.length >= MISSING_VISITS_THRESHOLD) {
				missingIds.add(animal.animal_id);
			}
			continue;
		}

		const daysSinceSeen = Math.floor(
			(now.getTime() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24)
		);
		if (daysSinceSeen >= MISSING_DAYS_THRESHOLD) {
			missingIds.add(animal.animal_id);
			continue;
		}

		const sessionsSeenIn = seenInRecentSessions.get(animal.animal_id);
		if (
			sortedSessions.length >= MISSING_VISITS_THRESHOLD &&
			(!sessionsSeenIn || sessionsSeenIn.size === 0)
		) {
			missingIds.add(animal.animal_id);
		}
	}

	return { missingIds, lastSeenMap };
}
