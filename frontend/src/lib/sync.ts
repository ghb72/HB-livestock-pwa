/**
 * Sync engine — push-then-pull with visibility-aware polling.
 *
 * Implements the feed_pwa sync architecture adapted for 7 livestock tables.
 *
 * Key lessons applied:
 *   L1: Never pull from stale snapshot after push — re-fetch remote after any push
 *   L2: Compare content not just timestamps — handle external Sheets edits
 *   L4: Protect unsynced local data — only overwrite synced=1 records
 *   L5: Free-tier constraints — visibility-aware polling, short-lived HTTP
 *
 * Polls every 60s while the tab is visible, pauses when hidden, and resumes on
 * focus or when connectivity returns. An idle tick costs a single
 * GET /api/sync/state; a full pull only runs when the server version changes.
 * Repeated failures back off exponentially up to MAX_BACKOFF_MS.
 */

import { db } from './db';
import {
	ApiError,
	apiGetSyncState,
	apiSyncTable,
	apiPullAll,
	apiUploadPhotos,
	isAuthenticated
} from './api';
import { now } from './helpers';
import type { ApiSyncState } from './api';
import type { AnimalPhoto } from './types';

const POLL_INTERVAL = 60_000;

// Cap the retry delay so a long outage settles at one attempt every ~16 min
// instead of hammering the API 60 times an hour at the base interval.
const MAX_BACKOFF_MS = 16 * 60_000;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
let lastKnownSyncState: ApiSyncState | null = null;
let failureStreak = 0;
let nextAllowedSyncAt = 0;

const REMOTE_PHOTO_CACHE_LIMIT = 150;

export type SyncStatus = 'syncing' | 'offline' | 'synced';

function dispatchSyncStatus(status: SyncStatus): void {
	if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent<SyncStatus>('sync-status', { detail: status }));
	}
}

// ── Table config ─────────────────────────────────────────

interface TableConfig {
	name: string;
	pk: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	table: () => import('dexie').Table<any, any>;
}

const TABLES: TableConfig[] = [
	{ name: 'animals', pk: 'animal_id', table: () => db.animals },
	{ name: 'health', pk: 'salud_id', table: () => db.health },
	{ name: 'reproduction', pk: 'reproduccion_id', table: () => db.reproduction },
	{ name: 'observations', pk: 'observacion_id', table: () => db.observations },
	{ name: 'sales', pk: 'venta_id', table: () => db.sales },
	{ name: 'recorridos', pk: 'entry_id', table: () => db.recorridos }
];

// ── Pending detection ────────────────────────────────────

/** Total unsynced records across every synced table plus photos. */
export async function countPendingChanges(): Promise<number> {
	const counts = await Promise.all([
		...TABLES.map((t) => t.table().where('synced').equals(0).count()),
		db.photos.where('synced').equals(0).count()
	]);
	return counts.reduce((total, count) => total + count, 0);
}

async function hasPendingLocalChanges(): Promise<boolean> {
	return (await countPendingChanges()) > 0;
}

// ── Failure backoff ──────────────────────────────────────

function resetBackoff(): void {
	failureStreak = 0;
	nextAllowedSyncAt = 0;
}

function registerFailure(): void {
	failureStreak += 1;
	nextAllowedSyncAt = Date.now() + Math.min(POLL_INTERVAL * 2 ** failureStreak, MAX_BACKOFF_MS);
}

function isSyncStateEqual(left: ApiSyncState | null, right: ApiSyncState): boolean {
	return !!left && left.version === right.version && left.modified_at === right.modified_at;
}

// ── Content comparison (L2) ──────────────────────────────

function hasRecordChanged(
	local: Record<string, unknown>,
	remote: Record<string, unknown>,
	pk: string
): boolean {
	for (const key of Object.keys(remote)) {
		if (key === pk || key === 'synced' || key === 'deleted' || key === '_sync_status') continue;
		if (String(local[key] ?? '') !== String(remote[key] ?? '')) return true;
	}
	return false;
}

// ── Push + Pull per table ────────────────────────────────

async function syncTableRecords(config: TableConfig): Promise<number> {
	const { name, pk, table: getTable } = config;
	const tbl = getTable();

	try {
		// Get ALL pending records (both modified and soft-deleted)
		const pending = await tbl.where('synced').equals(0).toArray();

		// Push pending → receive merged from server
		const merged = await apiSyncTable(
			name,
			pending.map((r: Record<string, unknown>) => {
				const copy = { ...r };
				// Convert synced/deleted to format backend understands
				delete copy.synced;
				delete copy.deleted;
				if (r.deleted === 1) {
					copy._deleted = true;
				}
				return copy;
			})
		);

		// Mark pushed records as synced (server accepted them)
		for (const r of pending) {
			await tbl.update(String(r[pk]), { synced: 1 });
		}

		// Smart merge: apply server's merged state (L2, L4)
		const remoteIds = new Set(merged.map((r) => String(r[pk])));

		for (const remote of merged) {
			const id = String(remote[pk]);
			const local = await tbl.get(id);

			if (!local) {
				// New remote record
				await tbl.put({ ...remote, synced: 1, deleted: 0 });
			} else if (local.synced === 1 && hasRecordChanged(local, remote, pk)) {
				// Only overwrite if local is synced (L4) and content differs (L2)
				await tbl.update(id, { ...remote, synced: 1, deleted: 0 });
			}
			// If local.synced === 0 (changed DURING sync), keep local version
		}

		// Remove synced local records not in remote (external deletes)
		const syncedLocal = await tbl.where('synced').equals(1).toArray();
		for (const local of syncedLocal) {
			const id = String(local[pk]);
			if (!local.deleted && !remoteIds.has(id)) {
				await tbl.delete(id);
			}
		}

		// Clean up locally deleted records that were synced to server
		const deletedLocal = await tbl
			.where('deleted')
			.equals(1)
			.filter((r: Record<string, unknown>) => r.synced === 1)
			.toArray();
		for (const local of deletedLocal) {
			await tbl.delete(String(local[pk]));
		}

		return pending.length;
	} catch {
		return 0;
	}
}

// ── Photo sync ───────────────────────────────────────────

async function syncPhotos(): Promise<number> {
	try {
		const pending: AnimalPhoto[] = await db.photos
			.where('synced')
			.equals(0)
			.filter((p) => p.deleted === 0 && !!p.data_url)
			.toArray();

		if (pending.length === 0) return 0;

		const result = await apiUploadPhotos(
			pending.map((p) => ({
				photo_id: p.photo_id,
				animal_id: p.animal_id,
				data_url: p.data_url
			}))
		);
		const { uploaded, errors } = result;

		await db.transaction('rw', db.photos, db.animals, async () => {
			for (const item of uploaded) {
				await db.photos.update(item.photo_id, {
					drive_url: item.drive_url,
					synced: 1
				});
				await db.animals
					.where('animal_id')
					.equals(item.animal_id)
					.modify({
						foto_url: item.drive_url,
						synced: 0,
						updated_at: now()
					});
			}
		});

		if (errors.length > 0) {
			throw new ApiError(502, errors.map((item) => `${item.photo_id}: ${item.error}`).join(' | '));
		}

		return uploaded.length;
	} catch (error) {
		console.error('Photo sync failed', error);
		throw error;
	}
}

// ── Batch pull helper ────────────────────────────────────

async function pullAndApplyAll(): Promise<void> {
	const fresh = await apiPullAll();
	const freshData = fresh as unknown as Record<TableConfig['name'], Record<string, unknown>[]>;

	for (const config of TABLES) {
		const remoteRecords = freshData[config.name] ?? [];
		const tbl = config.table();

		const remoteIds = new Set(remoteRecords.map((r) => String(r[config.pk])));

		for (const remote of remoteRecords) {
			const id = String(remote[config.pk]);
			const local = await tbl.get(id);

			if (!local) {
				await tbl.put({ ...remote, synced: 1, deleted: 0 });
			} else if (local.synced === 1 && hasRecordChanged(local, remote, config.pk)) {
				await tbl.update(id, { ...remote, synced: 1, deleted: 0 });
			}
		}

		// Remove synced records not in remote (external deletes)
		const syncedLocal = await tbl.where('synced').equals(1).toArray();
		for (const local of syncedLocal) {
			if (!local.deleted && !remoteIds.has(String(local[config.pk]))) {
				await tbl.delete(String(local[config.pk]));
			}
		}
	}
}

function preloadImage(url: string): Promise<void> {
	return new Promise((resolve) => {
		const img = new Image();
		img.decoding = 'async';
		img.loading = 'eager';
		img.onload = () => resolve();
		img.onerror = () => resolve();
		img.src = url;
	});
}

const warmedPhotoUrls = new Set<string>();

async function warmRemotePhotoCache(): Promise<void> {
	if (typeof Image === 'undefined' || typeof navigator === 'undefined' || !navigator.onLine) return;

	const [animals, photos] = await Promise.all([
		db.animals.where('deleted').equals(0).toArray(),
		db.photos.where('deleted').equals(0).toArray()
	]);

	const cachedPhotoUrls = new Set(
		photos.filter((photo) => !!photo.data_url).map((photo) => photo.drive_url).filter(Boolean)
	);

	const remoteUrls = new Set<string>();
	for (const animal of animals) {
		if (animal.foto_url && !cachedPhotoUrls.has(animal.foto_url)) {
			remoteUrls.add(animal.foto_url);
		}
	}
	for (const photo of photos) {
		if (photo.drive_url && !photo.data_url) {
			remoteUrls.add(photo.drive_url);
		}
	}

	let warmed = 0;
	for (const url of remoteUrls) {
		// At a 60s cadence re-preloading the same URLs every cycle is pure noise;
		// the first pass already put them in the service worker image cache.
		if (warmedPhotoUrls.has(url)) continue;
		await preloadImage(url);
		warmedPhotoUrls.add(url);
		warmed += 1;
		if (warmed >= REMOTE_PHOTO_CACHE_LIMIT) break;
	}
}

// ── Core sync orchestrator ───────────────────────────────

export async function syncAll(forceRemotePull = false): Promise<void> {
	if (isSyncing || !isAuthenticated()) return;
	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		dispatchSyncStatus('offline');
		return;
	}
	// A user-forced sync always bypasses the backoff — it is the manual escape
	// hatch when the automatic cycle is stuck behind a long retry delay.
	if (!forceRemotePull && Date.now() < nextAllowedSyncAt) return;

	isSyncing = true;
	dispatchSyncStatus('syncing');

	try {
		const pendingLocalChanges = await hasPendingLocalChanges();
		let nextSyncState: ApiSyncState | null = null;

		// Lightweight check: skip sync if nothing changed (L5: save API calls)
		if (!forceRemotePull && !pendingLocalChanges) {
			try {
				nextSyncState = await apiGetSyncState();
				if (isSyncStateEqual(lastKnownSyncState, nextSyncState)) {
					resetBackoff();
					dispatchSyncStatus('synced');
					return;
				}
			} catch {
				nextSyncState = null;
			}
		}

		// Photos first (so Drive URLs are available for animal records)
		await syncPhotos();

		// Push only tables that have pending changes
		if (pendingLocalChanges) {
			for (const config of TABLES) {
				const pending = await config.table().where('synced').equals(0).count();
				if (pending > 0) {
					await syncTableRecords(config);
				}
			}
		}

		// Single batch pull for all tables (1 API call → backend reads all sheets at once)
		await pullAndApplyAll();
		await warmRemotePhotoCache();

		nextSyncState = await apiGetSyncState().catch(() => null);
		lastKnownSyncState = nextSyncState;
		resetBackoff();
		dispatchSyncStatus('synced');

		if (typeof window !== 'undefined') {
			window.dispatchEvent(new CustomEvent('sync-complete'));
		}
	} catch {
		registerFailure();
		dispatchSyncStatus('offline');
	} finally {
		isSyncing = false;
	}
}

export function getIsSyncing(): boolean {
	return isSyncing;
}

// ── Polling with Page Visibility API (L5) ────────────────

function startPolling(): void {
	if (pollTimer) return;
	syncAll();
	pollTimer = setInterval(() => syncAll(), POLL_INTERVAL);
}

function stopPolling(): void {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
}

function handleVisibilityChange(): void {
	if (document.hidden) {
		stopPolling();
	} else {
		startPolling();
	}
}

function handleUserInteraction(): void {
	if (document.hidden) return;
	if (!pollTimer) {
		// startPolling() already fires an immediate sync.
		startPolling();
		return;
	}
	// Timer already running: refocusing should still sync now rather than
	// leaving the user waiting for the next tick.
	syncAll();
}

function handleOnline(): void {
	// Connectivity is back, so whatever caused the previous failures is likely
	// resolved — retry immediately instead of sitting out the backoff delay.
	resetBackoff();
	syncAll();
}

function handleOffline(): void {
	dispatchSyncStatus('offline');
}

export function initSync(): () => void {
	if (typeof document === 'undefined') return () => {};

	document.addEventListener('visibilitychange', handleVisibilityChange);
	window.addEventListener('focus', handleUserInteraction);
	window.addEventListener('online', handleOnline);
	window.addEventListener('offline', handleOffline);

	if (!document.hidden) {
		startPolling();
	}

	return () => {
		stopPolling();
		document.removeEventListener('visibilitychange', handleVisibilityChange);
		window.removeEventListener('focus', handleUserInteraction);
		window.removeEventListener('online', handleOnline);
		window.removeEventListener('offline', handleOffline);
	};
}
