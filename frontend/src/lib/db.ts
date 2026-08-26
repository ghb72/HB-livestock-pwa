/**
 * Dexie.js (IndexedDB) database definition.
 *
 * Provides offline-first persistent storage for all livestock data.
 * Fresh schema v1 — no migration from React version needed.
 * Uses numeric 0|1 for synced/deleted flags (efficient IndexedDB indexing).
 */

import Dexie, { type EntityTable } from 'dexie';
import type {
	Animal,
	AnimalPhoto,
	HealthRecord,
	Observation,
	RecorridoEntry,
	ReproductionRecord,
	Sale,
	User
} from './types';

const db = new Dexie('LivestockRegister') as Dexie & {
	animals: EntityTable<Animal, 'animal_id'>;
	health: EntityTable<HealthRecord, 'salud_id'>;
	reproduction: EntityTable<ReproductionRecord, 'reproduccion_id'>;
	observations: EntityTable<Observation, 'observacion_id'>;
	sales: EntityTable<Sale, 'venta_id'>;
	recorridos: EntityTable<RecorridoEntry, 'entry_id'>;
	photos: EntityTable<AnimalPhoto, 'photo_id'>;
	users: EntityTable<User, 'user_id'>;
};

db.version(1).stores({
	animals: 'animal_id, arete_id, nombre, tipo, sexo, estado, synced, deleted',
	health: 'salud_id, animal_id, fecha, tipo_evento, synced, deleted',
	reproduction: 'reproduccion_id, vaca_id, semental_id, fecha_monta, synced, deleted',
	observations: 'observacion_id, animal_id, fecha, synced, deleted',
	sales: 'venta_id, animal_id, fecha_venta, synced, deleted',
	recorridos: 'recorrido_id, fecha, animal_id, synced, deleted',
	photos: 'photo_id, animal_id, synced, deleted',
	users: 'user_id, nombre'
});

db.version(2).stores({
	animals: 'animal_id, arete_id, nombre, tipo, sexo, estado, synced, deleted',
	health: 'salud_id, animal_id, fecha, tipo_evento, synced, deleted',
	reproduction: 'reproduccion_id, vaca_id, semental_id, fecha_monta, synced, deleted',
	observations: 'observacion_id, animal_id, fecha, synced, deleted',
	sales: 'venta_id, animal_id, fecha_venta, synced, deleted',
	recorridos: 'entry_id, recorrido_id, fecha, animal_id, synced, deleted',
	photos: 'photo_id, animal_id, synced, deleted',
	users: 'user_id, nombre'
});

db.version(3).stores({
	animals: 'animal_id, arete_id, nombre, tipo, sexo, estado, madre_id, padre_id, synced, deleted',
	health: 'salud_id, animal_id, fecha, tipo_evento, synced, deleted',
	reproduction: 'reproduccion_id, vaca_id, semental_id, fecha_monta, synced, deleted',
	observations: 'observacion_id, animal_id, fecha, synced, deleted',
	sales: 'venta_id, animal_id, fecha_venta, synced, deleted',
	recorridos: 'entry_id, recorrido_id, fecha, animal_id, synced, deleted',
	photos: 'photo_id, animal_id, synced, deleted',
	users: 'user_id, nombre'
});

// Renames the legacy Google Drive-era field to photo_url. Nothing indexed
// changes, but the upgrade has to run before the sync engine reads a row: a
// photo whose photo_url is undefined looks like one that was never uploaded,
// and the deletion purge would drop it locally without clearing the bucket.
db.version(4)
	.stores({
		animals: 'animal_id, arete_id, nombre, tipo, sexo, estado, madre_id, padre_id, synced, deleted',
		health: 'salud_id, animal_id, fecha, tipo_evento, synced, deleted',
		reproduction: 'reproduccion_id, vaca_id, semental_id, fecha_monta, synced, deleted',
		observations: 'observacion_id, animal_id, fecha, synced, deleted',
		sales: 'venta_id, animal_id, fecha_venta, synced, deleted',
		recorridos: 'entry_id, recorrido_id, fecha, animal_id, synced, deleted',
		photos: 'photo_id, animal_id, synced, deleted',
		users: 'user_id, nombre'
	})
	.upgrade((tx) =>
		tx
			.table('photos')
			.toCollection()
			.modify((photo: Record<string, unknown>) => {
				if ('drive_url' in photo) {
					photo.photo_url = photo.drive_url ?? '';
					delete photo.drive_url;
				}
			})
	);

export { db };
