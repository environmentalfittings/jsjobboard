#!/usr/bin/env python3
"""Generates src/lib/valveKeepCsvColumns.ts from T['u'] in generate-traveler-templates.py.

Column order = form / template field order. Headers are section-prefixed so repeated
labels (Set Pressure, etc.) stay unique. Re-run after editing T['u']:

  python scripts/generate-valvekeep-csv-columns.py
"""
from __future__ import annotations

import importlib.util
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "src", "lib", "valveKeepCsvColumns.ts")

spec = importlib.util.spec_from_file_location(
    "gen", os.path.join(HERE, "generate-traveler-templates.py")
)
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)

# Step name → CSV section prefix for fields that need disambiguation.
STEP_SECTION = {
    "Receive valve and record basic information": "Header / Received",
    "Record valve data plates": "Valve Data",
    "Pre-test": "Pre-Test Data",
    "Disassemble and clean": "Disassembly",
    "Parts inspection": "Parts Details",
    "Critical dimensions": "Critical Dimensions",
    "Machine and lap": "Machining",
    "Assemble": "Assembly",
    "Set and test": "Test Data",
    "Seal, tag and stamp": "Closing",
    "Paint and prepare for shipping": "Shipping",
    "Final inspection": "Final",
}

DATE_KEYS = {
    "vk_due_date",
    "vk_date_received",
    "vk_disposition_date",
    "vk_prn_repair_date",
    "vk_pto_date",
    "vk_date_tested",
}

# Labels that already carry their own section (nameplates, plates).
SELF_PREFIXED = re.compile(
    r"^(Original nameplate|Previous repair nameplate|Previous test only plate)\s*-\s*",
    re.I,
)


def title_case_section(label: str) -> str:
    """Normalize already-prefixed labels to Title Case section names."""
    m = SELF_PREFIXED.match(label)
    if not m:
        return label
    rest = label[m.end() :].strip()
    raw = m.group(1).lower()
    if raw.startswith("original"):
        return f"Original Nameplate - {rest}"
    if raw.startswith("previous repair"):
        return f"Previous Repair Nameplate - {rest}"
    return f"Previous Test Only Plate - {rest}"


def parts_header(label: str) -> str | None:
    # "Body - work" → "Parts Details - Body - Work"
    m = re.match(
        r"^(.+?)\s*-\s*(condition 2|condition|work|recommendation|name)$",
        label,
        re.I,
    )
    if not m:
        return None
    part, kind = m.group(1).strip(), m.group(2).strip()
    kind_map = {
        "condition": "Condition",
        "condition 2": "Condition 2",
        "work": "Work",
        "recommendation": "Recommendation",
        "name": "Name",
    }
    return f"Parts Details - {part} - {kind_map.get(kind.lower(), kind.title())}"


def dim_header(label: str) -> str | None:
    # "Nozzle Min - As Found" → "Critical Dimensions - Nozzle Min - As Found"
    m = re.match(r"^(.+?)\s*-\s*(As Found|Mfg|Mach\. By|As Shipped)$", label, re.I)
    if not m:
        return None
    return f"Critical Dimensions - {m.group(1).strip()} - {m.group(2).strip()}"


def pdesc_header(label: str) -> str | None:
    m = re.match(r"^Part (\d+)\s*-\s*(name|part number|heat #)$", label, re.I)
    if not m:
        return None
    kind = {"name": "Name", "part number": "Part Number", "heat #": "Heat #"}.get(
        m.group(2).lower(), m.group(2).title()
    )
    return f"Parts Description - Part {m.group(1)} - {kind}"


def header_for(step_name: str, label: str, key: str) -> str:
    if SELF_PREFIXED.match(label):
        return title_case_section(label)
    # Parts Description before Parts Details — "Part 1 - name" would otherwise match as a part row.
    pd = pdesc_header(label)
    if pd:
        return pd
    ph = parts_header(label)
    if ph:
        return ph
    dh = dim_header(label)
    if dh:
        return dh
    section = STEP_SECTION.get(step_name, step_name)
    # Disposition sits with Parts Details on the form.
    if key.startswith("vk_disposition"):
        section = "Parts Details"
    if label.strip().lower() == "js comment":
        return "Final - JS Comment"
    return f"{section} - {label.strip()}"


def format_for(key: str, field: dict) -> str:
    if key in DATE_KEYS:
        return "date"
    ftype = field.get("type")
    if ftype == "yes_no":
        return "yesno"
    opts = field.get("options") or []
    if opts and set(opts) <= {"Yes", "No", "NA"}:
        return "yesno"
    # Parts condition / work / recommendation codes.
    if re.search(r"_pd_.+_(cond2?|work|rec)$", key):
        return "code"
    return "text"


def main() -> None:
    letter = "u"
    old, job, vt, steps = gen.T[letter]
    scope = gen.build(letter, steps)
    # Walk custom items in sortOrder so column order matches the form.
    custom = sorted(scope["custom"], key=lambda c: c["detail"].get("sortOrder") or 0)
    columns = []
    seen = set()
    for item in custom:
        step_name = item["name"]
        for field in item["detail"].get("measFields") or []:
            fid = str(field.get("id") or "")
            m = re.search(r"(vk_[a-z0-9_]+)$", fid, re.I)
            if not m:
                continue
            key = m.group(1).lower()
            if key in seen:
                continue
            # Skip picture fields (there should be none under vk_).
            if field.get("type") == "picture":
                continue
            seen.add(key)
            label = str(field.get("label") or key)
            columns.append(
                {
                    "key": key,
                    "header": header_for(step_name, label, key),
                    "format": format_for(key, field),
                }
            )

    # Also include parts_order? No vk_ fields there.
    lines = [
        "// GENERATED by scripts/generate-valvekeep-csv-columns.py from T['u'] - edit that script (or",
        "// regenerate after changing the ValveKeep traveler template), then re-run.",
        "// This is the one place that defines ValveKeep CSV column order, headers, and cell formats.",
        "",
        "export type ValveKeepCsvFormat = 'text' | 'date' | 'yesno' | 'code'",
        "",
        "export type ValveKeepCsvColumn = {",
        "  key: string",
        "  header: string",
        "  format: ValveKeepCsvFormat",
        "}",
        "",
        "/** Delimiter and extension — ValveKeep may later want tab + .txt. */",
        "export const VALVEKEEP_CSV_DELIMITER = ','",
        "export const VALVEKEEP_CSV_EXTENSION = 'csv'",
        "",
        "export const VALVEKEEP_CSV_COLUMNS: ValveKeepCsvColumn[] = "
        + json.dumps(columns, ensure_ascii=False, indent=2),
        "",
        "export const VALVEKEEP_CSV_KEYS = VALVEKEEP_CSV_COLUMNS.map((c) => c.key)",
        "",
        "/** Returns drift messages if template keys and the column map disagree. */",
        "export function valveKeepCsvColumnDrift(templateVkKeys: Iterable<string>): string[] {",
        "  const expected = new Set(VALVEKEEP_CSV_KEYS)",
        "  const actual = new Set(",
        "    [...templateVkKeys].map((k) => String(k).toLowerCase()).filter((k) => k.startsWith('vk_')),",
        "  )",
        "  const missing = [...actual].filter((k) => !expected.has(k)).sort()",
        "  const extra = [...expected].filter((k) => !actual.has(k)).sort()",
        "  const msgs: string[] = []",
        "  if (missing.length) msgs.push(`CSV columns missing keys: ${missing.join(', ')}`)",
        "  if (extra.length) msgs.push(`CSV columns have unknown keys: ${extra.join(', ')}`)",
        "  return msgs",
        "}",
        "",
    ]
    text = "\n".join(lines)
    # Prefer trailing comma style closer to hand-written TS: leave JSON as-is (valid TS).
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"wrote {OUT} ({len(columns)} columns)")


if __name__ == "__main__":
    main()
