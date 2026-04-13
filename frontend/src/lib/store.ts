/**
 * Local CRUD store — all writes go to IndexedDB first.
 *
 * Pattern: write to DB → mark synced=0 → UI updates instantly.
 * Soft deletes: deleted=1, synced=0 (never physically remove until sync).
 */

import { db } from './db';
import { generateId, now, currentUserId } from './helpers';
import type {
	Animal,
	AnimalPhoto,
	HealthRecord,
	Observation,
	RecorridoEntry,
	ReproductionRecord,
	Sale
} from './types';

// ── Animals ──────────────────────────────────────────────

export async function getAnimals(): Promise<Animal[]> {
	return db.animals.where('deleted').equals(0).toArray();
}

export async function getAnimal(id: string): Promise<Animal | undefined> {
	const record = await db.animals.get(id);
	return record && !record.deleted ? record : undefined;
}

export async function createAnimal(
	data: Omit<Animal, 'animal_id' | keyof import('./types').SyncMeta>
): Promise<Animal> {
	const record: Animal = {
		...data,
		animal_id: generateId('ANI'),
		synced: 0,
		deleted: 0,
		created_at: now(),
		updated_at: now(),
		created_by: currentUserId()
	};
	await db.animals.add(record);
	return record;
}

export async function updateAnimal(
	id: string,
	data: Partial<Omit<Animal, 'animal_id' | keyof import('./types').SyncMeta>>
): Promise<void> {
	await db.animals.update(id, { ...data, synced: 0, updated_at: now() });
}

export async function deleteAnimal(id: string): Promise<void> {
	await db.animals.update(id, { deleted: 1, synced: 0, updated_at: now() });
}

// ── Health ───────────────────────────────────────────────

export async function getHealthRecords(animalId?: string): Promise<HealthRecord[]> {
	if (animalId) {
		return db.health
			.where('animal_id')
			.equals(animalId)
			.filter((r) => r.deleted === 0)
			.toArray();
	}
	return db.health.where('deleted').equals(0).toArray();
}

export async function createHealthRecord(
	data: Omit<HealthRecord, 'salud_id' | keyof import('./types').SyncMeta>
): Promise<HealthRecord> {
	const record: HealthRecord = {
		...data,
		salud_id: generateId('SAL'),
		synced: 0,
		deleted: 0,
		created_at: now(),
		updated_at: now(),
		created_by: currentUserId()
	};
	await db.health.add(record);
	return record;
}

export async function deleteHealthRecord(id: string): Promise<void> {
	await db.health.update(id, { deleted: 1, synced: 0, updated_at: now() });
}

// ── Reproduction ─────────────────────────────────────────

export async function getReproductionRecords(vacaId?: string): Promise<ReproductionRecord[]> {
	if (vacaId) {
		return db.reproduction
			.where('vaca_id')
			.equals(vacaId)
			.filter((r) => r.deleted === 0)
			.toArray();
	}
	return db.reproduction.where('deleted').equals(0).toArray();
}

export async function createReproductionRecord(
	data: Omit<ReproductionRecord, 'reproduccion_id' | keyof import('./types').SyncMeta>
): Promise<ReproductionRecord> {
	const record: ReproductionRecord = {
		...data,
		reproduccion_id: generateId('REP'),
		synced: 0,
		deleted: 0,
		created_at: now(),
		updated_at: now(),
		created_by: currentUserId()
	};
	await db.reproduction.add(record);
	return record;
}

export async function deleteReproductionRecord(id: string): Promise<void> {
	await db.reproduction.update(id, { deleted: 1, synced: 0, updated_at: now() });
}

// ── Observations ─────────────────────────────────────────

export async function getObservations(animalId?: string): Promise<Observation[]> {
	if (animalId) {
		return db.observations
			.where('animal_id')
			.equals(animalId)
			.filter((r) => r.deleted === 0)
			.toArray();
	}
	return db.observations.where('deleted').equals(0).toArray();
}

export async function createObservation(
	data: Omit<Observation, 'observacion_id' | keyof import('./types').SyncMeta>
): Promise<Observation> {
	const record: Observation = {
		...data,
		observacion_id: generateId('OBS'),
		synced: 0,
		deleted: 0,
		created_at: now(),
		updated_at: now(),
		created_by: currentUserId()
	};
	await db.observations.add(record);
	return record;
}

export async function deleteObservation(id: string): Promise<void> {
	await db.observations.update(id, { deleted: 1, synced: 0, updated_at: now() });
}

// ── Sales ────────────────────────────────────────────────

export async function getSales(): Promise<Sale[]> {
	return db.sales.where('deleted').equals(0).toArray();
}

export async function createSale(
	data: Omit<Sale, 'venta_id' | keyof import('./types').SyncMeta>
): Promise<Sale> {
	const record: Sale = {
		...data,
		venta_id: generateId('VEN'),
		synced: 0,
		deleted: 0,
		created_at: now(),
		updated_at: now(),
		created_by: currentUserId()
	};
	await db.sales.add(record);
	return record;
}

export async function deleteSale(id: string): Promise<void> {
	await db.sales.update(id, { deleted: 1, synced: 0, updated_at: now() });
}

// ── Recorridos ───────────────────────────────────────────

export async function getRecorridos(): Promise<RecorridoEntry[]> {
	return db.recorridos.where('deleted').equals(0).toArray();
}

export async function getRecorridosByDate(fecha: string): Promise<RecorridoEntry[]> {
	return db.recorridos
		.where('fecha')
		.equals(fecha)
		.filter((r) => r.deleted === 0)
		.toArray();
}

export async function createRecorrido(
	data: Omit<RecorridoEntry, 'recorrido_id' | keyof import('./types').SyncMeta>
): Promise<RecorridoEntry> {
	const record: RecorridoEntry = {
		...data,
		recorrido_id: generateId('REC'),
		synced: 0,
		deleted: 0,
		created_at: now(),
		updated_at: now(),
		created_by: currentUserId()
	};
	await db.recorridos.add(record);
	return record;
}

export async function deleteRecorrido(id: string): Promise<void> {
	await db.recorridos.update(id, { deleted: 1, synced: 0, updated_at: now() });
}

// ── Photos ───────────────────────────────────────────────

export async function getPhotos(animalId: string): Promise<AnimalPhoto[]> {
	return db.photos
		.where('animal_id')
		.equals(animalId)
		.filter((p) => p.deleted === 0)
		.toArray();
}

export async function addPhoto(animalId: string, dataUrl: string): Promise<AnimalPhoto> {
	const record: AnimalPhoto = {
		photo_id: generateId('PHO'),
		animal_id: animalId,
		data_url: dataUrl,
		drive_url: '',
		synced: 0,
		deleted: 0,
		created_at: new Date().toISOString()
	};
	await db.photos.add(record);
	return record;
}

export async function deletePhoto(id: string): Promise<void> {
	await db.photos.update(id, { deleted: 1, synced: 0 });
}
