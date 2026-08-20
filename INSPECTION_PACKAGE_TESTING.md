# Inspection Package testing

Use test information only.

## Active trip photos

1. Start a test mileage trip.
2. In **Active Trip Photos**, take one photo and choose at least one existing photo.
3. Add a caption, open a thumbnail, and remove one photo.
4. End the trip and save the required full ZIP backup.
5. Confirm the backup ZIP contains the remaining trip photo in its `photos` folder.
6. Create an inspection record from the completed trip.
7. Confirm the trip photo appears in the inspection form and remains present after saving.
8. Export the inspection package and confirm the inherited trip photo is included.

## Word report and optional photo handoff

1. Open **Inspections** and create or open a test inspection.
2. Add at least two photos and give them captions.
3. Save the inspection.
4. In **Inspection History**, tap **Export Word Report**.
5. Confirm one `.docx` file is delivered without a wrapping ZIP or PDF.
6. Open the Word report and confirm it is editable and contains the inspection information and each attached photo exactly once.
7. Repeat with **Word + Photos ZIP** only when separate image files are required.
8. Extract that optional ZIP and confirm it contains one editable Word report plus a `Photos` folder.
9. Confirm the photos use normal image extensions and open individually.

## Private S&B Word template

1. Open **Inspections**.
2. Tap **Import S&B Word Template** and choose the approved blank `.docx`.
3. Confirm the status changes to **INSTALLED**.
4. Tap **Export Word Report** on an inspection.
5. Open the editable Word report and confirm:
   - the S&B branding, header, tables, and footer remain intact;
   - available customer, project, vendor, date, activity, summary, observations, action items, and release information are populated;
   - up to 50 attached photos appear in the landscape, two-per-row attachment grid; and
   - the report remains editable in Microsoft Word.
6. Confirm the S&B template itself is not present in the hosted repository or normal backup ZIP.

## Full restore backup

1. Make a new **Save Full Backup to Files** backup.
2. Extract a copy on a computer.
3. Confirm the `photos` folder contains normal image filenames rather than `.bin` files.
4. Keep the original ZIP unchanged.
5. Restore the original ZIP in Mileage Logger.
6. Confirm the trips, inspections, captions, and photos return.
7. Restore an older JSON backup and, if available, an older ZIP containing `.bin` photos to confirm backward compatibility.
