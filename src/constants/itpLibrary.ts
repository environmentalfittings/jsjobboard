/**
 * Valve repair ITP library — ported from the standalone Environmental Fittings ITP app.
 * Sections, item IDs, and job/valve-type templates.
 */

export type ItpLibraryJobType = 'repair' | 'testonly' | 'manufacturing' | 'other'

export type ItpLibrarySectionId =
  | 'receipt'
  | 'disassembly'
  | 'inspection'
  | 'ndt'
  | 'repair'
  | 'assembly'
  | 'testing'
  | 'final'
  | 'hfservice'
  | 'slabgate'
  | 'wedgeplug'
  | 'controlvlv'
  | 'reliefsafety'
  | 'actuatorsec'
  | 'mfgsec'

export type ItpLibraryItem = {
  id: string
  name: string
  ref: string
  defaultSubReqs?: string[]
}

export type ItpLibrarySection = {
  id: ItpLibrarySectionId
  title: string
  items: ItpLibraryItem[]
}

export type ItpLibraryValveFamily =
  | 'ball'
  | 'wedgeplug'
  | 'gate'
  | 'slab'
  | 'globe'
  | 'check'
  | 'butterfly'
  | 'control'
  | 'plug'
  | 'relief'
  | 'actuator'
  | 'general'

export const ITP_LIBRARY_JOB_TYPE_LABELS: Record<ItpLibraryJobType, string> = {
  repair: 'Repair',
  testonly: 'Test Only',
  manufacturing: 'Manufacturing',
  other: 'Other',
}

export const ITP_LIBRARY_JOB_TYPE_COLORS: Record<ItpLibraryJobType, string> = {
  repair: '#0550ae',
  testonly: '#0969da',
  manufacturing: '#1a7f37',
  other: '#6b7c8d',
}

export const ITP_LIBRARY: ItpLibrarySection[] = [
  {
    "id": "receipt",
    "title": "1. Incoming Inspection & Receipt",
    "items": [
      {
        "id": "r1",
        "name": "Verify work order & tag number match physical valve",
        "ref": "WO Review"
      },
      {
        "id": "r2",
        "name": "Check nameplate data (size, class, material, trim)",
        "ref": "Nameplate"
      },
      {
        "id": "r3",
        "name": "Document as-received condition (photos, corrosion, damage)",
        "ref": "Incoming Report"
      },
      {
        "id": "r4",
        "name": "Confirm customer documents received (drawings, specs)",
        "ref": "Document Control"
      },
      {
        "id": "r5",
        "name": "Verify previous service history if available",
        "ref": "Service Record"
      }
    ]
  },
  {
    "id": "disassembly",
    "title": "2. Disassembly & Cleaning",
    "items": [
      {
        "id": "d1",
        "name": "Mark components for orientation / reassembly reference",
        "ref": "Procedure"
      },
      {
        "id": "d2",
        "name": "Disassemble per approved procedure / OEM instructions",
        "ref": "Repair Proc."
      },
      {
        "id": "d3",
        "name": "Clean all components — remove scale, deposits, old sealant",
        "ref": "Cleaning Proc."
      },
      {
        "id": "d4",
        "name": "Inspect & replace fasteners — record all fastener data on traveler",
        "ref": "Fastener Record",
        "defaultSubReqs": [
          "Fastener size & thread spec (dia. × pitch × length)",
          "Material / grade (e.g. A193 B7, A320 L7, SS316)",
          "Quantity replaced",
          "Replacement part number / heat number",
          "MTR / material certification number obtained",
          "Verify replacement fasteners meet original design spec"
        ]
      }
    ]
  },
  {
    "id": "inspection",
    "title": "3. Component Inspection",
    "items": [
      {
        "id": "i1",
        "name": "Body / bonnet — pitting, cracks, erosion; wall thickness if required",
        "ref": "Visual + DT"
      },
      {
        "id": "i2",
        "name": "Seat faces / seat rings — scoring, erosion, corrosion",
        "ref": "Visual Insp."
      },
      {
        "id": "i3",
        "name": "Closure member (ball, disc, gate, plug) — finish & dimensions",
        "ref": "Dimensional"
      },
      {
        "id": "i4",
        "name": "Stem — corrosion, scoring, straightness, thread condition",
        "ref": "Stem Insp."
      },
      {
        "id": "i5",
        "name": "Packing area / stem bore — wear, damage",
        "ref": "Visual Insp."
      },
      {
        "id": "i6",
        "name": "Gland / gland follower — sealing surfaces",
        "ref": "Visual Insp."
      },
      {
        "id": "i7",
        "name": "Body-to-bonnet joint / RTJ ring groove — sealing surfaces",
        "ref": "Visual Insp."
      },
      {
        "id": "i8",
        "name": "End connections — flanges, threads, BW ends for damage",
        "ref": "API 6D / B16.5"
      },
      {
        "id": "i9",
        "name": "Actuator / handwheel — damage, function (if applicable)",
        "ref": "Visual Insp."
      }
    ]
  },
  {
    "id": "ndt",
    "title": "4. NDE / NDT",
    "items": [
      {
        "id": "n1",
        "name": "MT or PT on body / bonnet — cracks, laminations (record report #)",
        "ref": "ASME / API"
      },
      {
        "id": "n2",
        "name": "UT wall thickness — body (3 locations) and bonnet (2 locations) per API RP 621 / B16.34",
        "ref": "UT Procedure"
      },
      {
        "id": "n3",
        "name": "Hardness testing — seats, closure member (record HRC/HB values)",
        "ref": "Hardness Proc."
      },
      {
        "id": "n4",
        "name": "Dimensional inspection — key clearances per drawings/specs",
        "ref": "Drawing"
      },
      {
        "id": "n5",
        "name": "PMI (Positive Material Identification) — all wetted parts verified; results on traveler",
        "ref": "SOP 3020 / API"
      }
    ]
  },
  {
    "id": "repair",
    "title": "5. Repair & Machining",
    "items": [
      {
        "id": "m1",
        "name": "Seat lapping / machining — achieve required surface finish",
        "ref": "Lapping Proc."
      },
      {
        "id": "m2",
        "name": "Closure member repair or replacement",
        "ref": "Repair Proc."
      },
      {
        "id": "m3",
        "name": "Stem replacement or repair (if required)",
        "ref": "Parts Record"
      },
      {
        "id": "m4",
        "name": "Body weld repair — record WPS/PQR used (if applicable)",
        "ref": "WPS/PQR"
      },
      {
        "id": "m5",
        "name": "PWHT completed — record time/temp chart (if required)",
        "ref": "PWHT Record"
      },
      {
        "id": "m6",
        "name": "Re-inspect machined/repaired surfaces before assembly",
        "ref": "Dimensional"
      }
    ]
  },
  {
    "id": "assembly",
    "title": "6. Reassembly",
    "items": [
      {
        "id": "a1",
        "name": "New soft goods installed (gaskets, O-rings, packing, seals)",
        "ref": "Parts Record"
      },
      {
        "id": "a2",
        "name": "Correct packing type and quantity per spec",
        "ref": "Packing Spec."
      },
      {
        "id": "a3",
        "name": "Stem installed — correct orientation, no binding",
        "ref": "Proc."
      },
      {
        "id": "a4",
        "name": "Closure member installed per orientation marks",
        "ref": "Proc."
      },
      {
        "id": "a5",
        "name": "Body-to-bonnet fasteners torqued per spec — record values",
        "ref": "Torque Table"
      },
      {
        "id": "a6",
        "name": "Gland bolting tightened to specified value",
        "ref": "Torque Table"
      },
      {
        "id": "a7",
        "name": "Valve operates full open to full close without binding",
        "ref": "Functional Check"
      },
      {
        "id": "a8",
        "name": "Travel stops / position indicators set correctly",
        "ref": "Proc."
      }
    ]
  },
  {
    "id": "testing",
    "title": "7. Pressure & Leak Testing",
    "items": [
      {
        "id": "t1",
        "name": "Shell / body test — pressure: ___ psi, medium: ___, duration: ___ min",
        "ref": "API 598 / ASME"
      },
      {
        "id": "t2",
        "name": "Shell test result — no visible leakage confirmed",
        "ref": "API 598"
      },
      {
        "id": "t3",
        "name": "Seat closure test low pressure (air/N₂) — pressure: ___ psi",
        "ref": "API 598"
      },
      {
        "id": "t4",
        "name": "Seat closure test high pressure — pressure: ___ psi",
        "ref": "API 598"
      },
      {
        "id": "t5",
        "name": "Allowable seat leakage rate recorded (Class ___ per API 598)",
        "ref": "API 598"
      },
      {
        "id": "t6",
        "name": "Backseat / stem packing test — no leakage at operating pressure",
        "ref": "API 598"
      },
      {
        "id": "t7",
        "name": "Test pressures verified on calibrated gauge (cal. cert. #: ___)",
        "ref": "Calibration"
      },
      {
        "id": "t8",
        "name": "Test medium removed / drained after testing",
        "ref": "Proc."
      },
      {
        "id": "t9",
        "name": "Cavity relief test — relieve cavity into valve end; relief pressure: ___ psi (spec: ≤33% of MAWP)",
        "ref": "API 6D / Repair Proc."
      },
      {
        "id": "t10",
        "name": "High-pressure shell test (1.5× MAWP, min. 4 hrs, chart-recorded) — test pressure: ___ psi",
        "ref": "SOP 6080 / API 6D"
      }
    ]
  },
  {
    "id": "final",
    "title": "8. Final Inspection & Documentation",
    "items": [
      {
        "id": "f1",
        "name": "Nameplate correct — size, class, material, trim matches repair record",
        "ref": "Nameplate"
      },
      {
        "id": "f2",
        "name": "Valve cleaned and preserved per customer spec",
        "ref": "Preservation Spec."
      },
      {
        "id": "f3",
        "name": "End connections protected (caps, plugs, covers)",
        "ref": "Shipping Prep."
      },
      {
        "id": "f4",
        "name": "All soft goods / materials certified — MTRs obtained",
        "ref": "MTR File"
      },
      {
        "id": "f5",
        "name": "Test reports, inspection records, and photographs compiled",
        "ref": "Document Package"
      },
      {
        "id": "f6",
        "name": "Repair tag / certificate of compliance attached to valve",
        "ref": "Quality Record"
      },
      {
        "id": "f7",
        "name": "Final review — all ITP items dispositioned, no open FAIL items",
        "ref": "QC Review"
      }
    ]
  },
  {
    "id": "hfservice",
    "title": "HF Acid Service — Special Requirements",
    "items": [
      {
        "id": "hf1",
        "name": "Valve confirmed neutralized per API 751 / SOP 1200 — neutralization tag present",
        "ref": "API 751 / SOP 1200"
      },
      {
        "id": "hf2",
        "name": "pH test of neutralization solution documented on traveler — pH: ___",
        "ref": "SOP 1200"
      },
      {
        "id": "hf3",
        "name": "HF PPE verified on all personnel — face shield, chemical suit, nitrile inner + HF outer gloves, boots",
        "ref": "Safety Proc."
      },
      {
        "id": "hf4",
        "name": "PMI performed on all wetted parts per SOP 3020 — mass spec / XRF results on traveler",
        "ref": "SOP 3020"
      },
      {
        "id": "hf5",
        "name": "PT on all internal & external CS, M35, Alloy C276 surfaces per ASME B16.34 App. II",
        "ref": "SOP 3010 / B16.34"
      },
      {
        "id": "hf6",
        "name": "Mass spectrometer leak check completed (if applicable)",
        "ref": "Spec."
      }
    ]
  },
  {
    "id": "slabgate",
    "title": "Pipeline Gate-Slab — Specialty Inspection",
    "items": [
      {
        "id": "sg1",
        "name": "NORM assessment documented — valve cleared for handling per applicable regulations",
        "ref": "SOP / Regulations"
      },
      {
        "id": "sg2",
        "name": "Slab as-found condition recorded — eligible for repair per dimensional table; if not, replace",
        "ref": "SOP 6080 Annex 1"
      },
      {
        "id": "sg3",
        "name": "ENP plating stripped from slab — inspect bare slab for pitting, gouging, foot wear",
        "ref": "SOP 6080"
      },
      {
        "id": "sg4",
        "name": "Slab surface finish verified by profilometer — Ra: ___ uim (accept: ≤10.8 std / ≤3.6 cryo)",
        "ref": "SOP 6080"
      },
      {
        "id": "sg5",
        "name": "Slab re-plated with ENP — minimum 3 mils coating; final thickness recorded on traveler",
        "ref": "SOP 6080"
      },
      {
        "id": "sg6",
        "name": "Seat pockets inspected for pitting, ovality — repaired by weld and machined to OEM spec; PT performed",
        "ref": "SOP 6080 / ASME"
      },
      {
        "id": "sg7",
        "name": "Stem straightness ≤.001\" runout over sealing length; surface finish 16–32 uin; thread profile gauged",
        "ref": "SOP 6080 Table 3"
      },
      {
        "id": "sg8",
        "name": "Bonnet O-ring sealing surface checked for flatness, pitting; stuffing box concentricity verified",
        "ref": "SOP 6080"
      },
      {
        "id": "sg9",
        "name": "NACE MR0175 requirements verified — base material ≤22 HRC, weld zone ≤22 HRC, B7M bolting",
        "ref": "NACE MR0175 / SOP 6080"
      }
    ]
  },
  {
    "id": "wedgeplug",
    "title": "Wedgeplug Valve — Specialty Inspection",
    "items": [
      {
        "id": "wp1",
        "name": "Stem revolution count recorded open-to-close — total turns: ___ ; stem threads exposed: ___",
        "ref": "SOP 6050"
      },
      {
        "id": "wp2",
        "name": "Actuator torque & limit switches checked before disassembly (if motorized)",
        "ref": "SOP 6050"
      },
      {
        "id": "wp3",
        "name": "Bonnet stuffing box ID polished to ≤32 RMS — max oversize .030\" before weld repair required",
        "ref": "SOP 6050"
      },
      {
        "id": "wp4",
        "name": "Stem inspected at 3 points — straightness, pitting, galls, thread wear; repaired or replaced",
        "ref": "SOP 6050"
      },
      {
        "id": "wp5",
        "name": "Plug & body seats cleaned to bare metal — inspect for pitting, wire draw, washouts; repair TIG as needed",
        "ref": "SOP 6050"
      },
      {
        "id": "wp6",
        "name": "Plug & body match-ground to achieve watertight seal — lapping marks even and complete 360°",
        "ref": "SOP 6050"
      }
    ]
  },
  {
    "id": "controlvlv",
    "title": "Control Valve — Calibration & Actuator",
    "items": [
      {
        "id": "cv1",
        "name": "Actuator calibration — bench set: ___ to ___ psi (or ___ to ___ mA)",
        "ref": "Actuator Spec."
      },
      {
        "id": "cv2",
        "name": "Travel / stroke verification — full open: ___, full close: ___",
        "ref": "Drawing"
      },
      {
        "id": "cv3",
        "name": "Positioner calibration — input signal vs. position table recorded",
        "ref": "Calibration"
      },
      {
        "id": "cv4",
        "name": "Fugitive emissions / stem packing leak test per spec",
        "ref": "EPA 21 / Spec"
      }
    ]
  },
  {
    "id": "reliefsafety",
    "title": "Relief / Safety Valve — Testing",
    "items": [
      {
        "id": "rv1",
        "name": "Set pressure test (CDTP) — Required: ___ psi, Actual: ___ psi",
        "ref": "API 527 / ASME"
      },
      {
        "id": "rv2",
        "name": "Blowdown — valve reseats at: ___ psi (spec: ___ psi)",
        "ref": "API 527"
      },
      {
        "id": "rv3",
        "name": "Seat leakage per API 527 / ASME PTC 25 — leakage rate: ___",
        "ref": "API 527"
      },
      {
        "id": "rv4",
        "name": "Accumulation test (if required) — max pressure: ___ psi",
        "ref": "ASME"
      }
    ]
  },
  {
    "id": "actuatorsec",
    "title": "Actuator Overhaul",
    "items": [
      {
        "id": "act1",
        "name": "Actuator disassembly — inspect cylinder / diaphragm, springs, seals",
        "ref": "OEM Proc."
      },
      {
        "id": "act2",
        "name": "Spring range recorded — lower bench set: ___ psi, upper: ___ psi",
        "ref": "Actuator Spec."
      },
      {
        "id": "act3",
        "name": "Actuator reassembled — bench set verified: ___ to ___ psi",
        "ref": "Actuator Spec."
      },
      {
        "id": "act4",
        "name": "Full stroke functional test — travel, limits, torque / thrust verified",
        "ref": "OEM Spec."
      }
    ]
  },
  {
    "id": "mfgsec",
    "title": "Manufacturing & Fabrication",
    "items": [
      {
        "id": "mfg1",
        "name": "Raw material received — verify MTR, heat number, grade vs. PO",
        "ref": "Material Control"
      },
      {
        "id": "mfg2",
        "name": "Material traceability marked and maintained on all parts",
        "ref": "MTR"
      },
      {
        "id": "mfg3",
        "name": "First operation dimensions verified per engineering drawing",
        "ref": "Drawing"
      },
      {
        "id": "mfg4",
        "name": "All machining operations complete per router / traveler",
        "ref": "Router"
      },
      {
        "id": "mfg5",
        "name": "Critical dimensions verified — bore, OD, threads, face-to-face",
        "ref": "Drawing"
      },
      {
        "id": "mfg6",
        "name": "Surface finish verified (Ra / RMS per spec: ___)",
        "ref": "Surface Finish Spec."
      },
      {
        "id": "mfg7",
        "name": "Welding performed per qualified WPS — record WPS #, welder ID",
        "ref": "WPS/PQR"
      },
      {
        "id": "mfg8",
        "name": "PWHT completed (if required) — record time / temperature chart",
        "ref": "PWHT Record"
      },
      {
        "id": "mfg9",
        "name": "Final dimensional inspection — all dims recorded on inspection sheet",
        "ref": "Dimensional Insp."
      }
    ]
  }
] as ItpLibrarySection[]

export const ITP_LIBRARY_TEMPLATES: Record<string, string[]> = {
  "repair:ball": [
    "r1",
    "r2",
    "r3",
    "r4",
    "r5",
    "d1",
    "d2",
    "d3",
    "d4",
    "i1",
    "i2",
    "i3",
    "i8",
    "n2",
    "n3",
    "n4",
    "m1",
    "m2",
    "m3",
    "m6",
    "a1",
    "a2",
    "a3",
    "a4",
    "a5",
    "a6",
    "a7",
    "a8",
    "t1",
    "t2",
    "t3",
    "t4",
    "t5",
    "t7",
    "t8",
    "f1",
    "f2",
    "f3",
    "f4",
    "f5",
    "f6",
    "f7"
  ],
  "repair:gate": [
    "r1",
    "r2",
    "r3",
    "r4",
    "r5",
    "d1",
    "d2",
    "d3",
    "d4",
    "i1",
    "i2",
    "i3",
    "i4",
    "i5",
    "i6",
    "i7",
    "i8",
    "n1",
    "n2",
    "n3",
    "n4",
    "n5",
    "m1",
    "m2",
    "m3",
    "m4",
    "m6",
    "a1",
    "a2",
    "a3",
    "a4",
    "a5",
    "a6",
    "a7",
    "a8",
    "t1",
    "t2",
    "t3",
    "t4",
    "t5",
    "t6",
    "t7",
    "t8",
    "f1",
    "f2",
    "f3",
    "f4",
    "f5",
    "f6",
    "f7"
  ],
  "repair:globe": [
    "r1",
    "r2",
    "r3",
    "r4",
    "r5",
    "d1",
    "d2",
    "d3",
    "d4",
    "i1",
    "i2",
    "i3",
    "i4",
    "i5",
    "i6",
    "i7",
    "i8",
    "n1",
    "n2",
    "n3",
    "n4",
    "n5",
    "m1",
    "m2",
    "m3",
    "m6",
    "a1",
    "a2",
    "a3",
    "a4",
    "a5",
    "a6",
    "a7",
    "a8",
    "t1",
    "t2",
    "t3",
    "t4",
    "t5",
    "t6",
    "t7",
    "t8",
    "f1",
    "f2",
    "f3",
    "f4",
    "f5",
    "f6",
    "f7"
  ],
  "repair:check": [
    "r1",
    "r2",
    "r3",
    "r4",
    "r5",
    "d1",
    "d2",
    "d3",
    "d4",
    "i1",
    "i2",
    "i3",
    "i7",
    "i8",
    "n1",
    "n2",
    "m2",
    "m6",
    "a1",
    "a4",
    "a5",
    "a7",
    "t1",
    "t2",
    "t3",
    "t4",
    "t5",
    "t7",
    "t8",
    "f1",
    "f2",
    "f3",
    "f4",
    "f5",
    "f6",
    "f7"
  ],
  "repair:butterfly": [
    "r1",
    "r2",
    "r3",
    "r4",
    "r5",
    "d1",
    "d2",
    "d3",
    "d4",
    "i1",
    "i2",
    "i3",
    "i4",
    "i5",
    "i8",
    "n2",
    "n3",
    "n4",
    "m1",
    "m2",
    "m3",
    "m6",
    "a1",
    "a2",
    "a3",
    "a4",
    "a5",
    "a7",
    "a8",
    "t1",
    "t2",
    "t3",
    "t4",
    "t5",
    "t7",
    "t8",
    "f1",
    "f2",
    "f3",
    "f4",
    "f5",
    "f6",
    "f7"
  ],
  "repair:control": [
    "r1",
    "r2",
    "r3",
    "r4",
    "r5",
    "d1",
    "d2",
    "d3",
    "d4",
    "i1",
    "i2",
    "i3",
    "i4",
    "i5",
    "i6",
    "i7",
    "i8",
    "i9",
    "n2",
    "n3",
    "n4",
    "m1",
    "m2",
    "m3",
    "m6",
    "a1",
    "a2",
    "a3",
    "a4",
    "a5",
    "a6",
    "a7",
    "a8",
    "cv1",
    "cv2",
    "cv3",
    "cv4",
    "t1",
    "t2",
    "t6",
    "t7",
    "t8",
    "f1",
    "f2",
    "f3",
    "f4",
    "f5",
    "f6",
    "f7"
  ],
  "repair:plug": [
    "r1",
    "r2",
    "r3",
    "r4",
    "r5",
    "d1",
    "d2",
    "d3",
    "d4",
    "i1",
    "i3",
    "i4",
    "i5",
    "i6",
    "i8",
    "n2",
    "n3",
    "n4",
    "n5",
    "m1",
    "m2",
    "m3",
    "m6",
    "a1",
    "a2",
    "a3",
    "a4",
    "a5",
    "a6",
    "a7",
    "a8",
    "t1",
    "t2",
    "t3",
    "t4",
    "t5",
    "t7",
    "t8",
    "f1",
    "f2",
    "f3",
    "f4",
    "f5",
    "f6",
    "f7"
  ],
  "repair:relief": [
    "r1",
    "r2",
    "r3",
    "r4",
    "r5",
    "d1",
    "d2",
    "d3",
    "d4",
    "i1",
    "i2",
    "i3",
    "i4",
    "i5",
    "i7",
    "i8",
    "n2",
    "n3",
    "m1",
    "m2",
    "m3",
    "m6",
    "a1",
    "a2",
    "a3",
    "a4",
    "a5",
    "a6",
    "a7",
    "rv1",
    "rv2",
    "rv3",
    "rv4",
    "f1",
    "f2",
    "f3",
    "f4",
    "f5",
    "f6",
    "f7"
  ],
  "repair:actuator": [
    "r1",
    "r2",
    "r3",
    "r4",
    "i9",
    "n3",
    "act1",
    "act2",
    "act3",
    "act4",
    "t7",
    "f1",
    "f4",
    "f5",
    "f6",
    "f7"
  ],
  "repair:slab": [
    "r1",
    "r2",
    "r3",
    "r4",
    "r5",
    "d1",
    "d2",
    "d3",
    "d4",
    "i1",
    "i2",
    "i4",
    "i5",
    "i6",
    "i7",
    "i8",
    "n1",
    "n2",
    "n3",
    "n4",
    "n5",
    "m1",
    "m4",
    "m6",
    "a1",
    "a2",
    "a3",
    "a4",
    "a5",
    "a6",
    "a7",
    "a8",
    "sg1",
    "sg2",
    "sg3",
    "sg4",
    "sg5",
    "sg6",
    "sg7",
    "sg8",
    "sg9",
    "t1",
    "t2",
    "t3",
    "t4",
    "t5",
    "t6",
    "t7",
    "t8",
    "t9",
    "t10",
    "f1",
    "f2",
    "f3",
    "f4",
    "f5",
    "f6",
    "f7"
  ],
  "repair:wedgeplug": [
    "r1",
    "r2",
    "r3",
    "r4",
    "r5",
    "d1",
    "d2",
    "d3",
    "d4",
    "i1",
    "i3",
    "i4",
    "i5",
    "i8",
    "n2",
    "n3",
    "n4",
    "n5",
    "m1",
    "m2",
    "m3",
    "m6",
    "wp1",
    "wp2",
    "wp3",
    "wp4",
    "wp5",
    "wp6",
    "a1",
    "a2",
    "a4",
    "a5",
    "a6",
    "a7",
    "a8",
    "t1",
    "t2",
    "t3",
    "t4",
    "t5",
    "t7",
    "t8",
    "f1",
    "f2",
    "f3",
    "f4",
    "f5",
    "f6",
    "f7"
  ],
  "repair:general": [
    "r1",
    "r2",
    "r3",
    "r4",
    "r5",
    "d1",
    "d2",
    "d3",
    "d4",
    "i1",
    "i2",
    "i3",
    "i4",
    "i5",
    "i6",
    "i7",
    "i8",
    "n2",
    "n3",
    "n4",
    "m1",
    "m2",
    "m3",
    "m6",
    "a1",
    "a2",
    "a3",
    "a4",
    "a5",
    "a6",
    "a7",
    "a8",
    "t1",
    "t2",
    "t3",
    "t4",
    "t5",
    "t7",
    "t8",
    "f1",
    "f2",
    "f3",
    "f4",
    "f5",
    "f6",
    "f7"
  ],
  "testonly:standard": [
    "r1",
    "r2",
    "r3",
    "t1",
    "t2",
    "t3",
    "t4",
    "t5",
    "t6",
    "t7",
    "t8",
    "f1",
    "f4",
    "f5",
    "f6",
    "f7"
  ],
  "testonly:relief": [
    "r1",
    "r2",
    "r3",
    "rv1",
    "rv2",
    "rv3",
    "rv4",
    "f1",
    "f4",
    "f5",
    "f6",
    "f7"
  ],
  "testonly:control": [
    "r1",
    "r2",
    "r3",
    "cv1",
    "cv2",
    "cv3",
    "cv4",
    "t1",
    "t2",
    "t7",
    "t8",
    "f1",
    "f4",
    "f5",
    "f6",
    "f7"
  ],
  "manufacturing": [
    "r1",
    "r2",
    "mfg1",
    "mfg2",
    "mfg3",
    "mfg4",
    "mfg5",
    "mfg6",
    "mfg7",
    "mfg8",
    "mfg9",
    "n1",
    "n2",
    "n3",
    "n4",
    "t1",
    "t2",
    "t7",
    "t8",
    "f1",
    "f3",
    "f4",
    "f5",
    "f6",
    "f7"
  ],
  "other": []
}

export function valveFamily(vt: string | null | undefined): ItpLibraryValveFamily {
  if (!vt) return 'general'
  const lv = vt.toLowerCase().trim()
  const M: Record<Exclude<ItpLibraryValveFamily, 'general'>, string[]> = {
    ball: [
      '4-way diverter valve',
      'ball valve',
      'delayed coker ball',
      'delayed coker isolation ball',
      'delayed coker switch',
      'orbit',
      'twinseal',
      '6-way transfer valve',
    ],
    wedgeplug: ['wedgeplug'],
    gate: ['gate', 'knife gate', 'mud valve', 'pipeline gate-expanding', 'pressure seal gate', 'wedge gate'],
    slab: ['pipeline gate-slab'],
    globe: ['angle globe', 'globe', 'pressure seal globe'],
    check: ['arc', 'ball check', 'check', 'duo check', 'piston check', 'swing check'],
    butterfly: ['butterfly'],
    control: ['control valve'],
    plug: ['lubricated plug', 'non-lubricated plug'],
    relief: ['relief valve', 'safety valve'],
    actuator: ['actuator'],
  }
  for (const [fam, types] of Object.entries(M) as [Exclude<ItpLibraryValveFamily, 'general'>, string[]][]) {
    if (types.includes(lv)) return fam
  }
  return 'general'
}

export function getTemplateKey(jobType: ItpLibraryJobType | '', valveType: string | null | undefined): string {
  if (!jobType || jobType === 'other') return 'other'
  if (jobType === 'manufacturing') return 'manufacturing'
  const fam = valveFamily(valveType)
  if (jobType === 'repair') {
    const k = `repair:${fam}`
    return ITP_LIBRARY_TEMPLATES[k] ? k : 'repair:general'
  }
  if (jobType === 'testonly') {
    if (fam === 'relief') return 'testonly:relief'
    if (fam === 'control') return 'testonly:control'
    return 'testonly:standard'
  }
  return 'other'
}

export function findLibraryItem(itemId: string): { section: ItpLibrarySection; item: ItpLibraryItem } | null {
  for (const section of ITP_LIBRARY) {
    const item = section.items.find((it) => it.id === itemId)
    if (item) return { section, item }
  }
  return null
}

export function mapShopJobTypeToLibrary(raw: string | null | undefined): ItpLibraryJobType {
  const v = String(raw ?? '').trim().toLowerCase()
  if (!v) return 'repair'
  if (v.includes('test')) return 'testonly'
  if (v.includes('manufactur')) return 'manufacturing'
  if (v === 'machining' || v === 'welding' || v === 'other') return 'other'
  return 'repair'
}

export function resolveLibraryValveType(valveType: string | null | undefined, bowlType: string | null | undefined): string {
  const vt = String(valveType ?? '').trim()
  if (vt) return vt
  return String(bowlType ?? '').trim()
}
