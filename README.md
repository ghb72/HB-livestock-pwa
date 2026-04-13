# HB Livestock PWA

Offline-first Progressive Web App for livestock management.

## Overview

HB Livestock PWA helps ranch operations manage animals, health events,
reproduction, observations, sales, photos, and field patrol rounds
(recorridos).

- **Frontend**: SvelteKit 2 + Svelte 5 + TypeScript + Vite PWA
- **Local storage**: IndexedDB (Dexie)
- **Backend**: FastAPI (Python)
- **Cloud data**: Google Sheets + Google Drive (photos)
- **Auth**: shared Bearer token validated by the backend

## Project Structure

- `frontend/`: PWA client application
- `frontend-react/`: archived React implementation kept as migration reference
- `backend/`: FastAPI API and sync services
- `backend/data/`: template and support data files
- `backend/scripts/`: helper scripts

## Local Development

### Prerequisites

- Conda (recommended for local setup)
- Node.js 22+
- Python 3.11

### 1) Create and activate environment

```bash
conda env create -f environment.yml
conda activate livestock
```

### 2) Configure backend environment

Create `backend/.env` from `backend/.env.example` and set:

- `GOOGLE_SHEETS_CREDENTIALS_FILE`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `AUTH_TOKEN`

Optional:

- `CORS_ORIGINS` as a comma-separated list for extra frontend origins

### 3) Run backend

```bash
uvicorn backend.app.main:app --reload --port 8000
```

Available backend endpoints:

- `POST /api/auth/login`: validates the shared access token
- `GET /api/sync/state`: lightweight remote sync state check
- `POST /api/sync/{table}`: push local changes and receive merged data
- `GET /api/sync/pull`: full cloud pull
- `POST /api/photos/upload/batch`: upload pending photos to Drive

### 4) Run frontend

```bash
cd frontend
npm install
npm run dev
```

Useful frontend commands:

- `npm run check`: SvelteKit sync + type checking
- `npm run build`: production build
- `npm run preview`: local preview of the production bundle

## Runtime Notes

- The app starts at `/login` until a valid token is stored in `localStorage`.
- After login, the PWA runs fully client-side and stores operational data in IndexedDB.
- Sync is visibility-aware: when the app is visible and authenticated, it polls remote state,
  skips unnecessary pulls, and protects unsynced local changes.
- Photos are first stored locally, then uploaded to Google Drive during sync.

## Production Deployment

- **Frontend (Vercel)**: uses root `vercel.json` (builds `frontend/`)
- **Backend (Render)**: uses root `render.yaml` with `rootDir: backend`
- **Backend deps**: `backend/requirements-render.txt`

### Deploy both from the same GitHub repository

1. Connect this repository in **Render** and create a Blueprint service
	from `render.yaml`.
2. In Render service settings, add:
	- `GOOGLE_SHEETS_SPREADSHEET_ID`
	- Secret file mounted at `/etc/secrets/credentials.json`
	- `AUTH_TOKEN`
3. Connect the same repository in **Vercel**.
	The root `vercel.json` delegates to the SvelteKit project in `frontend/`.
4. In Vercel project environment variables, set:
	- `VITE_API_URL=https://<your-render-service>.onrender.com`
5. Redeploy both services after env vars are configured.

## Current Feature Set

- Animal registry with create, edit, detail view, genealogy links, and soft-delete.
- Health workflows in both batch and single-animal modes.
- Reproduction workflows for breeding, births, calf creation, and reproductive intelligence.
- Observations, sales, and recorrido sessions with missing-animal detection.
- Offline-first sync for animals, health, reproduction, observations, sales, recorridos, and photos.
- PWA manifest and service-worker caching through `@vite-pwa/sveltekit`.

## License

This project is licensed under the MIT License. See `LICENSE`.
