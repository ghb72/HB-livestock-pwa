# Livestock Register - Architecture

## Overview

Offline-first PWA for cattle management, optimized for intermittent connectivity
and simple field workflows.

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Frontend | SvelteKit 2 + Svelte 5 + TypeScript | Client-rendered PWA UI |
| Styling | Tailwind CSS 4 | Responsive UI styling |
| Local DB | Dexie.js over IndexedDB | Offline-first source of truth on the device |
| PWA | @vite-pwa/sveltekit + Workbox | Service worker, caching, installability |
| Backend | FastAPI on Python 3.11 | Auth, sync orchestration, photo upload |
| Cloud DB | Supabase PostgREST | Remote relational tables accessed over HTTP |
| Cloud Files | Supabase Storage | Remote image storage |
| Auth | Shared Bearer token | Controlled access for a small trusted team |
| Environment | Conda environment livestock | Local Python runtime for backend work |
| Deploy FE | Vercel | Frontend hosting |
| Deploy BE | Render | Backend hosting |

## Runtime Architecture

```text
Mobile device
  SvelteKit PWA
    UI + sync engine + service worker
    IndexedDB tables
      animals, health, reproduction, observations, sales, recorridos, photos, users

        |
        | HTTPS when online
        v

FastAPI backend
  auth router
  sync router
  photo router
  Supabase HTTP service layer

        |
        +--> Supabase tables
        |
        +--> Supabase Storage
```

## Data Surfaces

### Local device data

IndexedDB stores the working set used by the PWA, including sync metadata.
Each business record keeps local fields such as synced and deleted until it is
reconciled with the backend.

The local photo table contains:

- photo_id
- animal_id
- data_url for pending local payloads
- drive_url as the persisted public URL field already used by the frontend
- synced
- deleted
- created_at

The field name drive_url is legacy naming. It now stores the public URL returned
by Supabase Storage.

### Remote Supabase tables

The backend reads and writes these tables directly through PostgREST:

- animals with primary key animal_id
- health with primary key salud_id
- reproduction with primary key reproduccion_id
- observations with primary key observacion_id
- sales with primary key venta_id
- recorridos with primary key entry_id
- users with primary key user_id

### Remote image storage

Photos are stored in the configured Supabase bucket under the configured prefix.
The backend builds a canonical object path from photo_id plus MIME type and
returns a public URL for later display in the app.

## Sync Strategy

### Approach

The application uses push-then-pull synchronization with last-write-wins based
on updated_at.

- The client pushes unsynced rows table by table.
- Soft deletes are sent with _deleted=true.
- The backend reads the current remote rows, merges by primary key, deletes
  rows marked for removal, and upserts the final set.
- After a successful push, the client performs a fresh pull when needed.
- Sync state is also exposed through /api/sync/state so the frontend can skip
  unnecessary full pulls.

### Conflict model

This project assumes a small number of trusted users. Under that constraint,
last-write-wins is acceptable and simpler than operational transforms or row
version graphs.

### Failure tolerance

If Supabase is unavailable or misconfigured, the backend returns safe fallback
payloads instead of dropping local data. A server restart also resets the
in-memory sync version, forcing the next client check to behave like a fresh
sync.

## Backend Responsibilities

- Validate the shared Bearer token.
- Expose sync endpoints for each business table.
- Expose a deep health check (`GET /health/db`) that reaches Supabase.
- Merge local and remote records by updated_at.
- Upload and delete animal photos in Supabase Storage.
- Translate storage object paths into public URLs consumed by the frontend.

## Deployment Notes

### Local development

Backend work should be run from the existing conda environment livestock.

Typical backend variables:

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_DB_SCHEMA
- SUPABASE_STORAGE_BUCKET
- SUPABASE_STORAGE_PREFIX
- AUTH_TOKEN
- CORS_ORIGINS

### Render

Render deploys the FastAPI service from backend/ using requirements-render.txt.
The deployment must provide the same Supabase variables used locally.

### Free-tier inactivity

Supabase pauses free projects after roughly a week without API traffic, and this
app runs seasonally. No client-side mechanism can cover the gap: the PWA may go
weeks without being opened, and none of the frequently hit endpoints reads from
the database. Liveness therefore depends on an external scheduler calling
`GET /health/db` daily, which is the only endpoint that issues a real PostgREST
query. Setup instructions live in README.md.
