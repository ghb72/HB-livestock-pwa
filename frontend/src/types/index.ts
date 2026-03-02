/**
 * Core type definitions for Livestock Register PWA.
 *
 * All types mirror the IndexedDB / Google Sheets data model.
 * Enums use Spanish values matching the XLSX template.
 */

// ── Sync metadata (IndexedDB only) ──

export type SyncStatus = "synced" | "pending" | "conflict";

export interface SyncMeta {
  _sync_status: SyncStatus;
  updated_at: string; // ISO 8601
  created_at: string; // ISO 8601
  created_by: string; // user_id
}

// ── Enums ──

export type AnimalTipo =
  | "Semental"
  | "Becerro(a)"
  | "Vaquilla"
  | "Vaca"
  | "Torete";

export type Sexo = "Macho" | "Hembra";

export type Temperamento = "Normal" | "Manso(a)" | "Bravo(a)";

export type EstadoAnimal = "Vivo(a)" | "Muerto(a)" | "Vendido(a)";

export type TipoEventoSalud =
  | "Vacuna"
  | "Desparasitación"
  | "Vitamina"
  | "Enfermedad"
  | "Tratamiento"
  | "Revisión";

export type EstadoGeneral = "Fuerte" | "Flaco" | "Enfermo";

export type PrenezEstado = "Sí" | "No" | "Pendiente";

export type MotivoVenta =
  | "Por peso (destete)"
  | "Por edad"
  | "Por productividad"
  | "Otro";

// ── Data models ──

export interface Animal extends SyncMeta {
  animal_id: string;
  arete_id: string;
  nombre: string;
  tipo: AnimalTipo;
  sexo: Sexo;
  fecha_nacimiento: string;
  raza: string;
  madre_id: string;
  padre_id: string;
  temperamento: Temperamento;
  estado: EstadoAnimal;
  peso_actual: number | null;
  notas: string;
  foto_url: string;
}

export interface HealthRecord extends SyncMeta {
  salud_id: string;
  animal_id: string;
  fecha: string;
  tipo_evento: TipoEventoSalud;
  producto: string;
  dosis: string;
  estado_general: EstadoGeneral;
  proxima_aplicacion: string;
  notas: string;
}

export interface ReproductionRecord extends SyncMeta {
  reproduccion_id: string;
  vaca_id: string;
  semental_id: string;
  fecha_monta: string;
  fecha_posible_parto: string;
  prenez_confirmada: PrenezEstado;
  fecha_parto_real: string;
  cria_id: string;
  peso_destete_cria: number | null;
  notas: string;
}

export interface Observation extends SyncMeta {
  observacion_id: string;
  fecha: string;
  animal_id: string;
  notas: string;
}

export interface Sale extends SyncMeta {
  venta_id: string;
  animal_id: string;
  fecha_venta: string;
  motivo_venta: MotivoVenta;
  peso: number | null;
  precio_total: number | null;
  precio_kg: number | null;
  comprador: string;
  notas: string;
}

export interface RecorridoEntry extends SyncMeta {
  recorrido_id: string;
  fecha: string;
  animal_id: string;
  notas: string;
}

/** Photo stored locally as base64 until synced to Google Drive. */
export interface AnimalPhoto {
  photo_id: string;
  animal_id: string;
  data_url: string;     // base64 data URI (offline cache)
  drive_url: string;    // Google Drive URL (filled after sync)
  _sync_status: SyncStatus;
  created_at: string;
}

export interface User {
  user_id: string;
  nombre: string;
  pin_hash: string;
  created_at: string;
}
