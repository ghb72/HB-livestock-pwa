# HB Livestock PWA

Offline-first Progressive Web App for livestock management.

## Overview

HB Livestock PWA helps ranch operations manage animals, health events,
reproduction, observations, sales, photos, and field patrol rounds
(recorridos).

- Frontend: SvelteKit 2 + Svelte 5 + TypeScript + Vite PWA
- Local storage: IndexedDB (Dexie)
- Backend: FastAPI (Python)
- Cloud data: Supabase tables + Supabase Storage
- Auth: shared Bearer token validated by the backend

See AUTHENTICATION_GUIDE.md for the formal reusable authentication guide and implementation pattern.

## Project Structure

- frontend/: PWA client application
- frontend-react/: archived React implementation kept as migration reference
- backend/: FastAPI API and sync services
- backend/data/: template and support data files
- backend/scripts/: helper scripts

## Local Development

### Prerequisites

- Conda
- Node.js 22+
- The existing conda environment named livestock

### 1) Activate the environment

```bash
conda activate livestock
```

If you still need to create it on a fresh machine:

```bash
conda env create -f environment.yml
conda activate livestock
```

### 2) Configure backend environment

Create backend/.env from backend/.env.example and set:

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- AUTH_TOKEN

Optional:

- SUPABASE_DB_SCHEMA if you do not use public
- SUPABASE_STORAGE_BUCKET if the bucket name differs from livestock
- SUPABASE_STORAGE_PREFIX if you want images under another folder prefix
- CORS_ORIGINS as a comma-separated list for extra frontend origins

Legacy Google Drive and Google Sheets credentials are no longer used for photo sync. A `credentials.json` file is not required.

The backend expects these synced tables in Supabase:

- animals
- health
- reproduction
- observations
- sales
- recorridos
- users

The storage bucket is expected to be publicly readable because the backend returns public object URLs for animal photos.

The repository includes a ready-to-run Supabase bootstrap script at backend/data/supabase_schema.sql.

### 3) Run backend

```bash
uvicorn backend.app.main:app --reload --port 8000
```

Available backend endpoints:

- POST /api/auth/login: validates the shared access token
- GET /api/sync/state: lightweight remote sync state check
- POST /api/sync/{table}: push local changes and receive merged data
- GET /api/sync/pull: full cloud pull
- POST /api/photos/upload/batch: upload pending photos to Supabase Storage

### 4) Run frontend

```bash
cd frontend
npm install
npm run dev
```

Useful frontend commands:

- npm run check: SvelteKit sync + type checking
- npm run build: production build
- npm run preview: local preview of the production bundle

## Runtime Notes

- The app starts at /login until a valid token is stored in localStorage.
- After login, the PWA runs fully client-side and stores operational data in IndexedDB.
- IndexedDB schema v3 adds `madre_id` and `padre_id` indexes to support genealogy and offspring queries without Dexie schema errors. Reload the app once after upgrading so the local database can migrate.
- Sync is visibility-aware: when the app is visible and authenticated, it polls remote state, skips unnecessary pulls, and protects unsynced local changes.
- Photos are first stored locally, then uploaded to Supabase Storage during sync.
- The photo upload and deletion flow now runs entirely through `backend/app/services/supabase.py`, even if older compatibility imports still exist in the backend.
- The backend talks to Supabase over HTTP using the service role key, so no Supabase Python SDK is required.

## Production Deployment

- Frontend (Vercel): uses root vercel.json and the frontend project
- Backend (Render): uses root render.yaml with rootDir: backend
- Backend deps: backend/requirements-render.txt

### Deploy both from the same GitHub repository

1. Connect this repository in Render and create a Blueprint service from render.yaml.
2. In Render service settings, add SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and AUTH_TOKEN.
3. Optionally override SUPABASE_DB_SCHEMA, SUPABASE_STORAGE_BUCKET, and SUPABASE_STORAGE_PREFIX.
4. Connect the same repository in Vercel.
5. In Vercel project environment variables, set VITE_API_URL=https://<your-render-service>.onrender.com.
6. Redeploy both services after env vars are configured.

## Current Feature Set

- Animal registry with create, edit, detail view, genealogy links, and soft-delete.
- Health workflows in both batch and single-animal modes.
- Reproduction workflows for breeding, births, calf creation, and reproductive intelligence.
- Observations, sales, and recorrido sessions with missing-animal detection.
- Offline-first sync for animals, health, reproduction, observations, sales, recorridos, and photos through Supabase.
- PWA manifest and service-worker caching through @vite-pwa/sveltekit.
