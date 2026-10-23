import { openPreviewWindow, showHtmlPreview } from './printHtml'
import {
  PCMS_PART_NAMES,
  type PcmsFormState,
  type PcmsPartName,
} from './pcmsForm'

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function v(value: string | null | undefined) {
  const t = String(value ?? '').trim()
  return t ? escapeHtml(t) : '&nbsp;'
}

function fmtDate(value: string | null | undefined) {
  const t = String(value ?? '').trim()
  if (!t) return '&nbsp;'
  const d = new Date(`${t}T12:00:00`)
  if (Number.isNaN(d.getTime())) return escapeHtml(t)
  return escapeHtml(
    d.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' }),
  )
}

function check(on: boolean) {
  return on ? '☑' : '☐'
}

function yn(value: '' | 'yes' | 'no' | 'na') {
  if (value === 'yes') return 'YES'
  if (value === 'no') return 'NO'
  if (value === 'na') return 'N/A'
  return ''
}

function partCells(form: PcmsFormState, name: PcmsPartName) {
  const row = form.parts[name]
  return `<tr>
    <td class="part-name">${escapeHtml(name)}</td>
    <td>${v(row.primaryCondition)}</td>
    <td>${v(row.secondaryCondition)}</td>
    <td>${v(row.workPerformed)}</td>
    <td>${v(row.recommendation)}</td>
    <td>${v(row.priorRecommendation)}</td>
  </tr>`
}

export function buildPcmsPrintHtml(form: PcmsFormState, options?: { valveId?: string }) {
  const titleId = options?.valveId?.trim() || form.shopNo || form.controlNo || 'PCMS'
  const partsRows = PCMS_PART_NAMES.map((name) => partCells(form, name)).join('')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>PCMS RV-1958 — ${escapeHtml(titleId)}</title>
  <style>
    @page { size: letter; margin: 0.45in; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #0f172a;
      font-size: 10px;
      line-height: 1.25;
    }
    h1 { font-size: 14px; margin: 0; text-align: center; }
    .top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 8px;
      border-bottom: 2px solid #1d4ed8;
      padding-bottom: 6px;
    }
    .brand { font-weight: 800; font-size: 12px; color: #1e3a8a; }
    .meta { text-align: right; font-size: 10px; }
    .doc-id { font-weight: 700; margin: 4px 0 8px; }
    .section {
      border: 1px solid #94a3b8;
      margin: 0 0 8px;
    }
    .section-h {
      background: #bfdbfe;
      font-weight: 800;
      letter-spacing: 0.04em;
      padding: 3px 6px;
      border-bottom: 1px solid #94a3b8;
      text-transform: uppercase;
      font-size: 10px;
    }
    .section-b { padding: 6px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px 10px; }
    .field { display: flex; gap: 4px; align-items: baseline; min-height: 14px; }
    .field label { color: #475569; white-space: nowrap; min-width: 110px; font-weight: 600; }
    .field .val {
      flex: 1;
      border-bottom: 1px solid #cbd5e1;
      min-height: 14px;
      padding: 0 2px;
    }
    .io {
      display: grid;
      grid-template-columns: 80px 1fr 1fr;
      gap: 2px 8px;
      margin-top: 6px;
      border: 1px solid #cbd5e1;
      padding: 4px;
    }
    .io strong { font-size: 9px; color: #334155; }
    table.parts { width: 100%; border-collapse: collapse; font-size: 9px; }
    table.parts th, table.parts td {
      border: 1px solid #94a3b8;
      padding: 2px 3px;
      vertical-align: top;
    }
    table.parts th { background: #e2e8f0; font-size: 8px; }
    .part-name { font-weight: 700; width: 72px; }
    .checks { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 4px 0; }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .footer {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      color: #64748b;
      font-size: 9px;
    }
    .yn-row {
      display: grid;
      grid-template-columns: 1fr 90px;
      gap: 6px;
      margin: 3px 0;
      align-items: center;
    }
    .yn-row .ans { font-weight: 700; text-align: center; border-bottom: 1px solid #cbd5e1; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <section class="page">
    <div class="top">
      <div>
        <div class="brand">PCMS · SP-0135 &gt; RV-1958</div>
        <div>Partial Filled Test/Repair Data Form</div>
      </div>
      <div class="meta">
        <div>Report Date: ${fmtDate(form.reportDate)}</div>
        <div>Test/Repair Date: ${fmtDate(form.testRepairDate)}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-h">Relief Valve Data</div>
      <div class="section-b">
        <div class="field"><label>Description</label><div class="val">${v(form.description)}</div></div>
        <div class="grid-3" style="margin-top:4px">
          <div class="field"><label>Asset No</label><div class="val">${v(form.assetNo)}</div></div>
          <div class="field"><label>Serial No</label><div class="val">${v(form.serialNo)}</div></div>
          <div class="field"><label>Fluid State</label><div class="val">${v(form.fluidState)}</div></div>
          <div class="field"><label>Manufacturer</label><div class="val">${v(form.manufacturer)}</div></div>
          <div class="field"><label>Model No</label><div class="val">${v(form.modelNo)}</div></div>
          <div class="field"><label>Test Medium</label><div class="val">${v(form.testMedium)}</div></div>
          <div class="field"><label>Governing Code</label><div class="val">${v(form.governingCode)}</div></div>
          <div class="field"><label>Shop No</label><div class="val">${v(form.shopNo)}</div></div>
          <div class="field"><label>Max Test Press.</label><div class="val">${v(form.maxTestPressure)} psi</div></div>
          <div class="field"><label>Spring Number</label><div class="val">${v(form.springNumber)}</div></div>
          <div class="field"><label>Free Height</label><div class="val">${v(form.freeHeight)}</div></div>
          <div class="field"><label>Range</label><div class="val">${v(form.springRangeFrom)} to ${v(form.springRangeTo)}</div></div>
          <div class="field"><label>Orifice Desig.</label><div class="val">${v(form.orificeDesignation)}</div></div>
          <div class="field"><label>Orifice Size</label><div class="val">${v(form.orificeSize)}</div></div>
          <div class="field"><label>CDTP</label><div class="val">${v(form.cdtp)} psi</div></div>
          <div class="field"><label>Set Pressure</label><div class="val">${v(form.setPressure)} psi</div></div>
          <div class="field"><label>Req. Capacity</label><div class="val">${v(form.requiredCapacity)}</div></div>
          <div class="field"><label>Calc. Capacity</label><div class="val">${v(form.calculatedCapacity)}</div></div>
          <div class="field"><label>Rated Capacity</label><div class="val">${v(form.ratedCapacity)}</div></div>
          <div class="field"><label>SIB Constant</label><div class="val">${v(form.backPressureConstant)} psi</div></div>
          <div class="field"><label>SIB Variable</label><div class="val">${v(form.backPressureVariable)} psi</div></div>
          <div class="field"><label>Built-Up Back</label><div class="val">${v(form.builtUpBackPressure)} psi</div></div>
          <div class="field"><label>Relieving Temp</label><div class="val">${v(form.relievingTemperature)}</div></div>
          <div class="field"><label>Nozzle Ring Set</label><div class="val">${v(form.nozzleRingSet)}</div></div>
          <div class="field"><label>Guide Ring Set</label><div class="val">${v(form.guideRingSet)}</div></div>
        </div>
        <div class="io">
          <strong></strong><strong>INLET</strong><strong>OUTLET</strong>
          <strong>Size</strong><div>${v(form.inletSize)} in</div><div>${v(form.outletSize)} in</div>
          <strong>Rating</strong><div>${v(form.inletRating)} psi</div><div>${v(form.outletRating)} psi</div>
          <strong>Type</strong><div>${v(form.inletType)}</div><div>${v(form.outletType)}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-h">Pretest Data</div>
      <div class="section-b">
        <div class="checks">
          <span>${check(form.visualDirty)} Dirty</span>
          <span>${check(form.visualSealsIntact)} Seals Intact</span>
          <span>${check(form.visualDisassembled)} Disassembled</span>
          <span>${check(form.visualBrokenSpring)} Broken Spring</span>
          <span>${check(form.visualPlugged)} Plugged (${v(form.visualPluggedPct)}%)</span>
          <span>${check(form.noPopLeakedTooBad)} Leaked too Bad to Pop</span>
          <span>${check(form.noPopStuck)} Stuck</span>
          <span>${check(form.tightAfterReseat)} Tight After Reseat</span>
          <span>${check(form.passFailOverride)} Pass/Fail Override</span>
        </div>
        <div class="grid-3">
          <div class="field"><label>Valve CDTP</label><div class="val">${v(form.valveCdtpPressure)} psi</div></div>
          <div class="field"><label>Initial Pop</label><div class="val">${v(form.initialPopPressure)} psi</div></div>
          <div class="field"><label>Repop</label><div class="val">${v(form.repopPressure)} psi</div></div>
          <div class="field"><label>Leak Press.</label><div class="val">${v(form.leakPressure)} psi</div></div>
          <div class="field"><label>Reseat</label><div class="val">${v(form.reseatPressure)} psi</div></div>
          <div class="field"><label>Lift</label><div class="val">${v(form.lift)}</div></div>
          <div class="field"><label>Blowdown</label><div class="val">${v(form.blowdown)}</div></div>
          <div class="field"><label>Seal Tight</label><div class="val">${v(form.sealTightPressure)} psi</div></div>
          <div class="field"><label>Leak Rate</label><div class="val">${v(form.sealTightLeakRate)}</div></div>
          <div class="field"><label>Result</label><div class="val">${v(form.passFailResult)}</div></div>
          <div class="field"><label>Reason</label><div class="val">${v(form.passFailReason)}</div></div>
        </div>
        <div class="field" style="margin-top:4px"><label>Comments</label><div class="val">${v(form.pretestComments)}</div></div>
      </div>
    </div>

    <div class="section">
      <div class="section-h">Parts</div>
      <div class="section-b">
        <table class="parts">
          <thead>
            <tr>
              <th>Part</th>
              <th>Primary Condition</th>
              <th>Secondary Condition</th>
              <th>Work Performed</th>
              <th>Recommendation</th>
              <th>Prior Recommendation</th>
            </tr>
          </thead>
          <tbody>${partsRows}</tbody>
        </table>
        <div class="field" style="margin-top:4px"><label>Comments</label><div class="val">${v(form.partsComments)}</div></div>
      </div>
    </div>
    <div class="footer"><span>Page 1 of 3</span><span>Powered by PCMS</span></div>
  </section>

  <section class="page">
    <div class="top">
      <div>
        <div class="brand">PCMS · SP-0135 &gt; RV-1958</div>
        <div>Partial Filled Test/Repair Data Form</div>
      </div>
      <div class="meta">
        <div>Report Date: ${fmtDate(form.reportDate)}</div>
        <div>Shop No: ${v(form.shopNo)}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-h">Work Performed / Recommendation</div>
      <div class="section-b">
        <div class="field"><label>Work Performed</label><div class="val">${v(form.workPerformedNotes)}</div></div>
        <div class="field"><label>Recommendation</label><div class="val">${v(form.recommendation)}</div></div>
      </div>
    </div>

    <div class="section">
      <div class="section-h">Final Test · QA/QC</div>
      <div class="section-b">
        <div class="checks">
          <span>${check(form.qaSpringFreeHeight)} Measured Spring Free Height</span>
          <span>${check(form.qaDiskSinglePiece)} Disk (Single Piece)</span>
          <span>${check(form.qaOpenTopAdjustingBolt)} Open Top Adjusting Bolt</span>
          <span>${check(form.qaSpringNoVerified)} Spring No. Verified</span>
          <span>${check(form.qaCautionTag)} Caution Tag Affixed</span>
          <span>${check(form.qaLeadSeals)} Lead Seals &amp; Tag Affixed</span>
          <span>${check(form.qaCodeStamp)} Code Stamp Verified</span>
        </div>
        <div class="grid-2">
          <div>
            <strong>Final Settings</strong>
            <div class="field"><label>Set</label><div class="val">${v(form.finalSet)} psi</div></div>
            <div class="field"><label>CDTP</label><div class="val">${v(form.finalCdtp)} psi</div></div>
            <div class="field"><label>Back</label><div class="val">${v(form.finalBack)} psi</div></div>
            <div class="field"><label>Reseat</label><div class="val">${v(form.finalReseat)} psi</div></div>
            <div class="field"><label>Vacuum</label><div class="val">${v(form.finalVacuum)} psi</div></div>
            <div class="field"><label>Nozzle Ring</label><div class="val">${v(form.finalNozzleRing)}</div></div>
            <div class="field"><label>Guide Ring</label><div class="val">${v(form.finalGuideRing)}</div></div>
          </div>
          <div>
            <strong>Test Info</strong>
            <div class="field"><label>Seat Test Press.</label><div class="val">${v(form.seatTestPressure)} psi</div></div>
            <div class="field"><label>Test Medium</label><div class="val">${v(form.finalTestMedium)}</div></div>
            <div class="field"><label>Gauge Serial</label><div class="val">${v(form.gaugeSerialNo)}</div></div>
            <div class="field"><label>Leak Rate</label><div class="val">${v(form.finalLeakRate)}</div></div>
            <div class="field"><label>Cal Date</label><div class="val">${fmtDate(form.gaugeCalibrationDate)}</div></div>
          </div>
        </div>
        <div class="grid-3" style="margin-top:6px">
          <div class="field"><label>Repair Shop</label><div class="val">${v(form.valveRepairShop)}</div></div>
          <div class="field"><label>Representative</label><div class="val">${v(form.representative)}</div></div>
          <div class="field"><label>Control No</label><div class="val">${v(form.controlNo)}</div></div>
        </div>
        <div class="field" style="margin-top:4px"><label>Comments</label><div class="val">${v(form.finalComments)}</div></div>
      </div>
    </div>
    <div class="footer"><span>Page 2 of 3</span><span>Powered by PCMS</span></div>
  </section>

  <section class="page">
    <div class="top">
      <div>
        <div class="brand">PCMS · SP-0135 &gt; RV-1958</div>
        <div>PRV Removal / Installation Checklist</div>
      </div>
      <div class="meta">
        <div>Asset No: ${v(form.assetNo)}</div>
        <div>Shop No: ${v(form.shopNo)}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-h">PRV Removal</div>
      <div class="section-b">
        <div class="grid-2">
          <div class="field"><label>Checked by</label><div class="val">${v(form.removalPerson)}</div></div>
          <div class="field"><label>Removal Date</label><div class="val">${fmtDate(form.removalDate)}</div></div>
        </div>
        <div class="field"><label>Inlet piping</label><div class="val">${form.inletPipingClear ? 'Clear' : ''}${form.inletPipingPluggedPct ? ` · ${v(form.inletPipingPluggedPct)}% ID plugged` : ''}&nbsp;</div></div>
        <div class="field"><label>Outlet piping</label><div class="val">${form.outletPipingClear ? 'Clear' : ''}${form.outletPipingPluggedPct ? ` · ${v(form.outletPipingPluggedPct)}% ID plugged` : ''}&nbsp;</div></div>
      </div>
    </div>

    <div class="section">
      <div class="section-h">PRV Installation</div>
      <div class="section-b">
        <div class="grid-2">
          <div class="field"><label>Checked by</label><div class="val">${v(form.installPerson)}</div></div>
          <div class="field"><label>Install Date</label><div class="val">${fmtDate(form.installDate)}</div></div>
        </div>
        <div class="yn-row"><div>SAP tag# matches ASSET# at top of form?</div><div class="ans">${yn(form.sapTagMatchesAsset)}</div></div>
        <div class="yn-row"><div>Set pressure on data plate matches form?</div><div class="ans">${yn(form.dataPlateMatchesForm)}</div></div>
        <div class="yn-row"><div>Set pressure matches PTP and P&amp;ID?</div><div class="ans">${yn(form.dataPlateMatchesPtp)}</div></div>
        <div class="yn-row"><div>PRV in proper field location?</div><div class="ans">${yn(form.properLocation)}</div></div>
        <div class="yn-row"><div>No blinds / closed valves / obstructions?</div><div class="ans">${yn(form.noObstructions)}</div></div>
        <div class="yn-row"><div>Bonnet vents open with protective elbow?</div><div class="ans">${yn(form.bonnetVentsOk)}</div></div>
        <div class="yn-row"><div>Drain holes free / not plugged?</div><div class="ans">${yn(form.drainHolesOk)}</div></div>
        <div class="field" style="margin-top:6px"><label>Comments</label><div class="val">${v(form.fieldComments)}</div></div>
        <div class="field"><label>MOC#</label><div class="val">${v(form.mocNumber)}</div></div>
      </div>
    </div>
    <div class="footer"><span>Page 3 of 3</span><span>Powered by PCMS</span></div>
  </section>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>
</body>
</html>`
}

export function openPcmsFormPrint(form: PcmsFormState, options?: { valveId?: string }) {
  const preview = openPreviewWindow()
  const html = buildPcmsPrintHtml(form, options)
  return showHtmlPreview(html, preview)
}
