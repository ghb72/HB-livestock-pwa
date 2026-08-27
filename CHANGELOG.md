# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Changed

- Renamed the photo record's `drive_url` field to `photo_url` across the frontend, the API contract, and the docs — the old name was Google Drive-era residue and the field has held a Supabase Storage URL since the migration. An IndexedDB migration (Dexie v4) renames the field on existing devices, and the upload response carries a deprecated `drive_url` alias for one release so a client still running cached frontend code keeps working.
- Reduced the automatic sync poll interval from 5 minutes to 60 seconds while the tab is visible, and made the engine sync immediately on window focus and when connectivity returns.
- Replaced the manual sync button with a passive status chip that reports connection, in-progress sync, and the live pending-record count; it remains tappable to force an immediate sync as an escape hatch.
- Corrected the "Pendientes de sincronizar" counter in settings, which previously ignored the `recorridos` and `photos` tables, by sharing the sync engine's `countPendingChanges()` helper.

### Added

- Mating observations contradicted by a real birth no longer distort the reproductive calendar. A cow that is seen being mounted while already pregnant used to leave a record whose inferred birth was ~283 days out, which then became her "last monta" and painted her as gestating through the whole postpartum. A record is now treated as contradicted when the cow has a birth — either another record's `fecha_parto_real` or a calf registered with her as `madre_id` — falling between the observed date and 30 days short of the inferred birth. If the pregnancy was never confirmed, the record is archived: excluded from the herd inference and badged in the reproductive history, but never deleted. If it was confirmed, the observed date is instead corrected to the real birth minus a full gestation, which makes the record describe the pregnancy that actually happened; the page reports every correction it applied and the original date is preserved as a note on the record. The rule lives entirely in `frontend/src/lib/reproduction.ts` and needs no schema, backend or sync change, so it also works offline the moment the birth is entered.

- A confirmed pregnancy is now withdrawn when the cow is bred again during the gestation it claimed. If they mounted her a month after confirming, the confirmation was wrong — the record reverts to «No» and gets a note saying why, urging clarification in case there was an abortion or a loss. It runs both retroactively when the reproductive calendar loads, listing every change on screen, and at the moment a new mating is saved, where the note arrives pre-filled and editable so the reason can be written down while it is still known.
- The mating and calving forms now flag what is physically impossible before it is saved, without ever blocking: mating a cow who is already carrying a confirmed pregnancy, mating one who calved less than 45 days ago (uterine involution has not finished, so no such mating can have taken her), and registering a calving less than 328 days — a waiting period plus a full gestation — after her previous one. Every one of these has a legitimate explanation in the field, so the warning explains the rule and leaves the save button active.
- Added an edit shortcut on every row of a cow's reproductive history, which was the missing way to confirm a pregnancy: the pencil opens the record in the form's edit mode instead of requiring a new record.

- Added a local Supabase test stack to `docker-compose.yml` so changes can be verified on the preview branch without touching the real project. It runs the minimum the backend actually calls — Postgres, PostgREST, storage-api and an nginx gateway that puts both APIs on one origin — because the backend speaks HTTP to `/rest/v1` and `/storage/v1`, never SQL, and a plain Postgres container cannot back it. A one-shot bootstrap container applies `backend/data/supabase_schema.sql` and verifies the tables and the public bucket.
- Added `GET /health/db`, an authenticated deep health check that issues a real Supabase query, so an external daily cron can keep the free-tier project from being paused for inactivity. Every other endpoint answers from memory and therefore never registers database activity.
- Added exponential backoff for consecutive sync failures, capped at one attempt every 16 minutes, so a persistent error no longer retries 60 times per hour at the new poll cadence. A user-forced sync bypasses the backoff.

### Fixed

- Animal dropdowns no longer show the internal database id. Sale, health, observation and mating/calving forms listed their animals as `ANI-3f9c1a20 - Lucero`, a code that means nothing in the field; every selector now reads `{nombre} {arete}`, sorted alphabetically, and carries the id invisibly as the option's value. The bulk health checklist likewise shows the ear tag under each name instead of the record id. Because the visible text was previously also the stored value, each form had to slice the id back out of it when saving — that parsing is gone, and with it the class of bug where a name containing a dash could corrupt the saved link.
- The mating form's "Semental" list now offers only live sementales and toretes plus «Toro externo», instead of every male in the herd including calves, dead and sold animals. All animal selectors are now limited to live animals; when an older record points at one that has since died or been sold, that animal stays visible in its own selector so editing the record cannot silently drop the link.
- The "Evento de salud" shortcut on an animal's card now opens the single-animal form with that animal already selected. It pointed at the bulk form, which ignores the parameter, so the shortcut landed on an unmarked checklist of the whole herd while the other three shortcuts on the same card arrived ready to fill in.
- The average calving interval no longer reports a bare dash in a young herd. It needs two calvings to measure an interval, so a herd where no cow has calved twice yet had nothing to show — and the card said only "sin datos", which reads the same as a broken calculation. It now states the denominator it is working from ("0 de 12 con 2+ partos"), and a cow on her first calf who is carrying again contributes a *projected* interval — her expected birth minus her last one — marked with a `~` so it is never confused with a measured one. Projected values are never averaged together with measured ones: the herd falls back to projections only while no real interval exists anywhere.
- The average calving interval is now taken over each cow's two most recent intervals rather than her whole life, so the KPI describes how the herd is cycling now instead of averaging in a calving from five years ago. The lifetime mean is still computed and appears in small type beside it whenever the two disagree, which is what reveals a long-term drift in management. Both remain means of per-cow means: the number of intervals a cow produces is roughly inversely proportional to their length, so pooling every interval in the herd would over-weight the fastest breeders and bias the figure downwards.
- Cows sold within a year of their last calving now contribute their intervals to the herd average. They were still in the reproductive cycle when they left, and in a herd whose older cows have been sold their history may be the only history there is. They feed the interval calculation only — never the herd counts, the status list or the alerts.
- Heifers too young to have calved no longer deflate the herd figures. The 12-month birth rate divided by every female including yearlings, and "Sin historial" counted a two-year-old who simply has not been bred yet alongside an adult cow whose records are genuinely missing. Both now use females of breeding age as their denominator, and each card states it.
- Fertility metrics now count every calf, not only the ones with a birth record. A calving reaches the database in two ways — as a reproduction event, or as a calf registered with the cow as its mother — and the reproductive calendar only ever read the first. In a herd where most calves predate the birth-event flow that meant a cow with five calves reported one, her calving interval came out empty despite four intervals, and her lifetime efficiency dropped low enough to raise a spurious "Considerar descarte". Calving interval, lifetime efficiency, total calves, the 12-month birth rate and the status inference now all read the merged list, deduplicated by calf identity so a calf recorded on both sides is not counted twice and twins still count as two.
- A mating explicitly marked as not pregnant no longer paints the cow as gestating. The status inference tested only for «Sí», so «No» — a cow who returned to heat — fell into the same branch as an unconfirmed observation and showed as "Gestación probable" for the rest of the notional gestation.
- Registering a birth now lets you photograph the calf. It was the only creation flow without a photo field, so a calf entered through it had to be found and edited afterwards to get an image.
- The back arrow and the Android back gesture now return to the page you actually came from. Four "Volver" arrows navigated to a hard-coded parent route, which pushed a new history entry instead of popping one — opening an animal from a sale or from the genealogy graph and tapping Volver always dumped you at `/ganado`. All fourteen back arrows are now one shared component. It also falls back to a sensible parent when there is nothing to go back to, instead of leaving the standalone PWA with no way out of a page opened from the app icon or reached straight after login.
- Filter changes in the genealogy graph no longer stack up in history, so one back press leaves the page rather than stepping back through every filter that was tried. The generation depth now lives in the URL alongside the focused animal.
- Logging in no longer leaves `/login` in history, where pressing back landed on it and was immediately redirected forward again.
- Returning to a list now restores it as it was left. The animal list keeps its search text, type filter and sort order — all three now live in the URL — and `/ganado`, `/actividad` and `/ventas` restore their scroll position, which previously failed because the list was still empty at the moment the browser tried to restore it.
- Deleted photos are now actually removed. They had no way out of IndexedDB — photos have no remote table, so they never reached the table sync's soft-delete cleanup, and the frontend never called the backend's delete endpoint. Every deletion accumulated as a change that stayed pending forever and its file stayed in Supabase Storage. The sync engine now purges them, and photo deletion on the backend is idempotent so a file already removed from Storage cannot block the record.
- Deleting an animal's photo now clears the animal's stored photo URL, so the removal reaches the other devices instead of leaving them showing an image whose file is gone.
- Stopped showing photos that had been deleted locally: several views read the photo table without filtering soft-deleted rows.
- Stopped re-preloading already-cached remote photo URLs on every sync cycle, which became wasteful at the 60-second cadence.

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
