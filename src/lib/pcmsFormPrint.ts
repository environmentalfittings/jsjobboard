import { openPreviewWindow, showHtmlPreview } from './printHtml'
import {
  PCMS_PART_NAMES,
  type PcmsFormState,
  type PcmsPartName,
} from './pcmsForm'
import { PHILLIPS66_PONCA_PNG, POWERED_BY_PCMS_PNG } from './pcmsFormPrintAssets'

/** Work-performed legend codes from the customer RV-1958 / Crystal PCMS form (page 2). */
const WORK_PERFORMED_LEGEND = [
  '(N/A)',
  'BACK PRESSURE TESTED',
  'BLAST',
  'BLAST & PAINT',
  'BLAST & POLISH',
  'BLAST & POLISH/LAPPED',
  'CLEAN',
  'CLEAN & BLAST',
  'CLEAN & LAP',
  'CLEAN & MACHINE',
  'CLEAN & PAINT',
  'CLEAN & POLISH',
  'CLEAN & REPLACED ORING',
  'CLEAN & TESTED',
  'CLEAN, BLAST & POLISH',
  'CLEAN, LAP & BLAST',
  'CLEAN, LAP & MACHINE',
  'CLEAN, LAP & POLISH',
  'CLEAN, LAP, MACHINE & POLISH',
  'CLEAN, MACHINE & POLISH',
  'CLEAN, PAINT & BLAST',
  'CLEANED, PAINT, LAPPED SEATS',
  'CRACKED / PITTED / REPLACED',
  'CUT - LAPPED',
  'DRILLED & TAPPED BONNET',
  'INSTALL NEW',
  'LAP',
  'LAP & MACHINE',
  'M/V KIT INSTALLED',
  'M/V KIT P/N MORK73V022',
  'M/V O-RING KIT INSTALLED',
  'MACHINE',
  'MACHINED & POLISHED',
  'MAIN VALVE & PILOT VALVE',
  'MAIN VAVLE SOFT GOODS KIT',
  'MARKED/LAPPED',
  'NEW VALVE',
  'NOZZLE',
  'OK',
  'PAINTED',
  'PILOT "O" RINGS BAD',
  'PITTED, REPLACED',
  'PLASTIC TRAPPED BETWEEN DISC &',
  'POLISH',
  'POLISH & LAPPED',
  'POLISH/MACHINE/LAPPED',
  'PRESSURE CHANGE REPLACE W/0385CR',
  'PRESSURE CHANGED REPLACED 0405CR',
  'RECONDITIONED',
  'REINSTALLED',
  'REJECT',
  'REPAIRED & PAINTED',
  'Replaced',
  'RESET POP PRESSURE',
  'RPLCE NEXT TIME, WAS IN TOLERANC',
  'RUSTY',
  'RUSTY/POLISHED',
  'SHOULD BE REPLACED NEXT TIME',
  'SOME PITTING (LIGHT)',
  'STUCK',
  'STUCK, CLEAN',
  'TEFLON COATED',
  'TEST AND SET ONLY',
  'TEST ONLY',
  'TESTED & CLEANED',
  'UPGRADED TO INC 625',
  'VALVE PASSED PRETEST',
  'VITON',
] as const

const CONDITION_LEGEND = [
  '(N/A)',
  'CR-H',
  'CR-L',
  'CR-M',
  'CR-N',
  'CR-O',
  'Dpst-H',
  'Dpst-L',
  'Dpst-M',
  'Dpst-N',
  'DPST-O',
] as const

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Crystal report uses blank underlines when empty — keep a non-breaking space for line height. */
function val(value: string | null | undefined) {
  const t = String(value ?? '').trim()
  return t ? escapeHtml(t) : ''
}

/** MM/DD/YYYY to match the RV-1958 example. */
function fmtDate(value: string | null | undefined) {
  const t = String(value ?? '').trim()
  if (!t) return ''
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`
  const d = new Date(`${t}T12:00:00`)
  if (Number.isNaN(d.getTime())) return escapeHtml(t)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${mm}/${dd}/${yyyy}`
}

function box(on: boolean) {
  return `<span class="cb${on ? ' on' : ''}" aria-hidden="true"></span>`
}

function ynBoxes(value: '' | 'yes' | 'no' | 'na', allowNa = false) {
  const yes = value === 'yes'
  const no = value === 'no'
  const na = value === 'na'
  return `${box(yes)}&nbsp;YES&nbsp;&nbsp;&nbsp;${box(no)}&nbsp;NO${
    allowNa ? `&nbsp;&nbsp;&nbsp;${box(na)}&nbsp;N/A` : ''
  }`
}

function lineField(labelHtml: string, value: string, unit = '', wide = false) {
  const unitHtml = unit ? `<span class="unit">${escapeHtml(unit)}</span>` : ''
  return `<div class="lf${wide ? ' wide' : ''}"><span class="lbl">${labelHtml}</span><span class="uline">${value || '&nbsp;'}</span>${unitHtml}</div>`
}

function partRow(form: PcmsFormState, name: PcmsPartName) {
  const row = form.parts[name]
  const cell = (s: string) => `<td><span class="cell-line">${val(s) || '&nbsp;'}</span></td>`
  return `<tr>
    <th scope="row">${escapeHtml(name)}</th>
    ${cell(row.primaryCondition)}
    ${cell(row.secondaryCondition)}
    ${cell(row.workPerformed)}
    ${cell(row.recommendation)}
    ${cell(row.priorRecommendation)}
  </tr>`
}

function pageHeader(form: PcmsFormState) {
  const report = fmtDate(form.reportDate) || '&nbsp;'
  const test = fmtDate(form.testRepairDate)
  const testDisplay = test || '&nbsp;/&nbsp;&nbsp;&nbsp;/&nbsp;'
  const sp = val(form.spNumber)
  const rv = val(form.rvNumber)
  const spDisplay = sp || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'
  const rvDisplay = rv || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'
  return `<header class="sheet-header">
    <div class="hdr-left">
      <img class="logo-p66" src="${PHILLIPS66_PONCA_PNG}" alt="Phillips 66 Ponca City Refinery" />
      <div class="doc-id"><span class="doc-id-part">${spDisplay}</span> &gt; <span class="doc-id-part">${rvDisplay}</span></div>
    </div>
    <div class="hdr-center">
      <div class="sheet-title">Partial Filled Test/Repair Data Form</div>
    </div>
    <div class="hdr-right">
      <div>Report Date: <span class="hdr-date">${report}</span></div>
      <div class="hdr-test">Test/Repair Date: <span class="hdr-date">${testDisplay}</span></div>
    </div>
  </header>`
}

function pageFooter(page: number) {
  return `<footer class="sheet-footer">
    <div class="page-no">Page ${page} of 3</div>
    <img class="logo-pcms" src="${POWERED_BY_PCMS_PNG}" alt="Powered by PCMS" />
  </footer>`
}

function workLegendGrid() {
  // Row-major 4-column grid (matches the Crystal / RV-1958 page-2 layout).
  return `<div class="work-grid">${WORK_PERFORMED_LEGEND.map((item) => `<div>${escapeHtml(item)}</div>`).join('')}</div>`
}

export function buildPcmsPrintHtml(form: PcmsFormState, options?: { valveId?: string }) {
  const titleId = options?.valveId?.trim() || form.shopNo || form.controlNo || 'PCMS'
  const partsRows = PCMS_PART_NAMES.map((name) => partRow(form, name)).join('')
  const pluggedPct = val(form.visualPluggedPct)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>PCMS RV-1958 — ${escapeHtml(titleId)}</title>
  <style>
    @page { size: letter; margin: 0.4in 0.45in 0.35in; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9.5px;
      line-height: 1.2;
    }
    .sheet {
      position: relative;
      min-height: 9.6in;
      page-break-after: always;
      display: flex;
      flex-direction: column;
    }
    .sheet:last-child { page-break-after: auto; }
    .sheet-body { flex: 1 1 auto; }

    .sheet-header {
      display: grid;
      grid-template-columns: 150px 1fr 170px;
      align-items: start;
      gap: 8px;
      margin-bottom: 6px;
    }
    .logo-p66 { width: 92px; height: auto; display: block; }
    .doc-id { font-weight: 700; font-size: 11px; margin-top: 4px; white-space: nowrap; }
    .doc-id-part {
      display: inline-block;
      min-width: 4.2em;
      border-bottom: 1px solid #000;
      text-align: center;
      padding: 0 2px;
    }
    .sheet-title {
      text-align: center;
      font-size: 15px;
      font-weight: 600;
      padding-top: 6px;
      letter-spacing: 0.01em;
    }
    .hdr-right {
      text-align: right;
      font-size: 10px;
      padding-top: 4px;
      line-height: 1.45;
    }
    .hdr-test { margin-top: 10px; }
    .hdr-date { font-weight: 400; }

    .band {
      background: #d7ebff;
      border: none;
      padding: 3px 6px;
      font-weight: 700;
      font-size: 11px;
      letter-spacing: 0.02em;
      margin: 6px 0 4px;
      color: #000;
    }
    .band-stack {
      line-height: 1.3;
      padding-top: 4px;
      padding-bottom: 4px;
    }
    .band-stack div { font-size: 11px; font-weight: 700; }

    .lf {
      display: flex;
      align-items: baseline;
      gap: 4px;
      margin: 1px 0;
      min-height: 13px;
    }
    .lf .lbl {
      flex: 0 0 auto;
      text-align: right;
      font-weight: 700;
      white-space: nowrap;
    }
    .lf .uline {
      flex: 1 1 auto;
      border-bottom: 1px solid #000;
      min-height: 12px;
      padding: 0 2px 1px;
      min-width: 28px;
    }
    .lf .unit { flex: 0 0 auto; margin-left: 2px; }
    .lf.wide .lbl { min-width: 88px; }

    .cb {
      display: inline-block;
      width: 9px;
      height: 9px;
      border: 1px solid #000;
      vertical-align: -1px;
      background: #fff;
    }
    .cb.on {
      background:
        linear-gradient(45deg, transparent 42%, #000 42%, #000 58%, transparent 58%),
        linear-gradient(-45deg, transparent 42%, #000 42%, #000 58%, transparent 58%);
    }

    /* —— Page 1: Relief valve data —— */
    .rvd {
      display: grid;
      grid-template-columns: 1.15fr 1fr 0.95fr;
      gap: 2px 10px;
      margin-top: 2px;
    }
    .rvd .col { min-width: 0; }
    .rvd .desc { grid-column: 1 / -1; }
    .rvd .desc .lbl { min-width: 88px; }
    .io-box {
      border: 1px solid #000;
      margin-top: 6px;
      padding: 3px 4px 4px;
      font-size: 9px;
    }
    .io-box table { width: 100%; border-collapse: collapse; }
    .io-box th { font-weight: 700; text-align: center; padding: 1px 2px; }
    .io-box td { padding: 1px 2px; vertical-align: bottom; }
    .io-box .io-lbl { font-weight: 700; width: 42px; }
    .io-box .io-val {
      border-bottom: 1px solid #000;
      min-width: 36px;
      text-align: center;
      padding: 0 2px;
    }
    .io-box .io-unit { width: 22px; }

    .pretest {
      display: grid;
      grid-template-columns: 1fr 1.15fr 1fr;
      gap: 4px 12px;
      margin-top: 2px;
    }
    .pretest h4 {
      margin: 0 0 3px;
      font-size: 9.5px;
      font-weight: 700;
    }
    .chk-list { margin: 0; padding: 0; list-style: none; }
    .chk-list li { margin: 2px 0; }
    .pretest-bottom {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 8px 16px;
      margin-top: 6px;
    }
    .seal-title { font-weight: 700; margin-bottom: 2px; }

    table.parts {
      width: 100%;
      border-collapse: collapse;
      margin-top: 2px;
      font-size: 9px;
    }
    table.parts th, table.parts td {
      border: none;
      padding: 1px 3px;
      vertical-align: bottom;
      text-align: left;
      font-weight: 400;
    }
    table.parts thead th {
      font-weight: 700;
      text-align: center;
      font-size: 8.5px;
      padding-bottom: 2px;
    }
    table.parts tbody th {
      text-align: left;
      font-weight: 700;
      width: 78px;
      white-space: nowrap;
      padding-right: 6px;
    }
    table.parts .cell-line {
      display: block;
      border-bottom: 1px solid #000;
      min-height: 12px;
      padding: 0 2px 1px;
    }
    .parts-comments { margin-top: 4px; }

    /* —— Page 2 —— */
    .legend-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 4px 0 8px;
      flex-wrap: wrap;
    }
    .legend-btn {
      display: inline-block;
      border: 1px solid #7aa0c4;
      background: #e8f2fc;
      color: #1e4e79;
      font-weight: 700;
      font-size: 10px;
      padding: 2px 10px;
      border-radius: 2px;
    }
    .legend-codes {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 14px;
      font-size: 9.5px;
    }
    .section-label { font-weight: 700; margin: 6px 0 3px; font-size: 10px; }
    .work-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1px 10px;
      font-size: 8px;
      line-height: 1.35;
      margin-bottom: 6px;
    }
    .rec-row {
      display: flex;
      gap: 28px;
      font-size: 9.5px;
      margin-bottom: 8px;
    }
    .qa-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 4px 12px;
      margin: 4px 0 8px;
    }
    .final-grid {
      display: grid;
      grid-template-columns: 1.1fr 1.1fr 0.9fr;
      gap: 6px 14px;
      margin-top: 4px;
    }
    .final-grid h4 {
      margin: 0 0 4px;
      font-size: 10px;
      font-weight: 700;
    }
    .shop-row {
      display: grid;
      grid-template-columns: 1.2fr 1.1fr 0.8fr;
      gap: 10px;
      margin-top: 10px;
    }
    .comments-block { margin-top: 8px; }
    .comments-block .uline-tall {
      display: block;
      border-bottom: 1px solid #000;
      min-height: 14px;
      margin-top: 4px;
    }

    /* —— Page 3 —— */
    .checklist-intro {
      background: #d7ebff;
      padding: 6px 8px;
      margin: 4px 0 8px;
    }
    .checklist-intro .title {
      font-weight: 700;
      font-size: 12px;
      text-transform: uppercase;
    }
    .checklist-intro .who {
      font-style: italic;
      margin-top: 2px;
      font-size: 9.5px;
    }
    .field-examiner {
      font-size: 9.5px;
      margin: 0 0 14px;
      line-height: 1.35;
      max-width: 95%;
    }
    .subhead {
      font-weight: 700;
      text-transform: uppercase;
      text-decoration: underline;
      margin: 14px 0 8px;
      font-size: 11px;
    }
    .q-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
      margin: 7px 0;
      font-size: 9.5px;
    }
    .q-row .answers {
      white-space: nowrap;
      font-size: 9.5px;
      min-width: 140px;
      text-align: left;
    }
    .note { font-size: 9.5px; margin: 8px 0; }
    .eng-note { font-weight: 700; margin: 16px 0 8px; font-size: 10px; }
    .rule { border: none; border-top: 2px solid #000; margin: 10px 0 0; }

    .sheet-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 10px;
      padding-top: 4px;
    }
    .page-no { font-size: 10px; }
    .logo-pcms { height: 28px; width: auto; }

    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <!-- ===================== PAGE 1 ===================== -->
  <section class="sheet">
    <div class="sheet-body">
      ${pageHeader(form)}
      <div class="band">RELIEF VALVE DATA</div>
      <div class="rvd">
        <div class="desc">${lineField('Description:', val(form.description), '', true)}</div>
        <div class="col">
          ${lineField('Asset No:', val(form.assetNo))}
          ${lineField('Manufacturer:', val(form.manufacturer))}
          ${lineField('Governing Code:', val(form.governingCode))}
          ${lineField('Spring Number:', val(form.springNumber))}
          ${lineField('Orifice Designation:', val(form.orificeDesignation))}
          ${lineField('CDTP:', val(form.cdtp), 'psi')}
          ${lineField('Set Pressure:', val(form.setPressure), 'psi')}
          ${lineField('Super Imposed Back (Constant', val(form.backPressureConstant), 'psi')}
          ${lineField('Super Imposed Back (Variable)', val(form.backPressureVariable), 'psi')}
          ${lineField('Built-Up Back Pressure:', val(form.builtUpBackPressure), 'psi')}
          ${lineField('Relieving Temperature:', val(form.relievingTemperature))}
        </div>
        <div class="col">
          ${lineField('Serial No:', val(form.serialNo))}
          ${lineField('Model No:', val(form.modelNo))}
          ${lineField('Shop No:', val(form.shopNo))}
          ${lineField('Free Height:', val(form.freeHeight))}
          ${lineField('Orifice Size:', val(form.orificeSize), 'in²')}
          ${lineField('Required Capacity:', val(form.requiredCapacity))}
          ${lineField('Calculated Capacity:', val(form.calculatedCapacity))}
          ${lineField('Rated Capacity:', val(form.ratedCapacity))}
          ${lineField('Nozzle Ring Set:', val(form.nozzleRingSet))}
          ${lineField('Guide Ring Set:', val(form.guideRingSet))}
        </div>
        <div class="col">
          ${lineField('Fluid State:', val(form.fluidState))}
          ${lineField('Test Medium:', val(form.testMedium))}
          ${lineField('Max Test Pressure:', val(form.maxTestPressure), 'psi')}
          <div class="lf"><span class="lbl">Range ():</span><span class="uline">${val(form.springRangeFrom) || '&nbsp;'}</span><span class="unit">To</span><span class="uline">${val(form.springRangeTo) || '&nbsp;'}</span></div>
          <div class="io-box">
            <table>
              <thead>
                <tr><th></th><th>INLET</th><th></th><th>OUTLET</th><th></th></tr>
              </thead>
              <tbody>
                <tr>
                  <td class="io-lbl">Size:</td>
                  <td class="io-val">${val(form.inletSize) || '&nbsp;'}</td>
                  <td class="io-unit">in</td>
                  <td class="io-val">${val(form.outletSize) || '&nbsp;'}</td>
                  <td class="io-unit">in</td>
                </tr>
                <tr>
                  <td class="io-lbl">Rating:</td>
                  <td class="io-val">${val(form.inletRating) || '&nbsp;'}</td>
                  <td class="io-unit">psi</td>
                  <td class="io-val">${val(form.outletRating) || '&nbsp;'}</td>
                  <td class="io-unit">psi</td>
                </tr>
                <tr>
                  <td class="io-lbl">Type:</td>
                  <td class="io-val" colspan="2">${val(form.inletType) || '&nbsp;'}</td>
                  <td class="io-val" colspan="2">${val(form.outletType) || '&nbsp;'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="band">PRETEST DATA</div>
      <div class="pretest">
        <div>
          <h4>Visual Inspection</h4>
          <ul class="chk-list">
            <li>${box(form.visualDirty)}&nbsp;&nbsp;Dirty</li>
            <li>${box(form.visualSealsIntact)}&nbsp;&nbsp;Seals Intact</li>
            <li>${box(form.visualDisassembled)}&nbsp;&nbsp;Disassembled</li>
            <li>${box(form.visualBrokenSpring)}&nbsp;&nbsp;Broken Spring</li>
            <li>${box(form.visualPlugged)}&nbsp;&nbsp;Plugged (%) <span class="uline" style="display:inline-block;min-width:36px;border-bottom:1px solid #000">${pluggedPct || '&nbsp;'}</span></li>
          </ul>
        </div>
        <div>
          <h4>Pop Result</h4>
          ${lineField('Valve CDTP Pressure:', val(form.valveCdtpPressure), 'psi')}
          ${lineField('Initial Pop Pressure:', val(form.initialPopPressure), 'psi')}
          ${lineField('Repop Pressure:', val(form.repopPressure), 'psi')}
          ${lineField('Leak Pressure:', val(form.leakPressure), 'psi')}
          ${lineField('Reseat Pressure:', val(form.reseatPressure), 'psi')}
        </div>
        <div>
          <h4>No Pop Result</h4>
          <ul class="chk-list">
            <li>${box(form.noPopLeakedTooBad)}&nbsp;&nbsp;Leaked too Bad to Pop</li>
            <li>${box(form.noPopStuck)}&nbsp;&nbsp;Stuck (Max Pressure Used)</li>
          </ul>
          ${lineField('Lift:', val(form.lift))}
          ${lineField('Blowdown:', val(form.blowdown))}
          <div style="margin-top:4px">${box(form.tightAfterReseat)}&nbsp;&nbsp;Tight After Reseat</div>
        </div>
      </div>
      <div class="pretest-bottom">
        <div>
          <div class="seal-title">Seal Tight Test</div>
          ${lineField('Pressure:', val(form.sealTightPressure), 'psi')}
          ${lineField('Leak Rate:', val(form.sealTightLeakRate))}
          <div class="lf" style="margin-top:6px"><span class="lbl">Comments:</span><span class="uline">${val(form.pretestComments) || '&nbsp;'}</span></div>
        </div>
        <div>
          <div style="margin-bottom:4px">${box(form.passFailOverride)}&nbsp;&nbsp;Pass/Fail Override</div>
          ${lineField('Result:', val(form.passFailResult))}
          ${lineField('Reason:', val(form.passFailReason))}
        </div>
      </div>

      <div class="band">PARTS</div>
      <table class="parts">
        <thead>
          <tr>
            <th></th>
            <th>Primary Condition</th>
            <th>Secondary Condition</th>
            <th>Work Performed</th>
            <th>Recommendation</th>
            <th>Prior Recommendation</th>
          </tr>
        </thead>
        <tbody>${partsRows}</tbody>
      </table>
      <div class="parts-comments lf"><span class="lbl">Comments:</span><span class="uline">${val(form.partsComments) || '&nbsp;'}</span></div>
    </div>
    ${pageFooter(1)}
  </section>

  <!-- ===================== PAGE 2 ===================== -->
  <section class="sheet">
    <div class="sheet-body">
      ${pageHeader(form)}
      <div class="legend-row">
        <span class="legend-btn">Legend</span>
        <strong>Condition:</strong>
        <div class="legend-codes">${CONDITION_LEGEND.map((c) => `<span>${escapeHtml(c)}</span>`).join('')}</div>
      </div>

      <div class="section-label">Work Performed:</div>
      ${workLegendGrid()}

      <div class="section-label">Recommendation:</div>
      <div class="rec-row">
        <span>(N/A)</span>
        <span>Replace Next Repair</span>
        ${form.recommendation && form.recommendation !== '(N/A)' && form.recommendation !== 'Replace Next Repair'
          ? `<span>${escapeHtml(form.recommendation)}</span>`
          : ''}
      </div>

      <div class="band band-stack"><div>FINAL TEST</div><div>QA/QC</div></div>
      <div class="qa-grid">
        <div>${box(form.qaSpringFreeHeight)}&nbsp;&nbsp;Measured Spring Free Height</div>
        <div>${box(form.qaDiskSinglePiece)}&nbsp;&nbsp;Disk (Single Piece)</div>
        <div>${box(form.qaOpenTopAdjustingBolt)}&nbsp;&nbsp;Open Top Adjusting Bolt</div>
        <div>${box(form.qaSpringNoVerified)}&nbsp;&nbsp;Spring No. Verified</div>
        <div>${box(form.qaCautionTag)}&nbsp;&nbsp;Caution Tag Affixed</div>
        <div>${box(form.qaLeadSeals)}&nbsp;&nbsp;Lead Seals &amp; Tag Affixed</div>
        <div>${box(form.qaCodeStamp)}&nbsp;&nbsp;Code Stamp Verified</div>
      </div>

      <div class="final-grid">
        <div>
          <h4>Final Settings</h4>
          ${lineField('Set:', val(form.finalSet), 'psi')}
          ${lineField('CDTP:', val(form.finalCdtp), 'psi')}
          ${lineField('Back:', val(form.finalBack), 'psi')}
          ${lineField('Reseat:', val(form.finalReseat), 'psi')}
          ${lineField('Vacuum:', val(form.finalVacuum), 'psi')}
          ${lineField('Nozzle Ring Setting:', val(form.finalNozzleRing))}
          ${lineField('Guide Ring Setting:', val(form.finalGuideRing))}
        </div>
        <div>
          <h4>Test Info</h4>
          ${lineField('Seat Test Pressure:', val(form.seatTestPressure), 'psi')}
          ${lineField('Test Medium:', val(form.finalTestMedium))}
          ${lineField('Guage Serial No:', val(form.gaugeSerialNo))}
        </div>
        <div>
          <h4>&nbsp;</h4>
          ${lineField('Leak Rate:', val(form.finalLeakRate))}
          ${lineField('Calibration Date:', fmtDate(form.gaugeCalibrationDate))}
        </div>
      </div>

      <div class="section-label">Valve Shop Info</div>
      <div class="shop-row">
        ${lineField('Valve Repair Shop:', val(form.valveRepairShop))}
        ${lineField('Representative:', val(form.representative))}
        ${lineField('Control No:', val(form.controlNo))}
      </div>
      <div class="comments-block">
        <strong>Comments:</strong>
        <span class="uline-tall">${val(form.finalComments) || '&nbsp;'}</span>
        <span class="uline-tall">&nbsp;</span>
        <span class="uline-tall">&nbsp;</span>
      </div>
    </div>
    ${pageFooter(2)}
  </section>

  <!-- ===================== PAGE 3 ===================== -->
  <section class="sheet">
    <div class="sheet-body">
      ${pageHeader(form)}
      <div class="checklist-intro">
        <div class="title">PRV Removal/Installation Checklist</div>
        <div class="who">This section to be filled out by the Area Mechanical Engineer, RTS Engineer, or Field Examiner.</div>
      </div>
      <p class="field-examiner">
        The Field Examiner works with the Area or RTS Engineer for examining inlet &amp; outlet nozzles of the Relief Valve as well as the
        inlet &amp; outlet piping. "Field Examiner" includes, but not limited to Pipefitter, TA Coordinator, Inspector, or Inspection Technician.
      </p>

      <div class="subhead">PRV Removal</div>
      ${lineField('Name of Person Performing Visual Checks:', val(form.removalPerson))}
      ${lineField('PRV Removal Date:', fmtDate(form.removalDate))}
      <div class="q-row">
        <div>Condition of the PRV <strong>Inlet</strong> Piping is:</div>
        <div class="answers">
          ${box(form.inletPipingClear)}&nbsp;Clear&nbsp;&nbsp;&nbsp;
          ${box(Boolean(form.inletPipingPluggedPct.trim()))}&nbsp;<span class="uline" style="display:inline-block;min-width:28px;border-bottom:1px solid #000">${val(form.inletPipingPluggedPct) || '&nbsp;'}</span>% ID Plugged
        </div>
      </div>
      <div class="q-row">
        <div>Condition of the PRV <strong>Outlet</strong> Piping is:</div>
        <div class="answers">
          ${box(form.outletPipingClear)}&nbsp;Clear&nbsp;&nbsp;&nbsp;
          ${box(Boolean(form.outletPipingPluggedPct.trim()))}&nbsp;<span class="uline" style="display:inline-block;min-width:28px;border-bottom:1px solid #000">${val(form.outletPipingPluggedPct) || '&nbsp;'}</span>% ID Plugged
        </div>
      </div>
      <p class="note">If fouled/plugged please describe further in the comment section below.</p>

      <div class="subhead">PRV Installation</div>
      ${lineField('Name of Person Performing Visual Checks:', val(form.installPerson))}
      ${lineField('PRV Installation Date:', fmtDate(form.installDate))}

      <div class="q-row">
        <div>Does the <u><strong>SAP tag#</strong></u> on the PRV match the <u><strong>ASSET#</strong></u> at the top of this form?</div>
        <div class="answers">${ynBoxes(form.sapTagMatchesAsset)}</div>
      </div>
      <div class="q-row">
        <div>Does the set pressure on the <u><strong>PRV Data Plate</strong></u> match the set pressure at the <u><strong>top of this form</strong></u>?</div>
        <div class="answers">${ynBoxes(form.dataPlateMatchesForm)}</div>
      </div>
      <div class="q-row">
        <div>Does the set pressure on the <u><strong>PRV Data Plate</strong></u> match the set pressure on the <u><strong>PTP</strong></u> AND the <u><strong>P&amp;ID</strong></u>?</div>
        <div class="answers">${ynBoxes(form.dataPlateMatchesPtp)}</div>
      </div>
      <div class="q-row">
        <div>Is the PRV in the proper location in the field?</div>
        <div class="answers">${ynBoxes(form.properLocation)}</div>
      </div>
      <div class="q-row">
        <div>No blinds, closed valves, or piping obstructions are present that would prevent proper function of the PRV?</div>
        <div class="answers">${ynBoxes(form.noObstructions)}</div>
      </div>
      <div class="q-row">
        <div>Bonnet vents on bellows-style PRVs are open &amp; have a protective elbow fitting with screen pointing down?</div>
        <div class="answers">${ynBoxes(form.bonnetVentsOk, true)}</div>
      </div>
      <div class="q-row">
        <div>Drain holes on atmospheric PRV vent stacks are free of corrosion and not plugged?</div>
        <div class="answers">${ynBoxes(form.drainHolesOk, true)}</div>
      </div>

      <div class="comments-block">
        <strong>Comments:</strong> (Please list any adverse conditions)
        <span class="uline-tall">${val(form.fieldComments) || '&nbsp;'}</span>
        <span class="uline-tall">&nbsp;</span>
      </div>
      <div class="lf" style="margin-top:10px;max-width:360px">
        <span class="lbl"><strong>MOC#:</strong> (If applicable)</span>
        <span class="uline">${val(form.mocNumber) || '&nbsp;'}</span>
      </div>
      <p class="eng-note">Area or RTS Engineer to review and send the completed form to the Data Governance Group.</p>
      <hr class="rule" />
    </div>
    ${pageFooter(3)}
  </section>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body>
</html>`
}

export function openPcmsFormPrint(form: PcmsFormState, options?: { valveId?: string }) {
  const preview = openPreviewWindow()
  const html = buildPcmsPrintHtml(form, options)
  return showHtmlPreview(html, preview)
}
