# Active Jobs Inspection Workflow — Development Build

## Purpose

This branch starts the next Mileage Logger inspection-workflow build. It is intentionally separate from `main` until the workflow is reviewed and tested.

## Agreed business rules implemented in the prototype

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

## Prototype pages/files

- `active-jobs-workspace.html`
- `active-jobs-workspace.css`
- `active-jobs-workspace.js`

Open `active-jobs-workspace.html` on the development branch to review the current workflow.

## Active Jobs Master handling

The prototype seeds the current Active Jobs rows from the uploaded Active Jobs Master rather than silently rewriting them. It also detects duplicate S&B inspection number + reporting vendor combinations for review.

This is important because the current workbook contains separate Smith Tank rows for `E10379-410` (`AJ-002` and `AJ-003`), while the newly agreed reporting-unit rule indicates those activities may belong under one Active Job/reporting stream. That workbook correction should be deliberate and reviewed rather than performed automatically by the prototype.

## Coating workflow included

The prototype includes facility-aware coating selection for Shell Norco and Shell Geismar, with stored system summaries sufficient to drive the low-entry QA form and draft report wording.

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

The prototype includes:

- Shop visual
- Dimensional
- Post-galvanizing
- Final / release

Routine checks include material/identification, weld visual condition, workmanship, dimensions, post-galvanizing condition, deficiencies, disposition, and inspection result.

## Draft/report behavior

- Drafts save locally in the prototype.
- Switching jobs saves the current draft first.
- Completed inspection records remain separate from Active Job status.
- Draft report language is generated from the entered facts.
- Numeric values are not invented when only a satisfactory result was entered.

## Not yet integrated into production

This branch does **not** yet replace the existing inspection database in `main`.

Before merge, the next build steps are:

1. Review the prototype workflow on phone/desktop.
2. Resolve/confirm how legacy Active Jobs rows that conflict with the new reporting-unit rule should be handled.
3. Connect the Active Jobs workspace to the production inspection state/backup model.
4. Add photo/quick-note attachment to the selected AJ/inspection.
5. Connect the vendor workspace to mileage trips without duplicating mileage.
6. Add production navigation from the main app.
7. Run syntax, browser, phone-size, backup/restore, offline, and regression testing.
8. Only merge after explicit user approval.
