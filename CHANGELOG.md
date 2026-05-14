# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [2.1.0] - 2026-05-13

### Added

- Added automatic inferred birth-record creation when a new animal is registered with an existing mother, including edit-mode synchronization for later maternal assignment changes.
- Added richer reproductive-intelligence overlays, including vacant-cow lists, ideal-heat-window lists, near-weaning indicators, and contextual reference guidance for traditional weaning targets.
- Added direct reproductive-event shortcuts from cow cards and linked calf rows in reproductive history with calf name, tag, and thumbnail previews.

### Changed

- Updated the reproductive activity feed and calendar views to treat inferred births as first-class birth events with birth-date-based labeling and ordering.
- Expanded reproductive history presentation so calf references resolve to local animal records instead of raw identifiers when available.

## [2.0.0] - 2026-05-13

### Added

- Added a graphical genealogy explorer for the herd module with focus controls, generation-depth filters, and pan/zoom navigation powered by local IndexedDB data.
- Added a reusable reproduction form plus detail/edit screens for mating and birth records, including optional calf creation during birth registration.
- Added shared date-entry and photo lightbox components so users can review photos and enter normalized dates consistently across the app.

### Changed

- Consolidated photo upload and deletion behavior into the Supabase service layer so the photo sync endpoints no longer depend on legacy Google Drive credentials.
- Refactored health record batching into a shared frontend utility used by dashboard and activity views.
- Expanded photo-backed UI coverage across herd detail, activity, sales, recorrido, and genealogy-related screens.
- Improved backend environment loading and CORS configuration to prefer mode-specific env files and support wildcard or regex-based origin settings.

### Fixed

- Added `madre_id` and `padre_id` indexes to the Dexie `animals` store to prevent genealogy and offspring lookups from failing with `SchemaError` during sync-adjacent page loads.
- Removed the remaining `credentials.json` dependency from the active photo sync path used by `POST /api/photos/upload/batch`.

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
