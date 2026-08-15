# Upgrade #6 — Active Jobs Management

This upgrade keeps the existing `mileage_logger_state_v3` local-storage key and the existing IndexedDB photo/document stores unchanged. It adds three optional arrays inside the existing state document:

- `activeJobs` — the synchronized authoritative catalog after first use
- `facilityProfiles` — reusable vendor/facility defaults
- `activeJobImports` — the 50 most recent import audit records

On first run, `activeJobs-data.js` seeds `activeJobs` only when that array does not already exist. Existing trips, inspections, photos, vendor loads, reimbursement records, timesheets, settings, and record links are not rewritten. Older backups remain readable; new version 6 data backups include all three arrays.

## Import workflow

Settings → **Update Active Jobs** accepts an `.xlsx` file with a worksheet named exactly `Active Jobs`. The reader finds the actual header row, preserves source text, ignores formula-only table rows, and treats Excel error values as unknown/blank.

The review classifies every applicable row as NEW, UPDATED, CLOSED, NO CHANGE, or CONFLICT. Nothing changes until **Apply Update**. When an existing AJ's source row leaves S&B Inspection Number or Reporting Vendor blank, the stored permanent identifier is preserved and shown as a non-blocking warning; blank source cells never erase it. Known historical duplicate identities remain separate with a grandfathered warning. New missing identities, newly introduced duplicates, and nonblank identity changes remain blocking conflicts requiring an explicit decision. Rows missing from a later workbook never close or delete an existing job.

Future workbook imports use this same in-app action and do not require a deployment.

## Facility Profiles and pending work

Multiple Facility Profiles may be linked to an Active Job, with one preferred/default profile. Prefill only fills blank visit fields. A different location remains a one-visit override unless **Save to Facility Profile** is chosen explicitly.

When no reasonable Active Job matches a visit, the app shows **NO ACTIVE JOB FOUND** and does not suggest unrelated jobs. **Work as Pending / Unassigned Job** retains normal autosave, photos, loads, follow-ups, and trip links. **Assign to Active Job** updates that same inspection ID later instead of making a duplicate.

## Multi-device sync

The existing `mileage_sync_records` table and its existing user-scoped RLS policies support the new generic record types:

- `active_job`
- `facility_profile`
- `active_job_import`

No database schema migration or service-role key is required. The same signed-in user receives these structured records through the existing sync engine; actual photos and private document files remain device-local as before.

An authenticated iPad or PC with no `mileage_logger_state_v3` uses the existing pull-only empty-device bootstrap: it downloads authoritative cloud records, rebuilds stale sync metadata, derives the last odometer from the newest completed cloud trip, and uploads nothing during that first bootstrap. Upgrade #6 does not materialize its embedded Active Jobs seed before this check.

## User-test checkpoint

1. On PC, open Settings, choose the current Active Jobs Master workbook, review every classification, resolve all conflicts, then apply.
2. Create two Facility Profiles for one vendor, link both to an AJ, and choose one as preferred.
3. Start a trip using that AJ and verify project, client, and preferred facility prefill without overwriting a value you typed first.
4. On iPhone, sync and confirm the imported jobs and profiles appear; choose a non-default facility and confirm it changes only that visit.
5. At a vendor with no match, create a pending inspection, add a load/note/photo/follow-up, close and reopen it, then assign it after the AJ is available. Confirm the inspection ID/history is not duplicated.
6. On iPad, sync and confirm the assigned inspection, linked trip, AJ, loads, and follow-ups match the PC/iPhone records.
7. Save a full data backup, restore it on a test browser/device, and confirm Active Jobs, profiles, import history, trips, inspections, photos metadata, Concur, and timesheets remain present.
