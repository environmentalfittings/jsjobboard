# ValveKeep CSV export for the relief valve traveler

## Goal

Add an "Export to ValveKeep" button next to "Print ValveKeep form" (traveler page and template preview). When a valve is finished, the technician presses it, gets one file for that valve, and imports that file on the ValveKeep website. This export is only for ValveKeep travelers: show the button only when the plan has `vk_` fields, the same check the print button uses (`reportHasValveKeepFields` in `src/lib/valveKeepFields.ts`).

ValveKeep's real upload layout is not known yet. Build a plain version now and keep every column decision in one place so the columns can be renamed and reordered later without touching anything else.

## Rules

- Export `vk_` fields only. Never export `js_` fields or photos. The `vk_` / `js_` split exists so J-S additions stay out of what goes to ValveKeep.
- One valve per file: one header row and one data row, one column per `vk_` key.
- If the traveler is not complete (any step not checked off), ask "This traveler is not finished. Export anyway?" before downloading.
- Column order follows the form: the field order of `T["u"]` in `scripts/generate-traveler-templates.py` (also the order of the template's steps and fields).
- A cell with no value is an empty string. Every column is always present, even when empty.

## Column map (the one place to edit later)

Create `src/lib/valveKeepCsvColumns.ts` exporting an ordered list of `{ key, header, format }`:

- `key`: the `vk_` key, for example `vk_set_pressure`.
- `header`: the column name. For now use the form's label, prefixed with its section where the label repeats (for example "Original Nameplate - Set Pressure", "Previous Repair Nameplate - Set Pressure", "Test Data - Set Pressure", "Critical Dimensions - Nozzle Min - As Found", "Parts Details - Disc - Work").
- `format`: one of
  - `text` (as entered),
  - `date` (YYYY/MM/DD, the way the form prints dates),
  - `yesno` (Yes / No / NA),
  - `code` (parts codes: the single code character only, "A- Good" becomes "A", "1- Replaced" becomes "1").

Add a small test or a dev-time check that fails if a `vk_` key in the template has no column, or a column has no matching key, so the two cannot drift apart.

## File

- CSV, UTF-8 with BOM so Excel opens it cleanly, CRLF line endings, values quoted when they contain a comma, quote or line break.
- File name: `valvekeep-<JS Shop ID or valve id>-<YYYY-MM-DD>.csv`.
- Keep the delimiter and file extension as two constants next to the column map; ValveKeep may want a tab-delimited .txt instead.

## Constraints

- Do not change `vk_` / `js_` field ids, the print output, or the old "Valve Keep Template".
- Do not push or deploy until I say so.
- `npx tsc -b --noEmit` must pass.

## Done when

1. The button appears only on travelers that have `vk_` fields.
2. The CSV has one header row and one data row, 363 columns, in form order.
3. A value typed into the traveler appears under the right header, including the repeated labels (Set Pressure, Model Number, Capacity, CDTP, BP) in their own sections.
4. No `js_` data or photo fields appear in the file.

Finish with the list of column headers so they can be checked against ValveKeep's upload template when it arrives.
