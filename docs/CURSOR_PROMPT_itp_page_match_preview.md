# Job ITP page: match the template preview, keep flagging

## The problem

Job 522397-1 (ITP id 68025) uses the template "Traveler - Relief Valve (ValveKeep form)". Two pages show the same ITP very differently:

- **Template preview** (`/itp-template-preview`) and the **job traveler view** (`/itp/:id/traveler`) both render `ItpTravelerReportPanel`: one compact line per ITP step, with a "Fill requirement" / "Edit" button that opens that step's traveler in `ItpTravelerStepModal`. This is the look we want.
- **Job ITP page** (`/itp/:id`, `ItpLibraryEditor`) renders every traveler input inline under each checklist line (`itp-library-meas-fields`, around line 2490 of `src/components/ItpLibraryEditor.tsx`). On this template that is 437 inputs on one page, so the ITP no longer reads as an ITP.

The ITP and the traveler are separate things. The ITP page is the checklist (scope, check-off, flags, hold points, QC accept). Data entry belongs in the traveler behind each step.

## What to change

### 1. ITP checklist lines on the job ITP page

In the ITP checklist of `ItpLibraryEditor`, stop rendering traveler inputs inline. Each line should look like a line in the preview:

- checkbox, step name, ref, station, and the existing badges (Photo, Fields / Measurements, Hold point, Blocks next, On Traveler);
- the same status text the traveler view shows ("Locked until filled" / "Ready to check");
- a "Fill requirement" button (or "Edit" once requirements are met) that opens `ItpTravelerStepModal` for that step, the same modal and the same save path the traveler view uses, so values entered from either page are the same data;
- the photo count for the step, without the inline photo uploader;
- everything that is ITP function today stays exactly as it is on each line: flag (⚑), clear flag, remove from scope (✕), station select, notes, hold point handling, "Add to Traveler".

Apply this to every ITP, not just relief valves. Build Scope, the stats row, Job Details, Print ITP, Accept, Accept with changes, Save ITP and the QC change log do not change.

### 2. Flagging from the traveler view

Flagging must keep working the way it does on the current ITP. Today the traveler view only offers a flag inside the step modal (`ItpTravelerStepModal`, around line 1610), so a line with no traveler requirement cannot be flagged there at all.

- In `ItpTravelerReportPanel`, add a flag button on every line, for users with the `flagItpItem` permission, using the existing `ItpFlagIssueModal` and the same flag save path as `ItpLibraryEditor`.
- Show the flagged state on the line (the existing "Flagged" pill) with the flag note, and let users who can clear flags today clear them from here with `ItpClearFlagModal`.
- A flag raised on either page shows on both, and counts in the ITP page's FLAGGED stat.
- Alerts must work exactly as they do now. A flag raised from the new line button has to do everything `confirmFlagIssue` in `ItpTravelerStepModal` and the flag handler in `ItpLibraryEditor` do today: write the same `exec` flag fields (`flagged`, `flagReason`, `flagPhotos`, `flaggedAt`, `flaggedByUserId`, `flaggedByName`, and the cleared owner / resolution fields), save the plan, then call `notifyQualityTeamItpItemFlagged` (`src/lib/messages.ts`) with the same arguments so the Quality Team gets the same message. Pull that into one shared helper and call it from all three places rather than writing a third copy. Clearing a flag keeps its current behavior too.
- In the template preview (`previewMode`), show the flag button but keep it a no-save sample, like the rest of the preview.

## Constraints

- No change to stored data. Same plan payload, same field ids, same exec values. Do not rename or remove any `vk_` or `js_` id.
- Do not change the ValveKeep print, the CSV export, or `ItpTravelerStepModal`'s table entry.
- Print ITP output keeps working. If it currently relies on the inline fields being on the page, keep the printed result the same.
- Do not push or deploy until I say so. `npx tsc -b --noEmit` must pass.

## Done when

1. `/itp/68025` shows 13 compact lines that match what Preview ITP shows for the same template, each with its traveler button, and no inline input fields.
2. Filling a step from the ITP page and from `/itp/68025/traveler` shows the same values in both places.
3. Every line can be flagged and un-flagged from the ITP page and from the traveler view; the FLAGGED count follows. A flag from either page sends the Quality Team the same alert it sends today, and shows up wherever flagged items are listed now (Quality Team views, Messages).
4. Check-off, hold points, Accept / Accept with changes and the QC change log behave as before.
5. A Twinseal job ITP and a gate valve job ITP also show compact lines and still work.

Finish with a short list of what changed and anything that could not be kept the same.
