# Photo Attachments and Trip Editing — Test Checklist

This branch is a test version. Do not merge it into the live app until the iPhone test is approved.

## Inspection photo test

1. Open **Visits & Inspections**.
2. Open a linked inspection or tap **Add Inspection to Visit**.
3. Tap **Take Photo** and take a harmless test photo.
4. Confirm the photo preview appears.
5. Add a caption and save the inspection.
6. Reopen the inspection and confirm the photo and caption remain.
7. Tap the thumbnail and confirm the larger photo opens.

## Trip edit test

1. Open **View Log**.
2. Tap **Edit** beside a test trip.
3. Change an odometer value, vendor, or notes.
4. Confirm the mileage preview recalculates.
5. Tap **Save Trip Changes**.
6. Confirm the Trip Log shows the correction.
7. If the trip has a linked inspection, confirm its vendor, project, times, and mileage also changed.
8. Confirm GPS map links remain unchanged.

## Saved-trip photo test

1. Open **View Log** and tap **Edit** beside a completed test trip.
2. Under **Visit Photos**, use **Take Photo** or **Choose Photos**.
3. Add or change the caption and confirm it remains after closing and reopening the editor.
4. Open **Visits & Inspections**, choose the vendor and saved visit, and confirm the photo appears as **Trip / visit**.
5. Open a linked inspection and confirm the trip photo appears under **Trip-Level Photos** for context, while **Inspection-Specific Photos** remains separate.
6. Return to the saved-trip editor, remove the trip photo, and confirm it disappears from the Visit workspace without deleting inspection-specific photos.

## Visit workspace test

1. Choose a vendor and one saved visit.
2. Confirm the workspace shows the trip date, mileage, client/project, quick notes, and photos.
3. Link two Active Jobs to that same visit and confirm both appear under **Linked inspections**.
4. Switch between the linked inspection buttons and confirm the current AJ banner changes clearly.
5. Export Active Jobs activity and confirm the visit mileage appears once while both AJ identifiers are listed.
6. Tap **Standalone Inspection** and confirm an inspection can still be saved without a mileage trip.

## Backup test

1. Confirm **BACKUP REQUIRED** appears after either change.
2. Tap **Save Full Backup to Files**.
3. Confirm the filename ends in `.zip`.
4. Save it outside the app and confirm the backup.
5. Restore that ZIP and confirm the trip, inspection, photo, and caption return.
6. Optionally restore an older `.json` backup and confirm it is still accepted.

