# Parts inspection table: easier to read and shorter to scroll

## Where

The "Parts inspection" step of the template "Traveler - Relief Valve (ValveKeep form)", in `ItpTravelerStepModal` (the PARTS DETAILS table: Part, Cond, Cond 2, Work, Rec, As-found, As-left). Test on job 522397-1 (`/itp/68025`).

## Problems

1. The Cond / Cond 2 / Work / Rec dropdowns are so narrow that the selected value is cut off (it reads "— Sele").
2. The As-found and As-left photo controls show on all 37 rows, so every row is about three lines tall and the table is a long scroll, even though photos are only required when Work is "1- Replaced".

## Changes

1. **Dropdowns show the code.** When closed, each dropdown shows just the code character of the selected option ("A", "Q", "1", "#") and is wide enough to show it; the open list still shows the full text ("A- Good", "1- Replaced"). Empty shows "—". Add the full text as the control's title so it appears on hover.
2. **Photo controls only when needed.** In a row, show the As-found and As-left photo controls only when that row's Work is "1- Replaced" or the row already has photos. Otherwise show a small "Add photos" link in that cell that reveals the controls for that row. Rows without photo controls should be a single line tall.
3. **Keep the header in view.** Make the table header row sticky inside the modal's scroll area so the column names stay visible.
4. On a phone-width screen the table must still be usable: allow horizontal scroll inside the table rather than squeezing the columns.

## Constraints

- Display only. No change to field ids (`vk_pd_*`, `js_pd_*`), stored values, the required-photo rule for replaced parts, the ValveKeep print, or the CSV export.
- Apply the same dropdown treatment to nothing else; Critical Dimensions and Parts Description stay as they are.
- Do not push or deploy until I say so. `npx tsc -b --noEmit` must pass.

## Done when

1. A selected code is readable in every dropdown without opening it.
2. A part with Work other than "1- Replaced" and no photos takes one line; setting Work to "1- Replaced" shows both photo controls and still requires a photo in each.
3. Existing values and photos on a saved traveler show exactly as before.
