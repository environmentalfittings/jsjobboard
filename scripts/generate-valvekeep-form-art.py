#!/usr/bin/env python3
"""Generates src/lib/reliefValveServiceTravelerFormArt.ts from docs/reference/VSI Repair Traveler.pdf

The ValveKeep form print draws the reference form itself (every rule, box and label at its
original position) and overlays traveler values on top. This script reads the reference PDF,
drops the sample values, swaps the VSI branding for J-S, and writes the static art plus the
position of every value cell.

Needs PyMuPDF:  pip install pymupdf
Run:            python scripts/generate-valvekeep-form-art.py
"""
import json, os, re, sys
import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
REF = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "docs", "reference", "VSI Repair Traveler.pdf")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "..", "src", "lib", "reliefValveServiceTravelerFormArt.ts")

doc = pymupdf.open(REF)
R = lambda v: round(float(v), 1)

# ---- static text ----------------------------------------------------------------
KEEP_TIMES = [
    re.compile(r"^Yes\s*/\s*No$"), re.compile(r"^Original / Dup"), re.compile(r"^Good\s+/"), re.compile(r"^As Found Condition$"),
    re.compile(r"^Intact/Broke/Missing$"), re.compile(r" Min$| Max$|^Spindle Run Out$"), re.compile(r"\[  \]\[  \]"),
    re.compile(r"^Bench / ALD"), re.compile(r"^Air\s+/ Water"), re.compile(r"^Yes/No/NA _+$"), re.compile(r"^Yes / No / NA\s+@$"),
    re.compile(r"^_+$"), re.compile(r"^PSIG$"),
]
RENAME = {"Valve Sales Inc.": "J-S Machine & Valve", "VSI Shop ID": "JS Shop ID", "VSI Shop ID #": "JS Shop ID #",
          "VSI Comment": "JS Comment"}
RIGHT_ALIGNED_RENAMES = {"VSI Shop ID", "VSI Shop ID #"}

def spans(pg):
    out = []
    for b in doc[pg].get_text("rawdict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                t = "".join(c["c"] for c in s["chars"])
                if t.strip(): out.append((s, t))
    return out

def is_static(pg, s, t):
    x, y = s["origin"]
    times = "Times" in s["font"]
    if times:
        if pg == 0 and t == "PSIG" and abs(y - 547.8) > 1: return False
        return any(r.search(t) for r in KEEP_TIMES)
    if s["color"] != 197638: return t.strip() == "Due Date"            # red sample date
    if pg == 0 and t == "25": return False                              # sample Unit / Vessel
    if pg == 1 and s["size"] < 9.5 and 705 < y < 740: return False      # sample comments
    return True

def esc(t): return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def art(pg):
    page = doc[pg]
    o = []
    for g in page.get_drawings():
        w = g.get("width") or 0
        for it in g["items"]:
            if it[0] == "l":
                if w == 0: continue
                a, b = it[1], it[2]
                if pg == 1 and abs(a.y - 747.9) < 0.2:   # underline of the renamed "JS Comment" heading
                    continue
                o.append(f'<line x1="{R(a.x)}" y1="{R(a.y)}" x2="{R(b.x)}" y2="{R(b.y)}" stroke-width="{max(0.5, round(w, 2))}"/>')
            elif it[0] == "re" and g["type"] == "s":
                r = it[1]
                o.append(f'<rect x="{R(r.x0)}" y="{R(r.y0)}" width="{R(r.width)}" height="{R(r.height)}" fill="#fff" stroke-width="0.5"/>')
    if pg == 1:
        x2 = R(18 + pymupdf.get_text_length("JS Comment", fontname="hebo", fontsize=12))
        o.append(f'<line x1="18" y1="747.9" x2="{x2}" y2="747.9" stroke-width="1.31"/>')
    for s, t in spans(pg):
        if not is_static(pg, s, t): continue
        x, y = s["origin"]; x1 = s["bbox"][2]
        fam = "t" if "Times" in s["font"] else "a"
        cls = fam + ("b" if "Bold" in s["font"] else "") + ("i" if "Italic" in s["font"] else "")
        red = ' style="fill:#ed1c24"' if s["color"] != 197638 else ""
        raw = t.strip()
        if pg == 1 and re.match(r"^\.\. \[", raw): t = t.replace("..", "  ", 1)   # write-in part names are overlaid
        if raw in RENAME:
            new = RENAME[raw]
            if raw in RIGHT_ALIGNED_RENAMES:
                o.append(f'<text class="{cls}" x="{R(x1)}" y="{R(y)}" font-size="{R(s["size"])}" text-anchor="end">{esc(new)}</text>')
            else:
                o.append(f'<text class="{cls}" x="{R(x)}" y="{R(y)}" font-size="{R(s["size"])}">{esc(new)}</text>')
            continue
        lead = len(t) - len(t.lstrip())
        chars = s["chars"][lead:len(t.rstrip())]
        cx0, cx1 = chars[0]["bbox"][0], chars[-1]["bbox"][2]
        o.append(f'<text class="{cls}" x="{R(cx0)}" y="{R(y)}" font-size="{R(s["size"])}" textLength="{R(cx1 - cx0)}" lengthAdjust="spacingAndGlyphs"{red} xml:space="preserve">{esc(t.strip())}</text>')
    return "".join(o)

# ---- overlays -------------------------------------------------------------------
cells = []
def T(k, pg, x, y, w, **kw): cells.append(dict(t="text", k=k, p=pg, x=x, y=y, w=w, **kw))
def B(k, pg, x, y, mode="yes"): cells.append(dict(t="box", k=k, p=pg, x=x, y=y, s=10.8, m=mode))
def M(k, pg, x, y, w, h, **kw): cells.append(dict(t="multi", k=k, p=pg, x=x, y=y, w=w, h=h, **kw))

def find_span(pg, text, y, x=None):
    for s, t in spans(pg):
        if t.strip() == text.strip() and abs(s["origin"][1] - y) < 1.2 and (x is None or abs(s["origin"][0] - x) < 2):
            return s, t
    raise SystemExit(f"span not found: p{pg} {text!r} y={y}")

def C(k, pg, text, y, opts, x=None):
    """Choice printed on the form as static text; the selected option gets circled."""
    s, t = find_span(pg, text, y, x)
    out, pos = [], 0
    for value, sub in opts:
        i = t.index(sub, pos); pos = i + len(sub)
        out.append([value, R(s["chars"][i]["bbox"][0]), R(s["chars"][i + len(sub) - 1]["bbox"][2])])
    cells.append(dict(t="choice", k=k, p=pg, y=R(s["origin"][1]), o=out))

YN = [("Yes", "Yes"), ("No", "No")]
# page 1
T("owner", 0, 446.4, 24.0, 150); T("plant", 0, 446.4, 36.6, 150); T("traveler_type", 0, 93.6, 56.4, 70)
T("due_date", 0, 226.8, 58.6, 110, f="ab", sz=11, c="#ed1c24", d=1)
C("hazardous_service", 0, "Hazardous Service:  Y / N", 24.0, [("Yes", "Y"), ("No", "N")])
C("field_service", 0, "|  Yes / No", 56.6, YN)
T("work_performed", 0, 489.6, 74.4, 88); T("shop_id", 0, 108, 80.8, 92); T("tag_number", 0, 298.8, 80.8, 86)
T("unit_vessel", 0, 489.6, 91.9, 88); T("customer_po", 0, 108, 101.0, 92); T("equip_location", 0, 298.8, 101.0, 86)
T("sap_asset", 0, 489.6, 111.8, 95)
T("manufacturer", 0, 108, 132.0, 108); T("service", 0, 424.8, 132.0, 117)
T("model_number", 0, 108, 146.7, 286); T("serial_number", 0, 424.8, 146.7, 117)
c1 = ["valve_size", "set_pressure", "capacity", "dual_np_capacity", "reqd_code", "temperature", None, "cold_diff_set"]
c2 = ["inlet", "orifice_desg", "body_material", "bonnet_material", "bellows_material", "spring_number", "spring_material", "back_pressure"]
c3 = ["outlet", "orifice_area", "trim_material", "soft_seat_material", "cap_type", "spring_range"]
ys = [175.2, 189.6, 204.0, 218.4, 232.8, 247.2, 261.6, 276.0]
for i, y in enumerate(ys):
    if c1[i]: T(c1[i], 0, 108, y, 112 if c1[i] == "reqd_code" else 70)
    T(c2[i], 0, 302.4, y, 70)
    if i < len(c3): T(c3[i], 0, 489.6, y, 64)
B("restricted_lift", 0, 90.7, 252.0); T("lift", 0, 108, 261.6, 38); T("lift_rl", 0, 153, 261.6, 26)
C("onp_xxxed_out", 0, "Yes   /   No", 312.0, YN)
T("onp_model_number", 0, 104.4, 319.2, 290); T("onp_set_pressure", 0, 104.4, 333.6, 72); T("onp_temperature", 0, 266.2, 337.2, 72)
T("onp_capacity", 0, 406.8, 333.6, 75); T("onp_cdtp", 0, 536.4, 337.2, 54); T("onp_code_stamp", 0, 104.4, 361.3, 92)
T("onp_assembled_by", 0, 341, 361.3, 114); T("onp_bp", 0, 536.4, 361.3, 54)
T("prn_model_number", 0, 276, 382.2, 248); T("prn_set_pressure", 0, 111.6, 403.8, 72); T("prn_temperature", 0, 270, 403.8, 72)
T("prn_capacity", 0, 414, 403.8, 72); T("prn_cdtp", 0, 542, 403.8, 52); T("prn_repaired_by", 0, 113, 418.0, 70)
T("prn_prev_vr_no", 0, 272, 418.0, 70); T("prn_id_no", 0, 416, 418.0, 70); T("prn_bp", 0, 542, 418.0, 52)
T("prn_repair_date", 0, 113, 432.4, 70, d=1); C("prn_vr_stamp", 0, "Yes   /   No", 432.6, YN)
T("pto_company", 0, 527, 451.0, 70); T("pto_date", 0, 527, 464.2, 70, d=1); T("pto_id", 0, 527, 477.4, 70)
C("pto_stamp", 0, "Yes    /    No", 490.4, YN); T("pto_set", 0, 527, 505.3, 70)
T("received_by", 0, 312, 450.4, 68); T("due_date", 0, 111.6, 465.0, 58, d=1); T("date_received", 0, 111.6, 483.0, 70, d=1)
T("work_performed", 0, 111.6, 501.0, 72)
C("set_press_changed", 0, "Yes   /   No", 468.6, YN); C("special_cleaning", 0, "Yes   /   No", 483.0, YN)
C("conversion", 0, "Yes   /   No", 497.4, YN)
C("nameplate_status", 0, "Original / Dup / Miss / Illegible", 511.8, [(v, v) for v in ("Original", "Dup", "Miss", "Illegible")])
C("as_found_condition", 0, "Good  /  Fair  /  Dirty  /  New", 515.4, [(v, v) for v in ("Good", "Fair", "Dirty", "New")])
C("seal_status", 0, "Intact/Broke/Missing", 526.2, [(v, v) for v in ("Intact", "Broke", "Missing")])
C("pretest", 0, "Yes   /   No", 547.8, YN)
T("popped_at", 0, 302, 548.2, 45); T("back_pressure_test", 0, 482, 543.6, 108); T("bellows_test", 0, 112, 565.4, 68)
T("pretest_by", 0, 302, 567.2, 68); T("leak_test", 0, 455, 566.4, 70); T("leak_test_at", 0, 544, 566.4, 48)
lr = []
for v in ("Tight", "BPM", "Moderate", "Excessive"):
    s, t = find_span(0, v, 585.8); lr.append([v, R(s["bbox"][0]), R(s["bbox"][2])])
cells.append(dict(t="choice", k="leak_rate", p=0, y=585.8, o=lr))
T("pretest_comments", 0, 112, 594.2, 282)
T("dis_compression_screw", 0, 114, 632.6, 72); T("dis_upper_ring", 0, 114, 655.6, 72); T("dis_lower_ring", 0, 114, 677.2, 72)
T("dis_inspected_by", 0, 111, 698.1, 90); T("dis_instrument_no", 0, 111, 719.7, 90)
T("dis_as_rec_spring_no", 0, 111.6, 738.6, 92); T("dis_as_rec_spring_range", 0, 136.8, 763.8, 92)
DIMS = ["Nozzle Min", "Noz Seat Step Min", "Bore Dia. Min", "Disc Min Thickness Min", "Disc Inside Step Min",
        "Disc Outside Step Min", "Disc Holder OD Min", "Guide ID Max", "Guide Clearances Max", "Spindle Run Out", "Base Top to Nozz Max"]
slug = lambda s: re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")
dim_y = [628.2, 639.7, 652.0, 664.2, 675.7, 688.0, 699.8, 711.7, 724.0, 736.1, 750.5]
for d, y in zip(DIMS, dim_y):
    for ck, x, w in (("found", 327, 66), ("mfg", 399, 55), ("mach", 460, 52), ("shipped", 518, 60)):
        T(f"cd_{slug(d)}_{ck}", 0, x, R(y - 1.6), w)
# page 2
T("tag_number", 1, 507.6, 22.5, 72); T("shop_id", 1, 507.6, 34.8, 72); T("serial_number", 1, 302.4, 42.3, 118)
for v, x in (("OK To Proceed", 255.6), ("NETR - Replaced", 352.8), ("NETR - Scrapped", 457.2)):
    cells.append(dict(t="box", k="disposition", p=1, x=x, y=50.4, s=10.8, m="eq", v=v))
T("disposition_by", 1, 341, 85.0, 68); T("disposition_date", 1, 442, 85.0, 68, d=1)
B("asm_nozzle_tight", 1, 262.8, 111.6); B("asm_bellows_tight", 1, 374.4, 111.6); B("asm_disc_collar", 1, 471.6, 111.6)
B("asm_bonnet_tight", 1, 262.8, 133.2); B("asm_gaskets_installed", 1, 374.4, 133.2)
B("asm_up_adj_ring_set", 1, 262.8, 154.8, "filled"); T("asm_up_adj_ring_set", 1, 369, 164.2, 68)
C("asm_up_adj_ring_unit", 1, "Turns / Notches / Inches / NA", 164.6, [(v, v) for v in ("Turns", "Notches", "Inches", "NA")])
B("asm_low_adj_ring_set", 1, 262.8, 176.4, "filled"); T("asm_low_adj_ring_set", 1, 369, 185.8, 68)
C("asm_low_adj_ring_unit", 1, "Turns / Notches / NA", 186.2, [(v, v) for v in ("Turns", "Notches", "NA")])
B("asm_overlap_collar", 1, 262.8, 198.0, "filled"); T("asm_overlap_collar", 1, 409, 206.6, 60)
for i in range(6):
    y = R(260.5 + 21.4 * i)
    T(f"pdesc_{i+1}_name", 1, 252, y, 100); T(f"pdesc_{i+1}_number", 1, 359, y, 162); T(f"pdesc_{i+1}_heat", 1, 528, y, 78)
T("torque_wrench_no", 1, 340, 389.0, 62); T("assembled_by", 1, 503, 392.4, 78)
def after_label(pg, text, y):
    s, t = find_span(pg, text, y); i = t.index("_")
    return R(s["chars"][i]["bbox"][0] + 1.5), R(s["chars"][-1]["bbox"][2] - s["chars"][i]["bbox"][0] - 2)
for k, text, y in (("cleaned", "Cleaned  _____________", 409.4), ("machined", "Machined ______________________", 409.4),
                   ("lapped", "Lapped ______________", 423.8), ("instrument_used", "Instrument Used _________________", 423.8),
                   ("painted", "Painted ________________________", 438.2)):
    x, w = after_label(1, text, y); T(k, 1, x, R(y - 1.6), w)
T("test_set_pressure", 1, 374.4, 457.4, 80); T("test_cdtp", 1, 525.6, 457.4, 70); T("test_bp", 1, 374.4, 470.4, 60)
T("suggested_bd", 1, 525.6, 470.4, 70)
C("test_method", 1, "Bench / ALD / H/L / N2 / Live / Inline", 484.8, [(v, v) for v in ("Bench", "ALD", "H/L", "N2", "Live", "Inline")])
C("test_media", 1, "Air  / Water  / Steam  / N2", 499.7, [(v, v) for v in ("Air", "Water", "Steam", "N2")])
T("test_stand_id", 1, 323, 499.0, 82); T("ald_equip_id", 1, 323, 514.6, 82); T("load_cell_no", 1, 489, 513.4, 82)
for k1, k2, yl, yr in (("test1_press", "test1_reseat", 531.6, 530.6), ("test2_press", "test2_reseat", 547.2, 546.3),
                       ("test3_press", "test3_reseat", 562.8, 562.1), ("final_test_press", "final_reseat", 578.4, 577.8)):
    T(k1, 1, 323, R(yl - 1.4), 82); T(k2, 1, 489, R(yr - 1.4), 82)
T("leakage_rate", 1, 323, 592.6, 32); T("leakage_rate_at", 1, 369, 592.6, 36); T("measured_lift", 1, 489, 592.2, 82)
C("bp_test", 1, "Yes / No / NA  @", 604.0, [(v, v) for v in ("Yes", "No", "NA")]); T("bp_test_at", 1, 393.5, 604.0, 16)
T("cust_gauge_cal", 1, 489, 607.9, 82, d=1); T("gauge1_sn", 1, 323, 623.8, 82); T("date_tested", 1, 489, 623.7, 82, d=1)
T("tested_by", 1, 323, 639.4, 82); T("witnessed_by", 1, 489, 639.4, 82)
for i, k in enumerate(["vk_entry", "disassembled", "plate_made", "plate_checked", "vr_stamped", "to_stamped", "valve_tagged", "valve_sealed"]):
    s = sorted([s_ for s_, t_ in spans(1) if t_.startswith("Yes/No/NA")], key=lambda s_: s_["origin"][1])[i]
    C("chk_" + k, 1, "Yes/No/NA ______", s["origin"][1], [(v, v) for v in ("Yes", "No", "NA")])
B("reset_only_xd_plate", 1, 320.4, 651.6); T("final_insp_qc", 1, 419, 660.2, 58); T("packed_by", 1, 534, 660.2, 58)
T("cust_notes", 1, 90, 681.2, 504, f="a", sz=9)
M("comments", 1, 18, 701.5, 576, 34, f="a", sz=9); M("js_comment", 1, 18, 751.5, 500, 22, f="a", sz=9)

# parts details: 4 code brackets per row + the two write-in names
PARTS = ["Body", "Bonnet/Yoke", "Nozzle", "Spring", "Disc", "Disc Holder", "Guide", "Spindle", "Spindle Retainer", "Cap", "Lever",
         "Comp Screw", "Upper ADJ Ring", "Upper Ring Pin", "Lower ADJ Ring", "Lower Ring Pin", "Bolts/Studs/Nuts", "Up Spring Washer",
         "Low Spring Washer", "Gasket Set", "ORing", "MFG Name Plate", "Inlet Condition", "Inlet Flange Face", "Outlet Condition",
         "Out Flange Face", "Bellows", "Bug Vent", "Disc Collar", "Lift Stop", "Overlap Collar", "Lift Washer", "Thrust Bearing",
         "Soft Goods Kit", "Limit Washer"]
rows = sorted([(s, t) for s, t in spans(1) if "[  ][  ][  ][  ]" in t], key=lambda r: r[0]["origin"][1])
assert len(rows) == len(PARTS) + 2, len(rows)
for n, (s, t) in enumerate(rows):
    key = slug(PARTS[n]) if n < len(PARTS) else f"other{n - len(PARTS) + 1}"
    if n < len(PARTS): assert t.startswith(PARTS[n]), (t, PARTS[n])
    opens = [c for c in s["chars"] if c["c"] == "["]; closes = [c for c in s["chars"] if c["c"] == "]"]
    for ck, a, b in zip(("cond", "cond2", "work", "rec"), opens, closes):
        cells.append(dict(t="code", k=f"pd_{key}_{ck}", p=1, x=R((a["bbox"][2] + b["bbox"][0]) / 2), y=R(s["origin"][1])))
    if n >= len(PARTS):
        cells.append(dict(t="text", k=f"pd_{key}_name", p=1, x=R(opens[0]["bbox"][0] - 2.5), y=R(s["origin"][1]), w=96, a="end", blank=".."))

img = doc[0].get_image_rects(doc[0].get_images()[0][0])[0]
logo = dict(x=R(img.x0), y=R(img.y0), w=R(img.width), h=R(img.height))

ts = ["// GENERATED by scripts/generate-valvekeep-form-art.py from docs/reference/VSI Repair Traveler.pdf - do not hand edit.",
      "// Static art (rules, boxes, labels) of the ValveKeep relief valve service traveler, in PDF points (612 x 792),",
      "// plus where each vk_ value is drawn on it.", "",
      "export type VkFormCell =",
      "  | { t: 'text'; k: string; p: number; x: number; y: number; w: number; f?: string; sz?: number; c?: string; d?: number; a?: string; blank?: string }",
      "  | { t: 'multi'; k: string; p: number; x: number; y: number; w: number; h: number; f?: string; sz?: number }",
      "  | { t: 'box'; k: string; p: number; x: number; y: number; s: number; m: string; v?: string }",
      "  | { t: 'choice'; k: string; p: number; y: number; o: Array<[string, number, number]> }",
      "  | { t: 'code'; k: string; p: number; x: number; y: number }", "",
      f"export const VK_FORM_LOGO_BOX = {json.dumps(logo)}", "",
      "export const VK_FORM_ART: string[] = [",
      *[f"  {json.dumps(art(pg), ensure_ascii=False)}," for pg in range(2)], "]", "",
      "export const VK_FORM_CELLS: VkFormCell[] = [",
      *[f"  {json.dumps(c, ensure_ascii=False)}," for c in cells], "]", ""]
open(OUT, "w", encoding="utf-8", newline="\r\n").write("\n".join(ts))
print(f"wrote {OUT}: {len(cells)} cells, art {len(art(0))} + {len(art(1))} chars")
