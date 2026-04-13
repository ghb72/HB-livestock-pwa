# Livestock Register - Architecture & Development Plan

## Overview
PWA for livestock management (cattle ranching) with offline-first capability,
designed for users with minimal technology experience.

## Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Frontend | SvelteKit 2 + Svelte 5 + TypeScript | File-based routing, lightweight client app, ideal for offline PWA |
| Styling | Tailwind CSS 4 | Rapid UI, responsive, utility-first |
| Local DB | Dexie.js (IndexedDB) | Reliable offline storage with sync support |
| PWA | @vite-pwa/sveltekit + Workbox | Service worker, caching, install prompt |
| Backend | FastAPI (Python 3.11+) | Lightweight API, easy deploy on Render |
| Cloud DB | Google Sheets API (gspread) | XLSX-compatible, familiar to owner |
| Cloud Files | Google Drive API | Persistent photo storage |
| Auth | Shared Bearer token | Simple controlled access for small trusted teams |
| Env Mgr | Conda (miniconda3) | Single env for Python + Node.js |
| Deploy FE | Vercel | Free tier, git-based deploys |
| Deploy BE | Render | Free tier, Python support |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                    MOBILE DEVICE                     │
│  ┌───────────────────────────────────────────────┐  │
│  │        SvelteKit PWA (client rendered)         │  │
│  │  ┌─────────┐  ┌──────────┐  ┌─────────────┐  │  │
│  │  │   UI    │  │  Sync    │  │  Service     │  │  │
│  │  │ Spanish │  │  Engine  │  │  Worker      │  │  │
│  │  └────┬────┘  └────┬─────┘  └──────┬──────┘  │  │
│  │       │             │               │         │  │
│  │  ┌────▼─────────────▼───────────────▼──────┐  │  │
│  │  │          IndexedDB (Dexie.js)           │  │  │
│  │  │ animals | health | reproduction |       │  │  │
│  │  │ observations | sales | recorridos |     │  │  │
│  │  │ photos | users                           │  │  │
│  │  └────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS (when online)
                       ▼
┌──────────────────────────────────────────────────────┐
│                 FastAPI Backend                       │
│  ┌──────────┐  ┌───────────┐  ┌───────────────────┐ │
│  │  Auth    │  │  Sync     │  │  Google Sheets    │ │
│  │ Bearer   │  │  Engine   │  │  Service          │ │
│  └──────────┘  └───────────┘  └─────────┬─────────┘ │
└──────────────────────────────────────────┬───────────┘
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    ▼                                             ▼
          ┌──────────────────┐                         ┌──────────────────┐
          │  Google Sheets   │                         │   Google Drive   │
          │  (Cloud DB)      │                         │  Photo storage   │
          └──────────────────┘                         └──────────────────┘
```

## Data Model (Sheets + Local Tables)

Google Sheets stores the synced business tables. IndexedDB stores the same
domain records plus local-only metadata such as `synced`, `deleted`, and
pending photo payloads.

### 1. Usuarios
| Column | Type | Description |
|--------|------|-------------|
| user_id | string | Auto: USR-001 |
| nombre | string | Display name |
| pin_hash | string | Reserved local field from early design; not used by production auth |
| created_at | datetime | ISO 8601 |

### 2. Registro (Animals)
| Column | Type | Description |
|--------|------|-------------|
| animal_id | string | Auto: ANI-001 |
| arete_id | string | Ear tag number (manual) |
| nombre | string | Animal name |
| tipo | enum | Semental, Becerro(a), Vaquilla, Vaca, Torete |
| sexo | enum | Macho, Hembra |
| fecha_nacimiento | date | Birth date |
| raza | string | Free text breed |
| madre_id | string | FK → animal_id |
| padre_id | string | FK → animal_id |
| temperamento | enum | Normal, Manso(a), Bravo(a) |
| estado | enum | Vivo(a), Muerto(a), Vendido(a) |
| peso_actual | number | Latest weight (kg) |
| notas | string | Free text |
| foto_url | string | Phase 2 |
| created_by | string | FK → user_id |
| updated_at | datetime | Last modification |
| created_at | datetime | Creation date |

> **Note**: "Último Parto", "N. Crías", "Peso destete última cría",
> "Enfermedades", "Tratamientos" are computed from Reproduccion and Salud
> sheets. The backend calculates these summaries when writing to Google Sheets.

### 3. Salud (Health Records)
| Column | Type | Description |
|--------|------|-------------|
| salud_id | string | Auto: SAL-001 |
| animal_id | string | FK → animal_id |
| fecha | date | Event date |
| tipo_evento | enum | Vacuna, Desparasitación, Vitamina, Enfermedad, Tratamiento, Revisión |
| producto | string | Product/vaccine/medicine name |
| dosis | string | Dosage applied |
| estado_general | enum | Fuerte, Flaco, Enfermo |
| proxima_aplicacion | date | Next scheduled date (alerts) |
| notas | string | Free text |
| created_by | string | FK → user_id |
| updated_at | datetime | Last modification |
| created_at | datetime | Creation date |

### 4. Reproduccion (Breeding)
| Column | Type | Description |
|--------|------|-------------|
| reproduccion_id | string | Auto: REP-001 |
| vaca_id | string | FK → animal_id (cow) |
| semental_id | string | FK → animal_id (bull) |
| fecha_monta | date | Observed breeding date |
| fecha_posible_parto | date | Auto: fecha_monta + 283 days |
| prenez_confirmada | enum | Sí, No, Pendiente |
| fecha_parto_real | date | Actual birth date |
| cria_id | string | FK → animal_id (calf born) |
| peso_destete_cria | number | Weaning weight of calf (kg) |
| notas | string | Free text |
| created_by | string | FK → user_id |
| updated_at | datetime | Last modification |
| created_at | datetime | Creation date |

### 5. Observaciones (Field Observations)
| Column | Type | Description |
|--------|------|-------------|
| observacion_id | string | Auto: OBS-001 |
| fecha | date | Observation date |
| animal_id | string | FK → animal_id |
| notas | string | Free text notes |
| created_by | string | FK → user_id |
| updated_at | datetime | Last modification |
| created_at | datetime | Creation date |

### 6. Ventas (Sales)
| Column | Type | Description |
|--------|------|-------------|
| venta_id | string | Auto: VTA-001 |
| animal_id | string | FK → animal_id |
| fecha_venta | date | Sale date |
| motivo_venta | enum | Por peso (destete), Por edad, Por productividad, Otro |
| peso | number | Weight at sale (kg) |
| precio_total | number | Total price ($) |
| precio_kg | number | Computed or manual ($/kg) |
| comprador | string | Buyer name |
| notas | string | Free text |
| created_by | string | FK → user_id |
| updated_at | datetime | Last modification |
| created_at | datetime | Creation date |

### 7. Recorridos (Patrol Rounds)
| Column | Type | Description |
|--------|------|-------------|
| recorrido_id | string | Shared visit/session identifier |
| fecha | date | Patrol date |
| animal_id | string | FK → animal_id |
| notas | string | Quick field note |
| created_by | string | FK → user_id |
| updated_at | datetime | Last modification |
| created_at | datetime | Creation date |

### Local-only Photo Table
| Column | Type | Description |
|--------|------|-------------|
| photo_id | string | Local photo identifier |
| animal_id | string | FK → animal_id |
| data_url | string | Temporary local image payload |
| drive_url | string | Permanent Google Drive URL |
| synced | 0\|1 | Local sync flag |
| deleted | 0\|1 | Local soft-delete flag |
| created_at | datetime | Creation date |

## Sync Strategy

### Approach: Push-then-pull, content-aware last-write-wins
- Each record has `updated_at` timestamp
- IndexedDB uses numeric local flags: `synced` and `deleted`
- Soft deletes are sent as `_deleted=true` during sync
- The client checks `/api/sync/state` before doing a full pull when there are no local changes
- Small dataset (<200 animals) still allows pragmatic full-table merges

### Sync Flow
1. User logs in with a shared token; all API requests then carry `Authorization: Bearer <token>`.
2. When visible and online, the app checks `/api/sync/state` unless there are local pending changes.
3. The client pushes all unsynced records table by table.
4. The backend merges against Google Sheets using `updated_at` and handles soft deletes.
5. If the client pushed changes, it performs a fresh full pull to avoid stale snapshots.
6. Synced local records may be overwritten by remote changes; unsynced local rows are protected.
7. Photos are uploaded separately to Google Drive and the returned `drive_url` is written back into the animal record.

### Conflict Handling
- For 2-3 family users, last-write-wins is acceptable
- `created_by` field tracks who made each change
- Content comparison helps detect external Google Sheets edits even when local timestamps are unchanged

### Failure Tolerance
- If Google Sheets credentials are unavailable, sync endpoints return safe fallback payloads instead of discarding local data.
- Sync state is kept in memory on the backend, so a server restart forces the next client check to behave like a fresh sync.

## UI Design Principles

- **Large touch targets**: 56px+ buttons
- **Bottom tab navigation**: 4 tabs max
- **High contrast**: Dark text on light backgrounds
- **Minimal typing**: Dropdowns, date pickers, number pads
- **Spanish only**: All labels, buttons, messages in Spanish
- **Card-based**: Animals displayed as visual cards
- **Search**: By name or ear tag number

### Navigation (Bottom Tabs)
1. 🏠 **Inicio** - Dashboard + quick actions
2. 🐄 **Ganado** - Animal list, search, add, detail
3. 📋 **Actividad** - Health, reproduction, observations, recorridos, reproductive radar
4. 💰 **Ventas** - Sales records and financial summary

Header: Sync button + Settings gear

## Analytics Features (Reports)

### Reproductive Cycles
- Calendar view of expected births
- Fertility rate per cow
- Breeding season timeline
- Days open (days between calving and next conception)
- Reproductive intelligence panel with herd semaphores and culling heuristics

### Financial Summary
- Sales by period (monthly/yearly)
- Average price per kg
- Revenue trends
- Sales by motive breakdown

### Herd Health
- Vaccination schedule / calendar
- Upcoming deworming alerts
- Health event timeline per animal
- Herd health status overview (Fuerte/Flaco/Enfermo distribution)

### Field Operations
- Recorrido sessions grouped by date/session id
- Observed vs missing animal detection
- Last seen dates for active animals

### Genealogical Tree
- Visual family tree per animal
- Inbreeding warnings
- Best producer tracking (most calves, best weaning weights)

## Development Phases

### Phase 1: Foundation ✅
- [x] Architecture plan
- [x] Conda environment (`environment.yml` — Python 3.11 + Node 22)
- [x] XLSX data template (`backend/data/livestock_template.xlsx`)
- [x] Frontend skeleton (SvelteKit + Tailwind + PWA)
- [x] IndexedDB schema (Dexie.js — domain tables, recorridos, photos, sync indexes)
- [x] Backend skeleton (FastAPI + Google Sheets service)

### Phase 2: Core CRUD ✅
- [x] Animal registration form + list view
- [x] Animal detail view
- [x] Offline data persistence (Dexie.js with numeric sync flags)
- [x] Bearer token authentication
- [x] Bottom tab navigation (4 tabs + header)

### Phase 3: Extended Records ✅
- [x] Health records CRUD
- [x] Reproduction tracking CRUD
- [x] Observations CRUD
- [x] Sales CRUD
- [x] Auto-computation (fecha_posible_parto +283 days, precio_kg)

### Phase 4: Sync & Cloud ✅
- [x] Google Sheets integration (`backend/app/services/sheets.py`)
- [x] Bidirectional sync engine (push-then-pull, last-write-wins merge)
- [x] Sync UI (SyncButton, online/offline status, pending count)
- [x] Google Drive photo upload flow
- [x] Lightweight sync state endpoint for remote change detection

### Phase 5: Analytics and Operations ← CURRENT
- [x] Dashboard with key metrics (live count, health, repro, sales)
- [x] Reproductive calendar / intelligence view
- [x] Recorrido history and missing-animal alerts
- [x] Financial summary
- [ ] Health alerts dashboard
- [ ] Genealogical tree view

### Phase 6: Polish
- [ ] Photo support
- [ ] iOS PWA install guide
- [ ] Performance optimization
- [ ] User testing with rancher
