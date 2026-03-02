# HB Livestock PWA

Offline-first Progressive Web App for livestock management.

## Overview

HB Livestock PWA helps ranch operations manage animals, health events,
reproduction, observations, sales, and patrol rounds (recorridos).

- **Frontend**: React + TypeScript + Vite PWA
- **Local storage**: IndexedDB (Dexie)
- **Backend**: FastAPI (Python)
- **Cloud data**: Google Sheets + Google Drive (photos)

## Project Structure

- `frontend/`: PWA client application
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

### 3) Run backend

```bash
uvicorn backend.app.main:app --reload --port 8000
```

### 4) Run frontend

```bash
cd frontend
npm install
npm run dev
```

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
3. Connect the same repository in **Vercel**.
	`vercel.json` will build and publish `frontend/dist`.
4. In Vercel project environment variables, set:
	- `VITE_API_URL=https://<your-render-service>.onrender.com`
5. Redeploy both services after env vars are configured.

## License

This project is licensed under the MIT License. See `LICENSE`.
