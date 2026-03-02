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

- **Frontend**: deploy `frontend/` to Vercel
- **Backend**: deploy to Render Web Service using `pip` and `render.yaml`
- **Render deps**: `backend/requirements-render.txt`

## License

This project is licensed under the MIT License. See `LICENSE`.
