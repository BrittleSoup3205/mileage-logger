# Mileage Logger — Multi-Device Architecture

## Goal

Use one private Mileage Logger data set from iPhone, iPad, and PC without giving up offline field use.

- iPhone: mileage, GPS, quick photos, quick notes.
- iPad: field inspection entry, vendor loads, coating/structural workflows, photos, follow-ups.
- PC: Active Jobs review, long-form inspection editing, reports, Concur, timesheets, document review.
- All devices: same synchronized structured records.

## Design rule

**Local-first, cloud-synchronized.** The local browser copy remains usable when the internet is unavailable. Cloud synchronization is additive; it does not replace the required ZIP backup.

## Phase 1 — Structured data sync

Implemented by `sync-engine.js` and `supabase/migrations/001_multi_device_sync.sql`.

Synchronizes:

- active mileage trip
- completed trips
- trip-level Concur reimbursement fields
- inspection records
- repeatable vendor loads stored inside inspections
- follow-ups stored inside inspections
- timesheet entries
- timesheet week status
- durable customer/vendor/purpose lists and mileage rate
- decision that a completed trip is not an inspection

Remains local in Phase 1:

- actual photo image files
- private STA master PDF
- external drawings, NDE reports, MTRs, emails, and other documents
- ZIP backup files
- device-only UI context such as the currently selected workspace

## Cloud provider

The first implementation uses a private Supabase project because the static/PWA Mileage Logger can authenticate directly from iPhone, iPad, and PC, while Row Level Security restricts records to the signed-in user.

Only the public/publishable key belongs in the browser app. Never place a service-role or secret key in Mileage Logger.

## Sync behavior

1. Local edits save immediately using the existing Mileage Logger storage key.
2. Every synchronized record has local sync metadata containing a content hash and local modification time.
3. When online and signed in, the app pulls cloud changes and then pushes local changes.
4. Deleted records are represented by tombstones so deletion propagates instead of reappearing on another device.
5. If both devices change the same record after the last synchronization, the newer timestamp wins and the conflict is surfaced as a sync warning.
6. The app also synchronizes when it returns to the foreground or internet access comes back.

The normal intended workflow should rarely conflict because different devices normally work different parts of the day: the phone owns mileage/GPS while the iPad or PC edits inspection/reporting data.

## Security

The database tables have Row Level Security enabled. Each authenticated user can select/insert/update/delete only records where `user_id = auth.uid()`.

The sync password is not written to Mileage Logger configuration. The authentication session token is stored locally by the app so a device can remain signed in.

## Setup required before first live sync

1. Create a private Supabase project.
2. Run `supabase/migrations/001_multi_device_sync.sql` in its SQL editor.
3. In Mileage Logger Settings > Multi-Device Mileage Logger, enter:
   - project URL
   - public/publishable key
   - sync email
   - device name
4. Enable sync and save setup.
5. Create the private Mileage Logger sync account on the first device.
6. Sign in with the same account on the other devices.
7. Verify a controlled test before using live inspection records.

## Required validation before live use

- Start a test trip on iPhone and sync.
- Open iPad/PC and confirm the active trip appears.
- Create or edit a test inspection on iPad/PC.
- Sync iPhone and confirm the inspection appears without ending the trip.
- End the trip on iPhone and confirm final mileage appears on the linked inspection on iPad/PC.
- Change Concur status on one device and verify another device receives it.
- Add a manual timesheet entry on PC and verify iPhone/iPad receives it.
- Delete only test records and confirm deletion propagates.
- Confirm the existing ZIP backup/restore still works independently.

## Phase 2 — Private photo and document sync

Next phase after structured-data validation:

- private cloud storage bucket
- photo upload/download queue
- thumbnails and on-demand full-resolution retrieval
- storage ownership by signed-in user
- photo/file conflict handling
- retain original iPhone Photos copy

## Phase 3 — PC management workspace

After synchronization is stable:

- wider desktop layout
- Active Jobs control center
- follow-up dashboard
- report completion workflow
- Concur queue optimized for keyboard/mouse
- weekly timesheet review
- drag/drop job documents
- job-centric history and search

## Deployment note

GitHub Pages currently serves Mileage Logger from the `preview-hosting` branch rather than directly from `main`. Any approved production merge must also deliberately synchronize the Pages branch so the live PWA actually receives the release.
