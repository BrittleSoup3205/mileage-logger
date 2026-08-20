# Mileage Logger 7.0 Full Upgrade List

Status: implemented locally on `agent/full-upgrade-list` and regression-tested on August 20, 2026.

## Inspection and report workflow

- One inspection can contain multiple activities, including Hydro, Coating, NDE, Final, Dimensional, and Documentation Review. Existing single-activity records migrate automatically.
- Selecting Coating or Structural activities opens the matching specialized workflow without requiring a second inspection.
- The inspection form clearly separates job context, identifiers, activities, inspection time, findings, evidence, and follow-up.
- Visit, Active Job, and Inspection are shown as distinct levels, with clearer actions for opening or creating an inspection.
- Visit travel time and inspection work time are labeled separately.
- Temporary inspection locations are distinct from saved preferred facility profiles.
- Pending and unassigned states use explicit wording, and the app includes a short workflow explanation.
- Report text receives conservative whitespace, capitalization, and punctuation cleanup. Findings are routed to the appropriate report sections without duplicating the same statement.
- Report photos use a two-per-row landscape layout. Each photo supports Fill, Fit, Rotate Left, and Rotate Right while preserving proportions.
- Reports export directly as Word documents. Inspection PDF report generation has been removed; the app's separate STA form PDF workflow remains available.
- A ZIP is offered only when it is useful: Word plus separate photo files, or multiple selected Word reports.

## Photo handling and limits

- Inspection reports have a 50-photo maximum and show an early warning at 30 photos.
- Every accepted image is resized, when necessary, so its longest edge is no more than 1600 pixels and is re-encoded as JPEG at 82% quality with a white background.
- If browser image conversion fails, the selected image file is stored unchanged as a fallback.
- The compressed app copy is separate from the original retained in the device photo library.
- Word export was exercised at 0, 1, 4, 5, 8, 13, 25, and 50 photos, with each image included exactly once.

## Active Jobs and follow-up

- Numeric or implausible Current Status values such as `57` are rejected instead of displayed as status text.
- Last Mileage Logger Visit is calculated from linked inspection and visit data when the workbook value is blank or broken.
- Report-to-Active-Job suggestions require review and can be applied or dismissed.
- New Active Jobs can be entered manually with an explicit `AJ-###` identifier; the app does not invent the next number.
- The follow-up dashboard groups open follow-ups, deficiencies, and load exceptions by Active Job and displays owner, due date, or no-date status.
- A repaired copy of the Active Jobs Master workbook uses bounded formulas for Last Mileage Logger Visit and its downstream helper columns, eliminating the broken `#REF!` references without requiring manual entries in calculated cells.

## Sync, queues, and recovery

- A clean sync clears a stale CHECK indicator. Historical conflicts remain available in Sync History without keeping the current device in a warning state.
- Sync History shows health, last successful sync, device information, and conflict winners.
- Timesheet warnings name the actual incomplete days and explain what each day is missing.
- Administrative submission queues are explicitly separate from field completion and sync status.
- Active Jobs display a clearer Next Action and reviewed update workflow.
- Settings show app version `7.0.0-preview` and build `2026.08.20-full-upgrade-list.1`.
- Backup validation can test a backup file without replacing current app data, and the result is recorded in Settings.

## Verification

The JavaScript syntax checks and all regression suites passed, including Active Jobs data and management, visit/inspection workflow, backup compatibility, multi-device bootstrap and sync, Word report generation, and the complete upgrade-list coverage test.
