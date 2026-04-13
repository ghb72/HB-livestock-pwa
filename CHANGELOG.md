# Changelog

All notable changes to this project are documented in this file.

## [1.1.0] - 2026-04-10

### Changed

- Migrated the production frontend from React to SvelteKit with Svelte 5 and file-based routes.
- Reworked the sync engine to use visibility-aware polling, sync-state checks, and push-then-pull reconciliation.
- Switched API access from planned PIN auth to shared Bearer token authentication.

### Added

- Login flow backed by `POST /api/auth/login` and protected backend routes.
- Sync state endpoint for lightweight remote change detection.
- Reproductive intelligence page with herd KPIs, expected-birth radar, and cow-level lifecycle metrics.
- Individual and batch health workflows, recorrido history views, and missing-animal detection.
- Photo upload flow from IndexedDB to Google Drive during sync.

### Fixed

- Svelte 5 template constant usage in the reproductive calendar page so the production build completes successfully.

## [1.0.0] - 2026-03-02

### Added

- Initial full-stack implementation of HB Livestock PWA.
- Offline-first data layer with IndexedDB (Dexie) and sync metadata.
- FastAPI backend for bidirectional sync with Google Sheets.
- Core modules for animals, health, reproduction, observations, and sales.
- Recorrido workflow (field patrol rounds) with missing-animal alerts.
- Photo capture, compression, local storage, and Drive upload support.
- Production deployment configuration for Render (pip-based) and Vercel-ready frontend.
