#!/usr/bin/env python3
"""Generates supabase/seed-itp-traveler-templates.sql

One ITP template per valve type on the old traveler site (traveler.jsvalve.com),
written straight into itp_library_templates as named, NON-default templates
("Traveler - <type>"). Existing templates are never touched (on conflict do nothing).

Field shorthand:  "Label"            text box
                  "Label ?"          yes / no
                  "Label ~"          notes box
                  "Label @"          picture / document upload
                  add " !" at the end to make a field required
                  "Label | A | B"    dropdown
Edit the TYPES section and re-run:  python scripts/generate-traveler-templates.py
"""
import json, re, sys, os

PREFIX = "Traveler - "

def fld(spec, unlock=None):
    spec = spec.strip()
    req = spec.endswith(" !")
    if req: spec = spec[:-2].strip()
    f = {"label": spec, "type": "text", "options": [], "required": req}
    if "|" in spec:
        parts = [p.strip() for p in spec.split("|")]
        f.update(label=parts[0], type="dropdown", options=parts[1:], optionSource="custom")
    elif spec.endswith(" ?"): f.update(label=spec[:-2], type="yes_no")
    elif spec.endswith(" ~"): f.update(label=spec[:-2], type="textarea")
    elif spec.endswith(" @"): f.update(label=spec[:-2], type="picture", maxPhotos=6)
    if unlock: f["_unlock"] = unlock
    return f

def step(sec, area, name, ref, fields=(), photo=None, hold=False, key=None, locked=False):
    return dict(sec=sec, area=area, name=name, ref=ref, key=key, locked=locked, hold=hold, photo=photo,
                fields=[x if isinstance(x, dict) else fld(x) for x in fields])

# ---------- shared blocks ----------
BASIC = ["Type", "Customer", "Purchase Order #", "Customer ID", "Tag #", "Location ID", "Manufacturer",
         "Manufacturer SN", "Figure Number", "Drawing Number", "Size", "Pressure",
         "End Connection | RF | RTJ | THR | SW | WE", "Operator | Handwheel | Gear Op | Bare Stem",
         "Accessories", "Valve Condition | Repairable | Unrepairable", "Junked Reason",
         "Modification Required ?", "Modification Notes ~", "Notes ~"]
STUDS = ["Studs type", "Studs size", "Studs quantity"]
GASKET = ["Gasket type", "Gasket material", "Gasket size"]
PACKING3 = ["Packing type", "Packing dimension", "Packing manufacturer"]
def flange(c=True):
    return ["Thickness of Flange A", "Thickness of Flange B"] + (["Dimension C"] if c else []) + ["Dimensions acceptable ?"]
STEM = ["Stem Diameter A", "Stem Diameter B", "Stem Diameter C", "Stem Diameter D", "Stem pitch",
        "Stem lead | Double | Single", "Threads | Left Hand | Right Hand", "Was stem welded ?",
        "Material used to weld stem"]
BUSH = ["Bushing material", "Bushing OD", "Bushing ID", "Bushing length", "Backseat ID",
        "Is backseat welded in ?", "Packing type", "Packing manufacturer", "Packing dimension", "Packing rounds"]
TORQUE = ["Bolt torque 30%", "Bolt torque 70%", "Bolt torque 100%", "Torque unit | Ft/lbs | In/lbs",
          "Gasket area surface finish"]
PSEAL = ["Plant", "Valve ID", "Pressure seal A", "Pressure seal B", "Pressure seal C", "Pressure seal D",
         "Pressure seal E", "Pressure seal F", "Pressure seal surface finish"]
PSEAL_TORQUE = ["Bonnet bolt torque 30%", "Bonnet bolt torque 70%", "Bonnet bolt torque 100%",
                "Breech bolt torque 100%", "Torque unit | Ft/lbs | In/lbs"]
SEALRING = ["Seal ring type", "Seal ring material", "Seal ring size"]
GLOBE_FIT = ["Globe type | Standard | Non-Return", "Globe material", "Overlay material", "Globe angle",
             "Ring material", "Polish rings ?", "Were new rings made ?"]
DISC_FIT = ["Disc material", "Disc overlay material", "Ring material", "Polish disc ?", "Polish rings ?",
            "Were new rings made ?", "Is clapper nut welded to clapper ?"]
ACT = ["Air actuator break-away torque at 40 PSI | Pass | Fail | N/A"]
def comps(names):
    out = []
    for n in names:
        out += [f"{n} | Reused | Repaired | Replaced", f"{n} repair description"]
    return out
PMI_MAT_CAT = "itp_traveler:pmi_materials"

def mat_part(label):
    """Shared PMI materials lookup dropdown (grows as techs enter new grades)."""
    return {
        "label": label,
        "type": "dropdown",
        "options": [],
        "required": True,
        "optionSource": "lookup",
        "lookupCategory": PMI_MAT_CAT,
        "followUpWhen": "Other",
        "followUpLabel": "Material grade",
    }

def mat_id(parts):
    # Material IDs always required (shared PMI materials dropdown).
    # PMI report upload only when "PMI required?" = Yes.
    return step(
        "receipt",
        "Teardown",
        "Material identification",
        "Material ID",
        [mat_part(p) for p in parts]
        + [
            "PMI required ? !",
            {
                "label": "PMI report",
                "type": "picture",
                "options": [],
                "required": False,
                "maxPhotos": 3,
                "requiredWhenLabel": "PMI required",
                "requiredWhenValue": "Yes",
            },
        ],
    )
GEN_MAT = ["Body material", "Bonnet / cover material", "Stem material", "Closure member material", "Seat / trim material"]

def parts_order_step(sec, area, name, ref, fields=(), sub_reqs=()):
    """Special traveler step id parts_order (Needs parts UI) with optional record fields."""
    return dict(
        _parts=True,
        sec=sec,
        area=area,
        name=name,
        ref=ref,
        key=None,
        locked=False,
        hold=False,
        photo=None,
        fields=[x if isinstance(x, dict) else fld(x) for x in fields],
        subReqs=list(sub_reqs),
    )

def front(mat=GEN_MAT, receive_fields=None, photo=("As-found condition photos", 4, 8), parts=True):
    fields = list(receive_fields) if receive_fields is not None else list(BASIC)
    out = [
        step("receipt", "Teardown", "Receive valve and record basic information", "Basic Info", fields,
             photo=photo),
        mat_id(mat),
        step("disassembly", "Teardown", "Disassemble and clean", "Teardown"),
    ]
    if parts is True:
        out.append("PARTS")
    elif parts:
        out.append(parts)
    return out

# Twinseal incoming: 1 required work-order photo + at least 4 as-received before photos.
TS_RECEIVE = [
    {"label": "Work order", "type": "picture", "options": [], "required": True, "maxPhotos": 1, "id": "wo"},
] + BASIC

# Twinseal: one step for ordering Studs/Slips/Soft Goods and recording bolting details.
TS_PARTS = parts_order_step(
    "inspection",
    "Teardown",
    "Parts and bolting record",
    "Parts Record",
    STUDS + ["Slips part #", "Slips material", "Soft goods part #", "Soft goods material"],
    sub_reqs=["Studs", "Slips", "Soft Goods"],
)

WELD_FIELDS = ["Weld location / description ~", "WPS used", "Filler metal MTR #", "PMI - base metal",
               "PMI - overlay / weld", "PT report @", "Weld documents @"]
def weld_gate(extra=()):
    return [
        step("repair", "Welding", "Welding", "Welding",
             [fld("Was welding performed | No | Yes", unlock={"Yes": ["weld"]})]),
        step("repair", "Welding", "Weld repair record", "Weld Record", list(extra) + WELD_FIELDS,
             key="weld", locked=True),
    ]

def test_block(cavity=False):
    lv = lambda n: [f"{n} test gauge #", f"{n} test pressure", f"{n} test time",
                    f"{n} test result | Pass | Fail", f"{n} test fail reason"]
    s = [
        step("testing", "Testing", "Pressure test", "Test",
             ["Test procedure | API 598 | API 6D", "Test medium | Air | Helium | Nitrogen | Water | Mineral Oil",
              "Is chart required ?", "Chart time", "Chart recorder #"]
             + lv("Low pressure seat") + lv("High pressure seat") + lv("Shell")
             + [fld("Methane test required | No | Yes", unlock={"Yes": ["methane"]}),
                fld("Helium test required | No | Yes", unlock={"Yes": ["helium"]})]
             + ([fld("Cavity relief test required | No | Yes", unlock={"Yes": ["cavity"]})] if cavity else []),
             photo=("Test photos / chart", 0, 6)),
        step("testing", "Testing", "Methane emissions test", "Methane",
             ["Was TVA calibrated prior to testing ?", "Was valve cycled a minimum of 5 times prior to testing ?",
              "Is valve in the mid stroke position ?", "Test gauge serial number", "Test pressure", "Test time",
              "Ambient background reading", "Sample taken from stem", "Sample taken from bonnet",
              "Sample taken from body", "Result | Pass | Fail", "Fail reason"], key="methane", locked=True),
        step("testing", "Testing", "Helium test", "Helium",
             ["Was helium tester calibrated prior to testing ?", "Was valve cycled a minimum of 5 times prior to testing ?",
              "Was valve in the mid stroke position ?", "Are all drafts eliminated from the work piece ?",
              "Test gauge serial number", "Test pressure", "Test time", "Ambient background reading",
              "Sample taken from stem", "Sample taken from bonnet", "Sample taken from body",
              "Result | Pass | Fail", "Fail reason"], key="helium", locked=True),
    ]
    if cavity:
        s.append(step("testing", "Testing", "Cavity relief test", "Cavity Relief",
                      ["MAWP of valve at 100 Deg F", "Pressure valve relieved at on Seat A",
                       "Pressure valve relieved at on Seat B", "Result | Pass | Fail", "Fail reason"],
                      key="cavity", locked=True))
    return s

def back():
    return [
        step("final", "Painting", "Paint, tag and prepare for shipping", "Shipping",
             ["All information filled out on the valve tag ?", "All required documents attached to the QA/QC traveler ?",
              "Proper paint color as required ?", "Paint color", "Adequate paint coverage ?",
              "Valve properly secured in the vertical position ?", "Valve tagged with all of the correct information ?",
              "Flange protectors securely attached ?", "Was acid detecting paint used ?"],
             photo=("After photos", 1, 8)),
        step("final", "Testing", "Final inspection", "Final QC",
             ["All paperwork, documentation and customer requirements complete ?",
              "Does valve contain any visual defects prior to shipping ?",
              "Is the valve complete and ready for delivery to the customer ?", "QA/QC documents @"], hold=True),
    ]

def std(spec_steps, mat=GEN_MAT, cavity=False, weld_extra=()):
    return front(mat) + spec_steps + weld_gate(weld_extra) + test_block(cavity) + back()

I, A = "inspection", "assembly"
T = {}

T["a"] = ("Lubricated Plug Valve", "repair", "Lubricated Plug", std([
    step(I, "Teardown", "Parts and bolting record", "Parts Record",
         ["Grease type | 555 Brown | 654 White | Other", "Other grease"] + STUDS + ["Packing material", "Packing size"]),
    step(I, "Teardown", "Critical dimensions", "Dimensions", flange()),
    step(I, "Fitting", "Component disposition", "Components", comps(["Body", "Top Cap", "Plug", "Packing Gland", "Gear"])),
    step(I, "Fitting", "Plug inspection and fitting", "Plug",
         ["Plug Dimension A", "Plug Dimension B", "Plug Dimension C", "Was plug welded ?", "Was valve lapped ?",
          "Visual defects on the plug ~"]),
    step(A, "Assembly", "Assemble and torque", "Torque", TORQUE)]))

KIT = "Kit type | Standard | Standard Fire Safe | HF | HF Fire Safe | Four Way"
T["b"] = ("Non Lubricated Plug Valve", "repair", "Non Lubricated Plug", std([
    step(I, "Teardown", "Parts and bolting record", "Parts Record",
         [KIT] + STUDS + ["Plug material", "Plug type | Standard Fire Safe | Marathon"]),
    step(I, "Teardown", "Critical dimensions", "Dimensions", flange()),
    step(I, "Fitting", "Component disposition", "Components",
         comps(["Body", "Top Cap", "Plug", "Sleeve A", "Sleeve B", "Thrust Collar", "Adjuster", "Metal Diaphragm", "Diaphragm"])),
    step(A, "Assembly", "Plug fitting and assembly", "Assembly",
         ["Plug Dimension A", "Plug Dimension B", "Top cap fastener torque", "Adjuster fastener torque",
          "Was Loctite applied to top cap fasteners ?", "Was valve put in oven ?", "Oven temp", "Oven duration"]
         + ACT + ["Gasket area surface finish", "Plug surface finish"])]))

T["c"] = ("Orbit Valve", "repair", "ORBIT", std([
    step(I, "Teardown", "Parts and bolting record", "Parts Record", GASKET + STUDS + PACKING3),
    step(I, "Teardown", "Critical dimensions", "Dimensions", flange() + ["Port size | Full | Reduced"]),
    step(I, "Fitting", "Component disposition", "Components",
         comps(["Body", "Bonnet", "Core", "Core Guides", "Seat", "Stem (1 piece)", "Stem (2 piece)", "Guide Pin",
                "Back Seat", "Packing Injector", "Drive Nut", "Drive Nut Bearings"])),
    step(I, "Fitting", "Seat record", "Seat", ["Seat type", "Seat dimension", "Seat pocket dimension"]),
    step(A, "Assembly", "Assemble and torque", "Torque", TORQUE)]))

T["d"] = ("Piston Check", "repair", "Piston Check", std([
    step(I, "Teardown", "Parts and bolting record", "Parts Record",
         GASKET + STUDS + ["Relief valve type", "Relief valve model number", "Relief valve manufacturer"]),
    step(I, "Teardown", "Critical dimensions", "Dimensions", flange()),
    step(I, "Fitting", "Spring record", "Spring",
         ["Does valve have a spring ?", "Spring material", "Diameter of wire", "Number of coils", "End type",
          "Spring ID", "Spring length", "Uncompressed length"]),
    step(A, "Assembly", "Assemble and torque", "Torque", TORQUE)]))

T["f"] = ("Pressure Seal Check Valve", "repair", "Check", std([
    step(I, "Teardown", "Parts and bolting record", "Parts Record", SEALRING + STUDS),
    step(I, "Teardown", "Critical dimensions", "Dimensions", flange()),
    step(I, "Fitting", "Disc and ring fitting", "Fitting", DISC_FIT),
    step(I, "Machine 1", "Pressure seal area", "Pressure Seal", PSEAL),
    step(A, "Assembly", "Assemble and torque", "Torque", PSEAL_TORQUE)]))

T["g"] = ("Pressure Seal Gate Valve", "repair", "Pressure Seal Gate", std([
    step(I, "Teardown", "Parts and bolting record", "Parts Record", SEALRING + STUDS),
    step(I, "Teardown", "Critical dimensions", "Dimensions", flange()),
    step(I, "Machine 1", "Stem dimensions", "Stem", STEM),
    step(I, "Fitting", "Bushing, backseat and packing", "Packing", BUSH),
    step(I, "Fitting", "Wedge and ring fitting", "Fitting",
         ["Wedge type | Solid | Flex | Parallel", "Wedge material", "Overlay material", "Ring material",
          "Polish wedge ?", "Polish rings ?", "Were new rings made ?"]),
    step(I, "Machine 1", "Pressure seal area", "Pressure Seal", PSEAL),
    step(A, "Assembly", "Assemble and torque", "Torque", PSEAL_TORQUE)]))

T["h"] = ("Pressure Seal Globe Valve", "repair", "Pressure Seal Globe", std([
    step(I, "Teardown", "Parts and bolting record", "Parts Record", SEALRING + STUDS),
    step(I, "Teardown", "Critical dimensions", "Dimensions", flange()),
    step(I, "Machine 1", "Stem dimensions", "Stem", STEM),
    step(I, "Fitting", "Bushing, backseat and packing", "Packing", BUSH),
    step(I, "Fitting", "Globe and ring fitting", "Fitting", GLOBE_FIT),
    step(I, "Machine 1", "Pressure seal area", "Pressure Seal", PSEAL),
    step(A, "Assembly", "Assemble and torque", "Torque", PSEAL_TORQUE)]))

# ---- Twinseal: inspection findings unlock the repair routes ----
def part_route(part, key, dims):
    return [
        step("repair", "Welding", f"{part} - weld / overlay", f"{part} Weld", WELD_FIELDS + ["Measurements after weld"],
             key=f"{key}_weld", locked=True),
        step("repair", "Machine 2", f"{part} - final machine", f"{part} Machine", dims, key=f"{key}_mach", locked=True),
    ]
TS_MAT = ["Body", "Body Lining", "Stem", "Lids", "Lid Groove", "Stem Overlay", "Packing Gland", "Packing Area"]

def _slug(s): return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")
def keyed(prefix, steps):
    """Give every field a stable id "<prefix>_<step ref>_<label>". The J-S traveler report print
    (src/lib/jsTravelerReportPrint.ts) binds to these keys, so a step can move without breaking the report."""
    out = []
    for s in steps:
        if not isinstance(s, dict):
            out.append(s); continue
        s = dict(s); seen = {}; fields = []
        for f in s["fields"]:
            f = dict(f)
            if not f.get("id"):
                k = f"{prefix}_{_slug(s['ref'])}_{_slug(f['label'])}"
                seen[k] = seen.get(k, 0) + 1
                f["id"] = k if seen[k] == 1 else f"{k}_{seen[k]}"
            fields.append(f)
        s["fields"] = fields; out.append(s)
    return out

# Twinseal QA / shipping / final questions, worded as on the current J-S QA/QC traveler report.
TS_TEST_QA = step("testing", "Testing", "Test area QA check", "Test QA", [
    "Is valve properly stamped with work order and serial number ?",
    "Is the repair month and year stamped on the flange ?",
    "Is the information on the QA/QC card correct and filled out completely ?",
    "If exotic material valve, was PMI done and is it attached to the traveler ?",
    "If dye penetrant, heat treat, or other NDE was performed, are the results attached to the traveler ?",
    "Does bolting have no more than 2-4 threads sticking out of each side ?",
    "Is the proper bolting used for the valve ?",
    "Does the valve operate smoothly ?",
    "Does valve operate in accordance with JS specs ?",
    "Did valve pass testing and was it documented on the test log ?",
    "Is valve in accordance with the customer requirements on the work order ?",
    "Were bolts torqued after testing ?"])
TS_BACK = [
    step("final", "Painting", "Paint, tag and prepare for shipping", "Shipping", [
        "Did all information come over with valve including QA/QC traveler, PMI, etc. ?",
        "Is the valve tagged with all of the correct information for the valve ?",
        "Are flange protectors securely attached to the valve ?",
        "Does valve have adequate paint coverage and all necessary parts taped off ?",
        "Was acid detecting paint used ?",
        "Is valve secured and banded for shipping ?",
        "Paint color", "Paint coverage (mils)"],
        photo=("After photos", 1, 8)),
    step("final", "Testing", "Final inspection", "Final QC", [
        "Are all paperwork requirements, documentation requirements, and customer requirements completed ?",
        "Does valve contain any visual defects prior to shipping ?",
        "Is the valve complete and ready for delivery to the customer ?", "QA/QC documents @"], hold=True),
]

T["i"] = ("Twinseal", "repair", "Twinseal", keyed("jt",
    front(TS_MAT, receive_fields=TS_RECEIVE, photo=("Before photos", 4, 8), parts=TS_PARTS) + [
    step(I, "Incoming Inspection", "Body inspection (after blast)", "Body Insp.",
         ["Is valve body free of defects ?", "What defects are found ~",
          "Thickness of Flange A", "Thickness of Flange B", "Dimension C",
          fld("Flanges | Good | Need facing", unlock={"Need facing": ["ts_face"]}),
          "Diameter of body bore",
          fld("Body bore / lining | Good | Bad", unlock={"Bad": ["ts_asfound", "ts_m1", "ts_weld", "ts_m2", "ts_grind"]}),
          "Other body findings ~"], photo=("Body photos after blast", 0, 6)),
    step("repair", "Machine 1", "Face end flanges", "Face Flanges",
         ["As-found thickness A", "As-found thickness B", "B16.5 minimum thickness", "Allowable removal",
          "Final thickness A", "Final thickness B"], key="ts_face", locked=True),
    step(I, "Incoming Inspection", "Body bore - as-found measurements", "Bore As-Found",
         ["As-found bore measurements ~"], key="ts_asfound", locked=True),
    step("repair", "Machine 1", "Body bore - pre-machine (remove coating)", "Pre-Machine",
         ["Pre-bore measurements ~"], key="ts_m1", locked=True),
    step("repair", "Welding", "Body bore - weld overlay", "Bore Weld",
         ["WPS used", "Filler metal MTR #", "PMI - base metal", "PMI - overlay", "PT report @",
          "Measurements after weld ~"], key="ts_weld", locked=True),
    step("repair", "Machine 2", "Body bore - final machine (.005-.010 from final)", "Machine 2",
         ["Machine 2 dimensions ~"], key="ts_m2", locked=True),
    step("repair", "Grinding", "Body bore - grind to final dimension", "Grind",
         ["Final body bore dimension"], key="ts_grind", locked=True),
    step(I, "Incoming Inspection", "Lids inspection", "Lids",
         ["A of top lid", "B of top lid", "C of top lid", "Top O-ring groove width",
          "A of bottom lid", "B of bottom lid", "C of bottom lid", "Bottom O-ring groove width",
          fld("Lids | Good | Need weld repair", unlock={"Need weld repair": ["lid_weld", "lid_mach"]})]),
    ] + part_route("Lids", "lid", ["Final A / B / C top lid", "Final top groove width",
                                   "Final A / B / C bottom lid", "Final bottom groove width"]) + [
    step(I, "Incoming Inspection", "Packing area and trunnion inspection", "Packing Area",
         ["Packing area ID", "Packing area depth", "Dimension A", "Dimension B", "Dimension C", "Dimension D",
          fld("Packing area | Good | Need weld repair", unlock={"Need weld repair": ["pk_weld", "pk_mach"]}),
          "Was new packing gland used ?",
          fld("Drive pin hole | Acceptable | Re-drill", unlock={"Re-drill": ["ts_pin"]}),
          "Trunnion finish | CI/ENP | CS/ENP | CI/309 | CS/309",
          fld("Trunnion | Good | Need weld repair", unlock={"Need weld repair": ["tr_weld", "tr_mach"]})]),
    ] + part_route("Packing area", "pk", ["Final packing area ID", "Final packing area depth"])
      + part_route("Trunnion", "tr", ["Final trunnion dimensions"]) + [
    step("repair", "Machine 1", "Re-drill drive pin hole", "Drive Pin", ["New drive pin hole size"], key="ts_pin", locked=True),
    step(I, "Fitting", "Slips", "Slips",
         [fld("Slips | Good | Rebond | Replace", unlock={"Rebond": ["ts_rebond"]}), "Slips notes ~"]),
    step("repair", "Fitting", "Rebond slips", "Rebond", ["Rebond material", "Rebond notes ~"], key="ts_rebond", locked=True),
    step("repair", "Machine 1", "DTR drilling", "DTR",
         [fld("DTR system | Existing OK | Drill new", unlock={}), "Are DTR holes drilled ?",
          "Are DTR holes in both ports ?", "Body DTR hole size", "Port DTR hole size"]),
    step(A, "Assembly", "Assemble and torque", "Torque", TORQUE),
    ] + test_block(cavity=True) + [TS_TEST_QA] + TS_BACK))

LETTER = "| Std | A | B | C | D | E"
T["j"] = ("Pipeline Gate", "repair", "Pipeline Gate", std([
    step(I, "Teardown", "Parts and bolting record", "Parts Record", GASKET + STUDS),
    step(I, "Teardown", "Critical dimensions", "Dimensions", flange()),
    step(I, "Machine 1", "Stem", "Stem",
         STEM + ["Was new stem made ?", "Stem material MTR number", "Stem | 1 pc | 2 pc",
                 "Does the valve have a packing pusher ?", "Does the valve have a stop collar ?", "Collar length"]),
    step(I, "Fitting", "Packing", "Packing",
         ["Injectable packing type", "Packing bushing OD", "Packing bushing ID", "Packing bushing length",
          "Filler packing type", "Filler packing manufacturer", "Filler packing dimension", "Filler packing rounds"]),
    step(I, "Grinding", "Slab / gate", "Slab",
         ["Gate type | Slab | Expanding Gate", "Slab thickness", "Slab ground ?", "Slab plated ?", "Plating material",
          "Slab final surface finish", "Slab | Repaired | Replaced", "As-found slab thickness",
          "Slab thickness after grind", "Slab thickness after ENP", "Slab letter designation " + LETTER,
          "Slab material MTR number (if replaced)"]),
    step(I, "Machine 1", "Rings and O-rings", "Rings",
         ["Were new rings made ?", "Ring OD", "Ring ID", "Ring length", "Ring material",
          "As-received ring overall length", "Ring | Repaired | Replaced", "Ring overall length",
          "Ring letter designation " + LETTER, "Ring material MTR number (if replaced)",
          "O-ring material used", "O-ring size", "O-ring durometer"]),
    step(I, "Machine 1", "Seats and seat pockets", "Seats",
         ["Were new seats made ?", "Seat material OD", "Seat material ID", "Seat material used", "Seat material MTR",
          "Seat pocket A", "Seat pocket A welded ?", "Pocket A as-found OD", "Pocket A repaired OD", "Pocket A depth",
          "Pocket A spring landing to back of pocket",
          "Seat pocket B", "Pocket B as-found OD", "Pocket B repaired OD", "Pocket B depth",
          "Pocket B spring landing to back of pocket", "Pocket to pocket spring landing"]),
    step(A, "Assembly", "Assemble and torque", "Torque", TORQUE)], cavity=True))

T["k"] = ("Angle Globe Valve", "repair", "Angle Globe", std([
    step(I, "Teardown", "Parts and bolting record", "Parts Record", GASKET + STUDS),
    step(I, "Teardown", "Critical dimensions", "Dimensions",
         flange(c=False) + ["Does valve have a bypass ?", "Size of bypass"]),
    step(I, "Machine 1", "Stem dimensions", "Stem", STEM),
    step(I, "Fitting", "Bushing, backseat and packing", "Packing", BUSH),
    step(I, "Fitting", "Globe and ring fitting", "Fitting", GLOBE_FIT),
    step(A, "Assembly", "Assemble", "Assembly")]))

T["l"] = ("Check Valve", "repair", "Check", std([
    step(I, "Teardown", "Parts and bolting record", "Parts Record", GASKET + STUDS),
    step(I, "Teardown", "Critical dimensions", "Dimensions", flange()),
    step(I, "Fitting", "Disc and ring fitting", "Fitting", DISC_FIT),
    step(A, "Assembly", "Assemble and torque", "Torque", TORQUE)]))

T["m"] = ("Gate Valve", "repair", "Gate", std([
    step(I, "Teardown", "Parts and bolting record", "Parts Record", GASKET + STUDS),
    step(I, "Teardown", "Critical dimensions", "Dimensions", flange()),
    step(I, "Machine 1", "Stem dimensions", "Stem", STEM),
    step(I, "Fitting", "Bushing, backseat and packing", "Packing", BUSH),
    step(I, "Fitting", "Wedge and ring fitting", "Fitting",
         ["Wedge type | Solid | Flex", "Wedge material", "Overlay material", "Ring material", "Polish wedge ?",
          "Polish rings ?", "Were new rings made ?"]),
    step(A, "Assembly", "Assemble and torque", "Torque", ACT + TORQUE)]))

T["n"] = ("Globe Valve", "repair", "Globe", std([
    step(I, "Teardown", "Parts and bolting record", "Parts Record", GASKET + STUDS),
    step(I, "Teardown", "Critical dimensions", "Dimensions", flange()),
    step(I, "Machine 1", "Stem dimensions", "Stem", STEM),
    step(I, "Fitting", "Bushing, backseat and packing", "Packing", BUSH),
    step(I, "Fitting", "Globe and ring fitting", "Fitting", GLOBE_FIT),
    step(A, "Assembly", "Assemble and torque", "Torque", TORQUE)]))

T["o"] = ("Ball Valve", "repair", "Ball Valve", std([
    step(I, "Teardown", "Parts and bolting record", "Parts Record", GASKET + STUDS + PACKING3),
    step(I, "Teardown", "Critical dimensions", "Dimensions",
         flange() + ["Does stem have O-ring grooves ?", "Stem O-ring dimensions"]),
    step(I, "Grinding", "Ball", "Ball",
         ["Ball type | Floating | Trunnion", "Ball radius", "Ball ground ?", "Ball plated ?", "Plating material"]),
    step(I, "Machine 1", "Rings and seats", "Rings / Seats",
         ["Ring material", "Were new rings made ?", "Ring OD", "Ring ID", "Ring length",
          "Seat material", "Were new seats made ?", "Seat OD", "Seat ID",
          "Does ring contain springs ?", "Number of springs", "Spring length", "Spring diameter", "Spring material"]),
    step(I, "Machine 1", "Seat pockets", "Pockets",
         ["Pocket A - was O-ring groove weld repaired ?", "Pocket A depth",
          "Pocket B - was O-ring groove weld repaired ?", "Pocket B depth"]),
    step(A, "Assembly", "Assemble", "Assembly")], cavity=True))

T["p"] = ("Wedge Plug", "repair", "Wedgeplug", std([
    step(I, "Teardown", "Parts and bolting record", "Parts Record", STUDS + PACKING3),
    step(I, "Teardown", "Critical dimensions", "Dimensions", flange()),
    step(I, "Fitting", "Component disposition", "Components",
         comps(["Body", "Bonnet", "Plug", "Packing Gland", "Inner Gear Assembly"])),
    step(I, "Fitting", "Plug inspection and fitting", "Plug",
         ["Plug Dimension A", "Plug taper", "Plug hardness", "Was plug welded ?", "Was valve lapped ?",
          "Visual defects on the plug ~"]),
    step(A, "Assembly", "Assemble and torque", "Torque", TORQUE)]))

def tq5(name): return [f"{name} torque {p}%" for p in (20, 40, 60, 80, 100)]
def ring(x): return [f"Ring {x} material", f"Was ring {x} replaced ?", f"Ring {x} OD", f"Ring {x} ID", f"Ring {x} length"]
def seat(x): return [f"Does seat {x} contain bellows ?", f"Seat {x} bellows lapped ?", f"Seat {x} OD", f"Seat {x} ID", f"Seat {x} length"]
def pocket(x): return [f"Was pocket {x} weld repaired ?", f"Pocket {x} OD", f"Pocket {x} depth"]
T["q"] = ("Delayed Coker - Isolation Ball Valve", "repair", "Delayed Coker Isolation Ball", std([
    step(I, "Teardown", "Parts and bolting record", "Parts Record", GASKET + STUDS + PACKING3),
    step(I, "Teardown", "Critical dimensions", "Dimensions", flange() + ["Body gap before", "Body gap after"]),
    step(I, "Grinding", "Ball", "Ball",
         ["Ball | Reused | Replaced", "Ball diameter (before lapping)", "Ball diameter (after lapping)",
          "Ball welded ?", "Ball ground ?", "Ball lapped to seats ?", "Ball plated ?", "Plating material"]),
    step(I, "Machine 1", "Rings and seats", "Rings / Seats", ring("A") + ring("B") + seat("A") + seat("B")),
    step(I, "Machine 1", "Seat pockets", "Pockets", pocket("A") + pocket("B")),
    step(A, "Assembly", "Assemble and torque", "Torque",
         tq5("Body end") + tq5("Stem bushing") + tq5("Bracket / body bolting") + tq5("Packing gland")
         + tq5("Bracket / actuator bolting"))],
    weld_extra=["Purging - label each purge with color, size and flange position ~"]))

# ---- Relief valves ----
PRV_BASIC = ["Customer", "Purchase Order #", "Customer ID", "Tag #", "Location ID", "Manufacturer", "Manufacturer SN",
             "Shop #", "Model #", "Set Pressure", "Capacity", "Capacity unit | PPH | SCFM | GPM",
             "Media | Air | Liquid | Steam | Other", "CODE", "CDTP", "Back Pressure", "Inlet Size", "Inlet Pressure",
             "Inlet Connection | RTJ | RF | THR | WE", "Outlet Size", "Outlet Pressure",
             "Outlet Connection | RF | RTJ | THR | SW", "Equipment Protected", "Date Received",
             "Work Requested | Pretest | Pretest with Repair | Spring Change | Set Pressure Change",
             "Ship To | Plant Delivery | Stock", "Orifice Type", "Bellows", "Pilot Valve ?", "Cap Type",
             "EPA Monitoring Device ?", "EPA device model #", "ASME Code | UV | V | NA",
             "Is previously repaired ?", "Previous repair shop", "Previous VR #", "Previous repair date", "Notes ~"]
RECEIPT_INSP = ["Nameplate legible ?", "Repair nameplate ?", "Inlet clear ?", "Inlet clear notes",
                "Outlet clear ?", "Outlet clear notes", "Seals intact ?", "Visible damage ?"]
def pops(): return ["Pop test 1", "Reseat pressure 1", "Pop test 2", "Reseat pressure 2", "Pop test 3", "Reseat pressure 3"]
def oem(names):
    out = []
    for n in names: out += [f"{n} - OEM", f"{n} - As found"]
    return out
T["r"] = ("Relief Valve - VR", "repair", "Relief Valve", [
    step("receipt", "PRV Teardown", "Receive valve and record original nameplate", "Nameplate", PRV_BASIC,
         photo=("As-found condition photos", 4, 8)),
    step("receipt", "PRV Teardown", "Preliminary (pre) test", "Pre-Test",
         RECEIPT_INSP + ["Valve disassembled ?", "Broken spring ?",
          "Reason for test | Customer Request | Valve Leaking | Valve Stuck | Valve Chattering | Valve has Broken Spring | Other",
          "Other reason", "Notes pre-test inspection ~"] + pops()
         + ["Test media | Air | Water | Nitrogen | Steam | Other", "Leak pressure", "Set pressure", "Valve CDTP pressure",
            "Average pop", "No pop results | Leaked too bad to pop | Stuck (Max Pressure)", "Max pressure used",
            "Seat tight after retest ?", "Test result | Pass | Fail"], photo=("Pre-test photos", 0, 6)),
    step("disassembly", "PRV Teardown", "Disassembly", "Disassembly"),
    step("disassembly", "PRV Teardown", "Cleaning", "Cleaning"),
    "PARTS",
    step(I, "PRV Teardown", "Critical inspection - nozzle", "Nozzle",
         oem(["Bore", "Overall height", "Seat inside step", "Seat outside step", "Seat inside diameter",
              "Seat outside diameter", "Nozzle minimum"])),
    step(I, "PRV Teardown", "Critical inspection - disc, spring and guide", "Disc / Spring",
         oem(["Disc thickness", "Disc seat inside step", "Disc seat outside step", "Disc seat inside diameter",
              "Disc seat outside diameter", "Concentricity", "Squareness", "Footprint", "Spring number",
              "Spring range", "Guide ID", "Holder OD"]) + ["QA/QC documents @"], hold=True),
    step("repair", "Machine 1", "Machining verified", "Machining"),
    step("repair", "PRV Assembly", "Part replacement", "Parts"),
    step("repair", "PRV Assembly", "Lapping / grinding", "Lapping"),
    step(A, "PRV Assembly", "Reassembly", "Reassembly"),
    step("testing", "Testing", "Setting and testing", "Set / Test",
         ["Test type | Air/Gas | Liquid | Steam", "Gauge #", "Calibration date", "Valve CDTP",
          "Valve tightness | Pass | Fail", "Back pressure test | Pass | Fail", "BP test pressure"] + pops()
         + ["Average", "Result | Pass | Fail", "Fail reason"], photo=("Test photos", 0, 6)),
    step("final", "Testing", "Locking and sealing", "Seal"),
    step("final", "Testing", "Repair nameplate and VR stamp applied", "VR Stamp",
         ["VR stamp", "SET", "CDTP", "CAP", "BP", "MODEL", "DATE", "JOB #"], photo=("Nameplate photo", 0, 4)),
] + back())

T["s"] = ("Relief Valve - TO", "testonly", "Relief Valve", [
    step("receipt", "PRV Teardown", "Receive valve and record nameplate", "Nameplate", PRV_BASIC,
         photo=("As-found condition photos", 4, 8)),
    step("receipt", "PRV Teardown", "Receipt inspection", "Receipt Insp.", RECEIPT_INSP + ["Notes receipt inspection ~"]),
    step("testing", "Testing", "Test", "Test",
         ["Test gauge number", "Calibration due date", "Test fluid | Steam | Air/Gas | Liquid", "Units | PSI | kPa | Bar",
          "First pop", "Second pop", "Third pop", "Average set pressure", "Seat tightness method | OEM | API | JS", "JS#",
          "Test result | TESTED GOOD | MINOR ADJUSTMENT | REPAIRED | REPLACED | FAILED NEEDS REPAIR", "Remarks ~"],
         photo=("Test photos", 0, 6)),
    step("final", "Testing", "External adjustment sealed", "Seal"),
    step("final", "Testing", "NBIC T/O applied", "T/O", ["T/O applied ?"], hold=True),
])

# ---- Relief valve, ValveKeep (VSI) service traveler form ----
# Field ids carry a stable "vk_<cell>" key: one per cell on the ValveKeep form. Only vk_ fields are
# ValveKeep data (print + future migration). J-S additions that are not on the form use "js_<name>" ids.
def vk(key, spec, jc="none"):
    f = fld(spec)
    f["id"] = "vk_" + key
    f["jobCardField"] = jc
    return f
def jspic(key, label, n=6, when_label=None, when_value=None):
    f = {"id": "js_" + key, "label": label, "type": "picture", "options": [], "required": False, "maxPhotos": n}
    if when_label and when_value:
        f["requiredWhenLabel"] = when_label
        f["requiredWhenValue"] = when_value
    return f
def slug(s): return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")
VK_COND = ["A- Good", "B- Bent", "C- Broken", "D- Stm Cut", "E- Cracked", "F- Collapsed", "G- Corroded Mild",
           "H- Corroded Severe", "I- Deposits Light", "J- Deposits Heavy", "K- Eroded", "L- Galled", "M- Incorrect",
           "N- NonOEM", "O- Missing", "P- Out Of Tolerance", "Q- Pitted", "R- Plugged", "S- Poor", "T- Worn",
           "U- Scored", "V- Leaks", "W- Req's Replacing", "Y- Seized", "e- Threads Stripped"]
VK_WORK = ["0- Cleaned", "1- Replaced", "2- Machined/Lapped", "3- Machined", "4- Lapped", "5- Polish", "6- Left",
           "7- Repaired"]
VK_REC = ["[- Replace Next Repair", "]- NDT/NDE Next Repair", "#- Replace ASAP", "*- Machine NOH"]
VK_PARTS = ["Body", "Bonnet/Yoke", "Nozzle", "Spring", "Disc", "Disc Holder", "Guide", "Spindle", "Spindle Retainer",
            "Cap", "Lever", "Comp Screw", "Upper ADJ Ring", "Upper Ring Pin", "Lower ADJ Ring", "Lower Ring Pin",
            "Bolts/Studs/Nuts", "Up Spring Washer", "Low Spring Washer", "Gasket Set", "ORing", "MFG Name Plate",
            "Inlet Condition", "Inlet Flange Face", "Outlet Condition", "Out Flange Face", "Bellows", "Bug Vent",
            "Disc Collar", "Lift Stop", "Overlap Collar", "Lift Washer", "Thrust Bearing", "Soft Goods Kit",
            "Limit Washer"]
VK_DIMS = ["Nozzle Min", "Noz Seat Step Min", "Bore Dia. Min", "Disc Min Thickness Min", "Disc Inside Step Min",
           "Disc Outside Step Min", "Disc Holder OD Min", "Guide ID Max", "Guide Clearances Max", "Spindle Run Out",
           "Base Top to Nozz Max"]
def dd(opts): return " | " + " | ".join(opts)
def vk_part_rows():
    out = []
    rows = [(slug(p), p) for p in VK_PARTS] + [("other1", "Other part 1"), ("other2", "Other part 2")]
    for k, p in rows:
        if k.startswith("other"): out.append(vk(f"pd_{k}_name", f"{p} - name"))
        work_label = f"{p} - work"
        out += [vk(f"pd_{k}_cond", f"{p} - condition" + dd(VK_COND)),
                vk(f"pd_{k}_cond2", f"{p} - condition 2" + dd(VK_COND)),
                vk(f"pd_{k}_work", work_label + dd(VK_WORK)),
                vk(f"pd_{k}_rec", f"{p} - recommendation" + dd(VK_REC)),
                jspic(f"pd_{k}_found", f"{p} - as-found photo", 6, work_label, "1- Replaced"),
                jspic(f"pd_{k}_left", f"{p} - as-left photo", 6, work_label, "1- Replaced")]
    return out
def vk_dim_rows():
    out = []
    for d in VK_DIMS:
        for ck, cl in (("found", "As Found"), ("mfg", "Mfg"), ("mach", "Mach. By"), ("shipped", "As Shipped")):
            out.append(vk(f"cd_{slug(d)}_{ck}", f"{d} - {cl}"))
    return out
def vk_pdesc_rows(n=6):
    out = []
    for i in range(1, n + 1):
        out += [vk(f"pdesc_{i}_name", f"Part {i} - name"), vk(f"pdesc_{i}_number", f"Part {i} - part number"),
                vk(f"pdesc_{i}_heat", f"Part {i} - heat #")]
    return out
YNA = " | Yes | No | NA"
T["u"] = ("Relief Valve (ValveKeep form)", "repair", "Relief Valve", [
    step("receipt", "PRV Teardown", "Receive valve and record basic information", "Basic Info", [
        vk("owner", "Owner", "customer"), vk("plant", "Plant"), vk("traveler_type", "Traveler Type"),
        vk("hazardous_service", "Hazardous Service ?"), vk("field_service", "Field Service ?"),
        vk("shop_id", "JS Shop ID", "valve_id"), vk("customer_po", "Customer PO", "po_number"),
        vk("tag_number", "Tag Number"), vk("equip_location", "Equip. Location"),
        vk("work_performed", "Work Performed"), vk("unit_vessel", "Unit / Vessel"), vk("sap_asset", "SAP / Asset"),
        vk("due_date", "Due Date", "due_date"), vk("date_received", "Date Received"), vk("received_by", "Received By"),
        vk("as_found_condition", "As Found Condition | Good | Fair | Dirty | New"),
        vk("set_press_changed", "Set Press Changed ?"), vk("special_cleaning", "Special Cleaning ?"),
        vk("conversion", "Conversion ?"), vk("nameplate_status", "Nameplate | Original | Dup | Miss | Illegible"),
        vk("seal_status", "Seal | Intact | Broke | Missing")],
        photo=("As-found condition photos", 4, 8)),
    step("receipt", "PRV Teardown", "Record valve data plates", "Data Plates", [
        vk("manufacturer", "Manufacturer", "manufacturer"), vk("service", "Service"),
        vk("model_number", "Model Number"), vk("serial_number", "S/N"), vk("valve_size", "Valve Size"),
        vk("set_pressure", "Set Pressure"), vk("capacity", "Capacity"), vk("dual_np_capacity", "Dual NP Capacity"),
        vk("reqd_code", "Req'd Code"), vk("temperature", "Temperature"), vk("restricted_lift", "Restricted lift (RL) ?"),
        vk("lift", "Lift"), vk("lift_rl", "RL"), vk("cold_diff_set", "Cold Diff Set"), vk("inlet", "Inlet"),
        vk("orifice_desg", "Orifice Desg."), vk("body_material", "Body Material"),
        vk("bonnet_material", "Bonnet Material"), vk("bellows_material", "Bellows Material"),
        vk("spring_number", "Spring Number"), vk("spring_material", "Spring Material"),
        vk("back_pressure", "Back Pressure"), vk("outlet", "Outlet"), vk("orifice_area", "Orifice Area"),
        vk("trim_material", "Trim Material"), vk("soft_seat_material", "Soft Seat Material"),
        vk("cap_type", "Cap Type"), vk("spring_range", "Spring range (From / To)"),
        vk("onp_xxxed_out", "Original nameplate - XXX'ed out ?"), vk("onp_model_number", "Original nameplate - Model Number"),
        vk("onp_set_pressure", "Original nameplate - Set Pressure"), vk("onp_temperature", "Original nameplate - Temperature"),
        vk("onp_capacity", "Original nameplate - Capacity"), vk("onp_cdtp", "Original nameplate - CDTP"),
        vk("onp_code_stamp", "Original nameplate - Code Stamp"),
        vk("onp_assembled_by", "Original nameplate - Assembled By & Date/Code"), vk("onp_bp", "Original nameplate - BP"),
        vk("prn_model_number", "Previous repair nameplate - Model Number"),
        vk("prn_set_pressure", "Previous repair nameplate - Set Pressure"),
        vk("prn_temperature", "Previous repair nameplate - Temperature"),
        vk("prn_capacity", "Previous repair nameplate - Capacity"), vk("prn_cdtp", "Previous repair nameplate - CDTP"),
        vk("prn_repaired_by", "Previous repair nameplate - Repaired By"),
        vk("prn_prev_vr_no", "Previous repair nameplate - Prev VR #"), vk("prn_id_no", "Previous repair nameplate - I.D.#"),
        vk("prn_bp", "Previous repair nameplate - BP"), vk("prn_repair_date", "Previous repair nameplate - Prev Repair Date"),
        vk("prn_vr_stamp", "Previous repair nameplate - Prev VR Stamp ?"),
        vk("pto_company", "Previous test only plate - PTO Company"), vk("pto_date", "Previous test only plate - PTO Date"),
        vk("pto_id", "Previous test only plate - PTO ID#"), vk("pto_stamp", "Previous test only plate - Prev T/O Stamp ?"),
        vk("pto_set", "Previous test only plate - Prev T/O Set")],
        photo=("Nameplate photos", 1, 4)),
    step("receipt", "PRV Teardown", "Pre-test", "Pre-Test", [
        vk("pretest", "Pretest ?"), vk("popped_at", "Popped @ (PSIG)"), vk("back_pressure_test", "Back Pressure Test"),
        vk("bellows_test", "Bellows Test"), vk("pretest_by", "Pretest By"), vk("leak_test", "Leak Test"),
        vk("leak_test_at", "Leak Test at"), vk("leak_rate", "Leak rate | Tight | BPM | Moderate | Excessive"),
        vk("pretest_comments", "Pretest Comments ~")], hold=True),
    step("disassembly", "PRV Teardown", "Disassemble and clean", "Teardown", [
        vk("dis_compression_screw", "Compression Screw"), vk("dis_upper_ring", "Upper Ring"),
        vk("dis_lower_ring", "Lower Ring"), vk("dis_inspected_by", "Inspected By"),
        vk("dis_instrument_no", "Instrument #"), vk("dis_as_rec_spring_no", "As Rec - Spring #"),
        vk("dis_as_rec_spring_range", "As Rec - Spring Range")],
        photo=("Before-disassembly photos", 0, 8)),
    step(I, "PRV Teardown", "Parts inspection", "Parts", [
        vk("disposition", "Disposition | OK To Proceed | NETR - Replaced | NETR - Scrapped"),
        vk("disposition_by", "Disposition by"), vk("disposition_date", "Disposition date")]
        + vk_part_rows()),
    "PARTS",
    step(I, "PRV Teardown", "Critical dimensions", "Dimensions", vk_dim_rows()),
    step("repair", "Machine 1", "Machine and lap", "Machining", [
        vk("cleaned", "Cleaned"), vk("machined", "Machined"), vk("lapped", "Lapped"),
        vk("instrument_used", "Instrument Used")]),
    step(A, "PRV Assembly", "Assemble", "Assembly", [
        vk("asm_nozzle_tight", "Nozzle Tight ?"), vk("asm_bellows_tight", "Bellows Tight" + YNA),
        vk("asm_disc_collar", "Disc Collar -2" + YNA), vk("asm_bonnet_tight", "Bonnet Tight ?"),
        vk("asm_gaskets_installed", "Required Gaskets Installed ?"), vk("asm_up_adj_ring_set", "Up Adj. Ring - Set"),
        vk("asm_up_adj_ring_unit", "Up Adj. Ring unit | Turns | Notches | Inches | NA"),
        vk("asm_low_adj_ring_set", "Low Adj. Ring Set"),
        vk("asm_low_adj_ring_unit", "Low Adj. Ring unit | Turns | Notches | NA"),
        vk("asm_overlap_collar", "Overlap Collar Set & Sealed")]
        + vk_pdesc_rows()
        + [vk("torque_wrench_no", "Torque Wrench #"), vk("assembled_by", "Assembled By")]),
    step("testing", "Testing", "Set and test", "Set / Test", [
        vk("test_set_pressure", "Set Pressure"), vk("test_cdtp", "CDTP"), vk("test_bp", "BP"),
        vk("suggested_bd", "Suggested BD"), vk("test_method", "Test Method | Bench | ALD | H/L | N2 | Live | Inline"),
        vk("test_stand_id", "Test Stand ID"), vk("test_media", "Test Media | Air | Water | Steam | N2"),
        vk("ald_equip_id", "ALD Equip ID"), vk("load_cell_no", "Load Cell #"),
        vk("test1_press", "1st Test Press"), vk("test1_reseat", "1st Reseat Pressure"),
        vk("test2_press", "2nd Test Press"), vk("test2_reseat", "2nd Reseat Pressure"),
        vk("test3_press", "3rd Test Press"), vk("test3_reseat", "3rd Reseat Pressure"),
        vk("final_test_press", "Final Test Pressure"), vk("final_reseat", "Final Reseat Pressure"),
        vk("leakage_rate", "Leakage Rate"), vk("leakage_rate_at", "Leakage Rate at"),
        vk("measured_lift", "Measured Lift"), vk("bp_test", "BP Test" + YNA), vk("bp_test_at", "BP Test at"),
        vk("cust_gauge_cal", "Cust Gauge Cal"), vk("gauge1_sn", "Gauge 1 S/N"), vk("date_tested", "Date Tested"),
        vk("tested_by", "Tested By"), vk("witnessed_by", "Witnessed By")],
        photo=("Test photos", 0, 6), hold=True),
    step("final", "Testing", "Seal, tag and stamp", "Seal / Stamp", [
        vk("chk_vk_entry", "VK Entry" + YNA), vk("chk_disassembled", "Disassembled" + YNA),
        vk("chk_plate_made", "Plate Made" + YNA), vk("chk_plate_checked", "Plate Checked" + YNA),
        vk("chk_vr_stamped", "VR Stamped" + YNA), vk("chk_to_stamped", "T/O Stamped" + YNA),
        vk("chk_valve_tagged", "Valve Tagged" + YNA), vk("chk_valve_sealed", "Valve Sealed" + YNA),
        vk("reset_only_xd_plate", "Reset Only: X'd MFG Plate ?")],
        photo=("Repair nameplate photo", 0, 4)),
    step("final", "Painting", "Paint and prepare for shipping", "Shipping", [
        vk("painted", "Painted"), vk("packed_by", "Packed By")],
        photo=("As-left photos", 1, 8)),
    step("final", "Testing", "Final inspection", "Final QC", [
        vk("final_insp_qc", "Final Insp / QC"), vk("cust_notes", "Cust Notes ~"), vk("comments", "Comments ~"),
        vk("js_comment", "JS Comment ~")], hold=True),
])

T["t"] = ("Manufacturing", "manufacturing", "Manufacture/Machine/Weld", [
    step("receipt", "Machine 1", "Manufacturing requirements", "Mfg Req.",
         ["JS Manufacturing ID", "Manufacturing description ~", "Drawing number", "Drawing @", "MTR @",
          "Additional QA/QC documentation @",
          fld("Is welding required | No | Yes", unlock={"Yes": ["mfg_weld"]})]),
    step("repair", "Welding", "Welding documents", "Weld Docs",
         ["Filler MTR @", "Heat treat report @", "PMI @", "PT @"], key="mfg_weld", locked=True),
    step("repair", "Machine 1", "Machine part", "Machine"),
    step("final", "Testing", "Final inspection", "Final QC",
         ["Has the part completed final inspection ?", "Is the final inspection report uploaded ?",
          "Is the part secured and ready for shipment ?", "Final inspection report @"], hold=True),
])

# ---------- build ----------
def empty_sel():
    return dict(included=False, holdPoint=False, beforeMeas=False, afterMeas=False, measVerify=False, subReqs=[],
                notes="", requirePicture=False, pictureLabel="", minPhotos=1, maxPhotos=4, measFields=[],
                requireNameplate=False, blockNext=False, sectionId="", shopArea="", sortIndex=None,
                addToTraveler=False, travelerEntry=None, resourceDocs=[])

def _assign_fields(sid, raw_fields, keymap):
    fields = []
    seq = 0
    for f in raw_fields:
        f = dict(f)
        un = f.pop("_unlock", None)
        preset = str(f.get("id") or "").strip()
        if preset:
            f["id"] = preset if preset.startswith(sid) else f"{sid}_{preset}"
        else:
            seq += 1
            f["id"] = f"{sid}_f{seq:02d}"
        if un:
            f["unlockItemIdsByOption"] = {
                opt: [keymap[k] for k in keys] for opt, keys in un.items()
            }
        fields.append(f)
    return fields

def build(letter, steps):
    sel, custom, keymap, rows = {}, [], {}, []
    n = 0
    for s in steps:
        n += 1
        if s == "PARTS":
            sel["parts_order"] = {**empty_sel(), "included": True, "sortIndex": n, "addToTraveler": True}
            continue
        if isinstance(s, dict) and s.get("_parts"):
            rows.append(("parts_order", n, s))
            continue
        sid = f"trv_{letter}_{n:02d}"
        if s["key"]: keymap[s["key"]] = sid
        rows.append((sid, n, s))
    for sid, n, s in rows:
        fields = _assign_fields(sid, s["fields"], keymap)
        is_parts = bool(s.get("_parts"))
        st = {
            **empty_sel(),
            "included": True if is_parts else (not s["locked"]),
            "holdPoint": s["hold"],
            "measFields": fields,
            "sectionId": s["sec"],
            "shopArea": s["area"],
            "sortIndex": n,
            "addToTraveler": True if is_parts else False,
            "subReqs": list(s.get("subReqs") or []) if is_parts else [],
        }
        if s["photo"]:
            st.update(requirePicture=True, pictureLabel=s["photo"][0], minPhotos=s["photo"][1], maxPhotos=s["photo"][2])
        sel[sid] = st
        detail = dict(id=sid, name=s["name"], ref=s["ref"], secId=s["sec"], area=s["area"], sortOrder=n, builtIn=False,
                      requireMeasurement=bool(fields), measFields=fields, holdPoint=s["hold"])
        if s["photo"]:
            detail.update(requirePicture=True, pictureLabel=s["photo"][0], minPhotos=s["photo"][1], maxPhotos=s["photo"][2])
        custom.append(dict(id=sid, secId=s["sec"], name=s["name"], detail=detail))
    return {"sel": sel, "custom": custom}

def main(out):
    lines = ["-- GENERATED by scripts/generate-traveler-templates.py - do not hand edit.",
             "-- Adds one NON-default ITP template per old-traveler valve type. Safe to re-run:",
             "-- existing rows (same job type + valve type + name) are left alone.", "begin;", ""]
    summary = []
    for letter, (old, job, vt, steps) in T.items():
        scope = build(letter, steps)
        js = json.dumps(scope, ensure_ascii=False)
        assert "$trv$" not in js
        name = PREFIX + old
        shown = sum(1 for v in scope["sel"].values() if v["included"])
        hidden = len(scope["sel"]) - shown
        nf = sum(len(v["measFields"]) for v in scope["sel"].values())
        summary.append((old, vt, job, shown, hidden, nf))
        lines += [f"-- {old}: {shown} steps + {hidden} unlockable, {nf} fields",
                  "insert into public.itp_library_templates (job_type, valve_type, name, is_default, scope)",
                  f"values ('{job}', '{vt}', '{name}', false, $trv${js}$trv$::jsonb)",
                  "on conflict (job_type, valve_type, name) do nothing;", ""]
    lines += ["commit;", "",
              "-- To remove everything this file added:",
              f"--   delete from public.itp_library_templates where name like '{PREFIX}%';"]
    open(out, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    for r in summary: print("%-38s %-30s %-13s %2d steps +%2d unlock %3d fields" % r)

if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "..", "supabase", "seed-itp-traveler-templates.sql"))
