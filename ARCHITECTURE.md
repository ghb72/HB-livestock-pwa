# Livestock Register - Architecture & Development Plan

## Overview
PWA for livestock management (cattle ranching) with offline-first capability,
designed for users with minimal technology experience.

## Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Frontend | Vite + React 18 + TypeScript | Lightweight SPA, ideal for offline PWA |
| Styling | Tailwind CSS 3 | Rapid UI, responsive, utility-first |
| Local DB | Dexie.js (IndexedDB) | Reliable offline storage with sync support |
| PWA | vite-plugin-pwa (Workbox) | Service worker, caching, install prompt |
| Backend | FastAPI (Python 3.11+) | Lightweight API, easy deploy on Render |
| Cloud DB | Google Sheets API (gspread) | XLSX-compatible, familiar to owner |
| Env Mgr | Conda (miniconda3) | Single env for Python + Node.js |
| Deploy FE | Vercel | Free tier, git-based deploys |
| Deploy BE | Render | Free tier, Python support |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                    MOBILE DEVICE                     │
│  ┌───────────────────────────────────────────────┐  │
│  │              React PWA (Vite)                  │  │
│  │  ┌─────────┐  ┌──────────┐  ┌─────────────┐  │  │
│  │  │   UI    │  │  Sync    │  │  Service     │  │  │
│  │  │ Spanish │  │  Engine  │  │  Worker      │  │  │
│  │  └────┬────┘  └────┬─────┘  └──────┬──────┘  │  │
│  │       │             │               │         │  │
│  │  ┌────▼─────────────▼───────────────▼──────┐  │  │
│  │  │          IndexedDB (Dexie.js)           │  │  │
│  │  │  animals | health | reproduction |      │  │  │
│  │  │  sales | observations | users           │  │  │
│  │  └────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS (when online)
                       ▼
┌──────────────────────────────────────────────────────┐
│                 FastAPI Backend                       │
│  ┌──────────┐  ┌───────────┐  ┌───────────────────┐ │
│  │  Auth    │  │  Sync     │  │  Google Sheets    │ │
│  │  (PIN)   │  │  Engine   │  │  Service          │ │
│  └──────────┘  └───────────┘  └─────────┬─────────┘ │
└──────────────────────────────────────────┬───────────┘
                                           │
                                           ▼
                                 ┌──────────────────┐
                                 │  Google Sheets   │
                                 │  (Cloud DB)      │
                                 │  6 hojas:        │
                                 │  - Registro      │
                                 │  - Salud         │
                                 │  - Reproduccion  │
                                 │  - Observaciones │
                                 │  - Ventas        │
                                 │  - Usuarios      │
                                 └──────────────────┘
```

## Data Model (6 Sheets)

### 1. Usuarios
| Column | Type | Description |
|--------|------|-------------|
| user_id | string | Auto: USR-001 |
| nombre | string | Display name |
| pin_hash | string | Hashed 4-6 digit PIN |
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
| animal_id | string | FK → animal_id (1 row per animal) |
| notas | string | Free text notes |
| created_by | string | FK → user_id |
| updated_at | datetime | Last modification |
| created_at | datetime | Creation date |

> Multiple animals in one observation share the same `observacion_id` + `fecha`.

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

## Sync Strategy

### Approach: Timestamp-based Last-Write-Wins
- Each record has `updated_at` timestamp
- Local records have `_sync_status`: synced | pending | conflict (IndexedDB only)
- Small dataset (<200 animals) allows full-sync approach

### Sync Flow
1. User taps "Sincronizar" button (or auto-detect online)
2. Client sends all records where `_sync_status = pending`
3. Server reads Google Sheet, compares by ID + updated_at
4. **Last-write-wins**: most recent `updated_at` takes precedence
5. Server updates Google Sheet with merged data
6. Server returns full dataset
7. Client replaces local DB, marks all as `synced`

### Conflict Handling
- For 2-3 family users, last-write-wins is acceptable
- `created_by` field tracks who made each change
- Sync log shows what changed during each sync

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
3. 📋 **Actividad** - Health, reproduction, observations log
4. 💰 **Ventas** - Sales records and financial summary

Header: Sync button + Settings gear

## Analytics Features (Reports)

### Reproductive Cycles
- Calendar view of expected births
- Fertility rate per cow
- Breeding season timeline
- Days open (days between calving and next conception)

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

### Genealogical Tree
- Visual family tree per animal
- Inbreeding warnings
- Best producer tracking (most calves, best weaning weights)

## Development Phases

### Phase 1: Foundation ✅
- [x] Architecture plan
- [x] Conda environment (`environment.yml` — Python 3.11 + Node 22)
- [x] XLSX data template (`backend/data/livestock_template.xlsx`)
- [x] Frontend skeleton (Vite + React + Tailwind + PWA)
- [x] IndexedDB schema (Dexie.js — 6 tables with sync indexes)
- [x] Backend skeleton (FastAPI + Google Sheets service)

### Phase 2: Core CRUD ✅
- [x] Animal registration form + list view
- [x] Animal detail view
- [x] Offline data persistence (Dexie.js with _sync_status)
- [ ] PIN authentication
- [x] Bottom tab navigation (4 tabs + header)

### Phase 3: Extended Records ✅
- [x] Health records CRUD
- [x] Reproduction tracking CRUD
- [x] Observations CRUD
- [x] Sales CRUD
- [x] Auto-computation (fecha_posible_parto +283 days, precio_kg)

### Phase 4: Sync & Cloud ✅
- [x] Google Sheets integration (`backend/app/services/sheets.py`)
- [x] Bidirectional sync engine (last-write-wins merge)
- [x] Sync UI (SyncButton, online/offline status, pending count)
- [ ] Summary columns computation for Google Sheets

### Phase 5: Analytics ← CURRENT
- [x] Dashboard with key metrics (live count, health, repro, sales)
- [ ] Reproductive calendar
- [ ] Financial reports
- [ ] Health alerts
- [ ] Genealogical tree view

### Phase 6: Polish
- [ ] Photo support
- [ ] iOS PWA install guide
- [ ] Performance optimization
- [ ] User testing with rancher
