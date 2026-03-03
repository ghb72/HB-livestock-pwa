/**
 * Dexie.js (IndexedDB) database definition.
 *
 * Provides offline-first persistent storage for all livestock data.
 * Each table mirrors a Google Sheets tab with added sync metadata.
 */

import Dexie, { type Table } from "dexie";
import type {
  Animal,
  AnimalPhoto,
  HealthRecord,
  Observation,
  RecorridoEntry,
  ReproductionRecord,
  Sale,
  User,
} from "../types";

export class LivestockDB extends Dexie {
  animals!: Table<Animal, string>;
  health!: Table<HealthRecord, string>;
  reproduction!: Table<ReproductionRecord, string>;
  observations!: Table<Observation, string>;
  sales!: Table<Sale, string>;
  recorridos!: Table<RecorridoEntry, string>;
  photos!: Table<AnimalPhoto, string>;
  users!: Table<User, string>;

  constructor() {
    super("LivestockRegister");

    this.version(1).stores({
      animals:
        "animal_id, arete_id, nombre, tipo, sexo, estado, _sync_status",
      health:
        "salud_id, animal_id, fecha, tipo_evento, _sync_status",
      reproduction:
        "reproduccion_id, vaca_id, semental_id, fecha_monta, _sync_status",
      observations:
        "observacion_id, animal_id, fecha, _sync_status",
      sales:
        "venta_id, animal_id, fecha_venta, _sync_status",
      users:
        "user_id, nombre",
    });

    this.version(2).stores({
      animals:
        "animal_id, arete_id, nombre, tipo, sexo, estado, _sync_status",
      health:
        "salud_id, animal_id, fecha, tipo_evento, _sync_status",
      reproduction:
        "reproduccion_id, vaca_id, semental_id, fecha_monta, _sync_status",
      observations:
        "observacion_id, animal_id, fecha, _sync_status",
      sales:
        "venta_id, animal_id, fecha_venta, _sync_status",
      recorridos:
        "++_rowId, recorrido_id, fecha, animal_id, _sync_status",
      users:
        "user_id, nombre",
    });

    this.version(3).stores({
      animals:
        "animal_id, arete_id, nombre, tipo, sexo, estado, _sync_status",
      health:
        "salud_id, animal_id, fecha, tipo_evento, _sync_status",
      reproduction:
        "reproduccion_id, vaca_id, semental_id, fecha_monta, _sync_status",
      observations:
        "observacion_id, animal_id, fecha, _sync_status",
      sales:
        "venta_id, animal_id, fecha_venta, _sync_status",
      recorridos:
        "++_rowId, recorrido_id, fecha, animal_id, _sync_status",
      photos:
        "photo_id, animal_id, _sync_status",
      users:
        "user_id, nombre",
    });

    this.version(4).stores({
      animals:
        "animal_id, arete_id, nombre, madre_id, padre_id, tipo, sexo, estado, _sync_status",
      health:
        "salud_id, animal_id, fecha, tipo_evento, _sync_status",
      reproduction:
        "reproduccion_id, vaca_id, semental_id, fecha_monta, _sync_status",
      observations:
        "observacion_id, animal_id, fecha, _sync_status",
      sales:
        "venta_id, animal_id, fecha_venta, _sync_status",
      recorridos:
        "++_rowId, recorrido_id, fecha, animal_id, _sync_status",
      photos:
        "photo_id, animal_id, _sync_status",
      users:
        "user_id, nombre",
    });
  }
}

export const db = new LivestockDB();
