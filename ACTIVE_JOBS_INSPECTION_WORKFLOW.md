# Active Jobs Inspection Workflow — Development Build

## Purpose

This branch starts the next Mileage Logger inspection-workflow build. It is intentionally separate from `main` until the workflow is reviewed and tested.

## Agreed business rules implemented in the production inspection database

- `AJ-###` is the permanent internal Active Job identifier.
- One Active Job represents one S&B reporting unit.
- The reporting unit is based on S&B inspection number + reporting vendor.
- S&B prefixes can suggest client/facility:
  - `E10379` → Shell / Norco
  - `E10372` → Shell / Geismar
  - `E10367` → Westlake / Plaquemine
- Client/facility derivation is a suggestion/rule, not a reason to silently change an existing authoritative Active Jobs row.
- Multiple Active Jobs may be open at the same vendor at the same time.
- Switching Active Jobs auto-saves the current inspection draft.
- One mileage trip may support multiple Active Jobs; mileage must not be duplicated.
- Reporting Vendor and Inspection Location/Subvendor are separate concepts.
- Item identification order is:
  1. Equipment Tag
  2. ISO Drawing Number
  3. Vendor Job Number
  4. Piece / Spool Number
- Vendor Load # is a separate optional field and is entered exactly as assigned on the vendor shipping list.
- Routine satisfactory inspections use minimal data entry.
- Detailed fields are mainly needed for exceptions or optional representative QA measurements.
- DFT may be recorded as satisfactory without entering numeric values; if no values are entered, report language states only that the DFT was within specified requirements.
- Inspection completion is separate from Active Job completion.
- A completed inspection may still have open follow-up.

## Production integration

The Active Jobs workspace is loaded inside the existing **Inspections** screen in `index.html`. Active Job inspections use the existing `settings.inspections` database, backup/restore state, photo store, follow-up tracking, inspection exports, and offline application shell.

- Switching AJs autosaves and later resumes the AJ's current draft.
- The current-AJ banner stays above the inspection form as a visual safeguard.
- Photos and quick notes are stored on the current inspection record, which carries its `activeJobId`.
- Reporting vendor is fixed from the selected AJ while inspection location/subvendor remains separately editable.
- Existing mileage trips remain single records. Multiple AJ inspections can reference the same `tripId`, and the Active Jobs activity CSV emits that trip's mileage once with all linked AJ identifiers.
- Draft, completion, Active Job status, and open follow-up remain independent states.
- Full backups include the integrated inspection/AJ fields through the existing app-state backup. Existing photo and private-template handling is unchanged.

The original prototype files remain on the branch as design-history references:

- `active-jobs-workspace.html`
- `active-jobs-workspace.css`
- `active-jobs-workspace.js`

Use the normal `index.html` app for production-workflow testing.

## Active Jobs Master handling

The integrated workspace reads the current Active Jobs rows without silently rewriting them. It detects duplicate S&B inspection number + reporting vendor combinations for review.

This is important because the current workbook contains separate Smith Tank rows for `E10379-410` (`AJ-002` and `AJ-003`), while the newly agreed reporting-unit rule indicates those activities may belong under one Active Job/reporting stream. That workbook correction should be deliberate and reviewed rather than performed automatically by the prototype.

## Coating workflow included

The integrated inspection form includes facility-aware coating selection for Shell Norco and Shell Geismar, with stored system summaries sufficient to drive the low-entry QA form and draft report wording.

Routine coating fields include:

- Environmental conditions — Satisfactory / Unsatisfactory / Not observed
- Blast / surface preparation — Satisfactory / Unsatisfactory / Not observed
- Anchor profile — Satisfactory / Unsatisfactory / Not checked
- Products verified — Yes / No / Not observed
- DFT — Satisfactory / Unsatisfactory / Not observed
- Appearance — Satisfactory / Unsatisfactory
- Vendor QC — Satisfactory / Issue noted / Not reviewed
- Optional anchor-profile readings
- Optional DFT readings
- Deficiencies / disposition only when needed

## Structural steel workflow included

The integrated inspection form includes:

- Shop visual
- Dimensional
- Post-galvanizing
- Final / release

Routine checks include material/identification, weld visual condition, workmanship, dimensions, post-galvanizing condition, deficiencies, disposition, and inspection result.

## Draft/report behavior

- Drafts autosave inside the production inspection database.
- Switching jobs saves the current draft first.
- Completed inspection records remain separate from Active Job status.
- Draft report language is generated from the entered facts.
- Numeric values are not invented when only a satisfactory result was entered.

## Validation status

Completed on the development branch:

- JavaScript syntax checks for the app, inspection database, Active Jobs data, and service worker
- Direct regression test proving one trip linked to multiple AJs produces one mileage row
- Desktop browser checks for AJ selection, conflict flags, current-job safeguards, autosave/resume, coating and structural-steel workflows, completion with open follow-up, and reporting vendor/location separation
- Report-language checks with blank, valid, and invalid measurement input paths
- Phone-size responsive-layout check at 390 × 844
- Offline reload with the local server stopped, including retained inspection/AJ records
- Browser console check with no warnings or errors

Before merge, complete intended-device acceptance testing for camera/photo capture, GPS permission and route behavior, private STA generation, native Save to Files backup confirmation, and restore from an actual retained backup. The Active Jobs Master conflicts remain review flags; do not edit the authoritative workbook from this app. Only merge after explicit user approval.
