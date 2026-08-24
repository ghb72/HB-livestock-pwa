# HB Livestock PWA v2.1.0

Offline-first Progressive Web App for livestock management.

Current release: 2.1.0.

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

Use mode-specific files instead of a single shared backend environment:

- backend/.env.development for local work
- backend/.env.production for production-like runs when needed

You can start from backend/.env.development.example and backend/.env.production.example.

Set at least:

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- AUTH_TOKEN

Optional:

- SUPABASE_DB_SCHEMA if you do not use public
- SUPABASE_STORAGE_BUCKET if the bucket name differs from livestock
- SUPABASE_STORAGE_PREFIX if you want images under another folder prefix
- CORS_ORIGINS as a comma-separated list of allowed origins
- CORS_ALLOW_ORIGIN_REGEX if you need a regex for dynamic dev origins

The backend now reads backend/.env.<APP_ENV> first and falls back to backend/.env only for compatibility. If APP_ENV is not set, it defaults to development.

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

### 2b) Local Supabase stack with Docker

For testing changes on the preview branch without touching the real project,
`docker-compose.yml` runs a local Supabase in four containers. Nothing is
installed on the host beyond Docker itself.

```bash
docker compose up -d
docker compose logs -f bootstrap   # waits for "Local Supabase stack is ready"
```

**Rootless Docker users:** published ports are silently dropped when RootlessKit
runs with `--net=pasta --port-driver=implicit`, which is what `dockerd-rootless.sh`
picks when `slirp4netns` is not installed. `docker ps` still reports
`0.0.0.0:54321->8000/tcp`, but no listener exists and every request times out.
Install `slirp4netns` and pin the working combination:

```bash
sudo dnf install -y slirp4netns   # or apt install slirp4netns
mkdir -p ~/.config/systemd/user/docker.service.d
printf '[Service]\nEnvironment=DOCKERD_ROOTLESS_ROOTLESSKIT_NET=slirp4netns\nEnvironment=DOCKERD_ROOTLESS_ROOTLESSKIT_PORT_DRIVER=builtin\n' \
  > ~/.config/systemd/user/docker.service.d/port-driver.conf
systemctl --user daemon-reload && systemctl --user restart docker
```

Verify with `curl http://127.0.0.1:54321/healthz`, which must answer `ok`.

The services are the minimum the backend actually calls:

| Service | Image | Purpose |
| --- | --- | --- |
| `db` | `supabase/postgres` | Postgres plus the roles and `storage` schema PostgREST and storage-api expect |
| `rest` | `postgrest/postgrest` | Serves the business tables at `/rest/v1/<table>` |
| `storage` | `supabase/storage-api` | Backs the photo upload, public read and delete flow, storing objects in a volume |
| `gateway` | `nginx` | Puts `/rest/v1` and `/storage/v1` on one origin, as a hosted project does |

Auth, Realtime, Studio, imgproxy and the connection pooler are intentionally
left out — the app uses none of them.

A one-shot `bootstrap` container applies `backend/data/supabase_schema.sql`,
the same file used on the real project, and then asserts that the seven tables
and the public `livestock` bucket exist.

Endpoints once it is up:

- PostgREST and Storage: `http://127.0.0.1:54321`
- Postgres, for a SQL client: `postgres://postgres:postgres@127.0.0.1:54322/postgres`

`backend/.env.development.example` already points at this stack, so copying it
to `backend/.env.development` is all the backend needs. The login token is
`local-dev-token`.

The credentials are Supabase's published demo values and are safe only because
nothing here is reachable from outside the machine. Never reuse the service
role key for the real project.

To reset the database and the stored photos:

```bash
docker compose down -v && docker compose up -d
```

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

Vite already supports separate mode files:

- frontend/.env.development for local development
- frontend/.env.production for production builds

For local development, keep VITE_API_URL empty so the dev server proxies /api and /health to the backend on port 8000. This avoids browser CORS issues in the VS Code web viewer.

```bash
cd frontend
npm install
npm run dev
```

Useful frontend commands:

- npm run check: SvelteKit sync + type checking
- npm run build: production build
- npm run preview: local preview of the production bundle

You can start from frontend/.env.development.example and frontend/.env.production.example.

## Runtime Notes

- The app starts at /login until a valid token is stored in localStorage.
- After login, the PWA runs fully client-side and stores operational data in IndexedDB.
- IndexedDB schema v3 adds `madre_id` and `padre_id` indexes to support genealogy and offspring queries without Dexie schema errors. Reload the app once after upgrading so the local database can migrate.
- Sync is visibility-aware: when the app is visible and authenticated, it polls remote state, skips unnecessary pulls, and protects unsynced local changes.
- Creating or updating an animal with an existing mother can now generate or synchronize an inferred birth record automatically so reproduction views stay aligned with genealogy data.
- Genealogy views are computed locally from IndexedDB animal, reproduction, and photo data; the graphical explorer supports focus changes, generation depth control, and pan/zoom without extra backend calls.
- Date-heavy forms now use a shared `DD/MM/YYYY` input with native date-picker fallback to keep stored values consistent across pages.
- Photos can be opened in a shared zoom/lightbox flow from herd, activity, sales, recorrido, and animal detail screens.
- Photos are first stored locally, then uploaded to Supabase Storage during sync.
- The photo upload and deletion flow now runs entirely through `backend/app/services/supabase.py`, even if older compatibility imports still exist in the backend.
- The backend talks to Supabase over HTTP using the service role key, so no Supabase Python SDK is required.
- The reproductive calendar now includes vacant-cow, near-weaning, and ideal-heat-window indicators, plus calf detail links and thumbnails inside reproductive history tables.

## Production Deployment

- Frontend (Vercel): set Root Directory to frontend so Vercel uses frontend/vercel.json and builds from frontend/
- Backend (Render): uses root render.yaml with rootDir: backend
- Backend deps: backend/requirements-render.txt

### Deploy both from the same GitHub repository

1. Connect this repository in Render and create a Blueprint service from render.yaml.
2. In Render service settings, add SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and AUTH_TOKEN.
3. Optionally override SUPABASE_DB_SCHEMA, SUPABASE_STORAGE_BUCKET, and SUPABASE_STORAGE_PREFIX.
4. Connect the same repository in Vercel and set Root Directory to frontend.
5. In Vercel project environment variables, set VITE_API_URL=https://<your-render-service>.onrender.com.
6. Redeploy both services after env vars are configured.

### Keep-alive cron (required on free tiers)

Supabase pauses a free-tier project after about a week without API traffic, and
the app is used seasonally, so long gaps between real usage are normal. Nothing
inside the PWA prevents this: `/health`, `/`, and `/api/sync/state` all answer
from memory, so even a device left polling for days never touches the database.

`GET /health/db` exists for this. It runs a real single-row PostgREST query and
returns 503 if Supabase is unreachable. Point an external scheduler at it —
cron-job.org is free and emails you when a run fails:

1. Create a job with URL `https://<your-render-service>.onrender.com/health/db`,
   method GET.
2. Add the header `Authorization: Bearer <AUTH_TOKEN>` — the same token the
   frontend uses. The endpoint is authenticated so it cannot be used by third
   parties to generate Supabase traffic.
3. Schedule it **daily**. The pause threshold is ~7 days, so a daily run leaves
   a wide margin and costs nothing.
4. Enable failure notifications. A silent cron is worthless here — the whole
   point is finding out before the project pauses.

One caveat from combining free tiers: Render spins the service down after 15
minutes idle and a cold start takes roughly 50 seconds, which exceeds
cron-job.org's 30-second request timeout. The request still wakes Render, but
the run is reported as failed. Schedule **two runs about ten minutes apart**
(for example 03:00 and 03:10): the first wakes the service, the second finds it
warm and confirms Supabase is reachable.

## Current Feature Set

- Animal registry with create, edit, detail view, zoomable photos, genealogy links, graphical family tree, offspring summaries, reproductive history, and soft-delete.
- Health workflows in both batch and single-animal modes, with shared batching logic for dashboard and activity timelines.
- Reproduction workflows for breeding, births, calf creation, record detail/edit pages, and reproductive intelligence.
- Observations, sales, and recorrido sessions with animal photos, relative date labels, and missing-animal detection.
- Shared date-entry, photo lightbox, and zoom interactions across the main operational screens.
- Offline-first sync for animals, health, reproduction, observations, sales, recorridos, and photos through Supabase.
- PWA manifest and service-worker caching through @vite-pwa/sveltekit.
