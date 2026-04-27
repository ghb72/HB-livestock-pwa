# Changelog

All notable changes to this project are documented in this file.

## [1.1.1] - 2026-04-26

### Changed

- Migrated the FastAPI backend storage layer from Google Sheets and Google Drive to Supabase tables and Supabase Storage.
- Replaced backend deployment and local environment configuration with Supabase URL, service-role key, schema, bucket, and storage-prefix settings.
- Updated the backend service layer to use direct HTTP calls through httpx instead of Google-specific Python clients.

### Fixed

- Corrected photo deletion to remove objects from Supabase Storage using the photo identifier plus stored public URL.
- Removed stale Google-specific dependencies and documentation that no longer matched the active backend implementation.

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
- Photo upload flow from IndexedDB to cloud storage during sync.

### Fixed

- Svelte 5 template constant usage in the reproductive calendar page so the production build completes successfully.

## [1.0.0] - 2026-03-02

### Added

- Initial full-stack implementation of HB Livestock PWA.
- Offline-first data layer with IndexedDB (Dexie) and sync metadata.
- FastAPI backend for bidirectional sync with the cloud persistence layer.
- Core modules for animals, health, reproduction, observations, and sales.
- Recorrido workflow (field patrol rounds) with missing-animal alerts.
- Photo capture, compression, local storage, and cloud upload support.
- Production deployment configuration for Render (pip-based) and Vercel-ready frontend.
