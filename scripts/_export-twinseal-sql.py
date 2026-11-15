#!/usr/bin/env python3
"""Extract Twinseal rows from the generated seed into seed-only + update SQL files."""
import re
import pathlib

root = pathlib.Path(__file__).resolve().parents[1]
src = (root / "supabase" / "seed-itp-traveler-templates.sql").read_text(encoding="utf-8")
m = re.search(
    r"(-- Twinseal:.*?on conflict \(job_type, valve_type, name\) do nothing;)",
    src,
    re.S,
)
if not m:
    raise SystemExit("Twinseal block missing from seed")
block = m.group(1)
if "Work order" not in block:
    raise SystemExit("Work order field missing from Twinseal block")
if '"pictureLabel": "Before photos"' not in block:
    raise SystemExit("Before photos label missing from Twinseal block")
if '"pictureLabel": "Before photos", "minPhotos": 4' not in block:
    raise SystemExit("Before photos minPhotos=4 missing from Twinseal block")

only = (
    "-- Twinseal only: adds the non-default template 'Traveler - Twinseal'. Safe to re-run.\n"
    "begin;\n\n"
    f"{block}\n\n"
    "commit;\n"
)
(root / "supabase" / "seed-itp-traveler-twinseal-only.sql").write_text(only, encoding="utf-8")

m2 = re.search(
    r"values \('repair', 'Twinseal', 'Traveler - Twinseal', false, (\$trv\$.*?\$trv\$)::jsonb\)",
    block,
    re.S,
)
if not m2:
    raise SystemExit("Could not parse Twinseal scope payload")
scope = m2.group(1)
upd = (
    "update public.itp_library_templates\n"
    f"set scope = {scope}::jsonb,\n"
    "    updated_at = now()\n"
    "where job_type = 'repair' and valve_type = 'Twinseal' and name = 'Traveler - Twinseal';\n"
)
(root / "supabase" / "update-itp-traveler-twinseal.sql").write_text(upd, encoding="utf-8")
downloads = pathlib.Path(r"c:\Users\envir\Downloads\update-itp-traveler-twinseal.sql")
if downloads.parent.is_dir():
    downloads.write_text(upd, encoding="utf-8")
print("Twinseal seed + update SQL written")
print("update bytes:", len(upd))
