import jsLogo from '../assets/js-logo.png'
import type { ItpTravelerReportItem } from './itpTravelerReport'
import { openPreviewWindow, showHtmlPreview } from './printHtml'
import { collectValveKeepValues, valveKeepKeyFromFieldId } from './valveKeepFields'

// ---------------------------------------------------------------------------
// Branding / labels (the reference form says VSI; we print J-S)
// ---------------------------------------------------------------------------
const COMPANY_NAME = 'J-S Machine & Valve'
const SHOP_ID_LABEL = 'JS Shop ID'
const COMMENT_LABEL = 'JS Comment'
const TITLE = 'Relief Valve Service Traveler'
const PAGE2_TITLE = 'Relief Device Service Traveler (Page 2)'

// ---------------------------------------------------------------------------
// Form constants (must match scripts/generate-traveler-templates.py, T["u"])
// ---------------------------------------------------------------------------
const YN = ['Yes', 'No']
const YNA = ['Yes', 'No', 'NA']

const COND_CODES = [
  'A- Good', 'B- Bent', 'C- Broken', 'D- Stm Cut', 'E- Cracked', 'F- Collapsed', 'G- Corroded Mild',
  'H- Corroded Severe', 'I- Deposits Light', 'J- Deposits Heavy', 'K- Eroded', 'L- Galled', 'M- Incorrect',
  'N- NonOEM', 'O- Missing', 'P- Out Of Tolerance', 'Q- Pitted', 'R- Plugged', 'S- Poor', 'T- Worn',
  'U- Scored', 'V- Leaks', "W- Req's Replacing", 'Y- Seized', 'e- Threads Stripped',
]
const WORK_CODES = [
  '0- Cleaned', '1- Replaced', '2- Machined/Lapped', '3- Machined', '4- Lapped', '5- Polish', '6- Left', '7- Repaired',
]
const REC_CODES = ['[- Replace Next Repair', ']- NDT/NDE Next Repair', '#- Replace ASAP', '*- Machine NOH']

const PARTS = [
  'Body', 'Bonnet/Yoke', 'Nozzle', 'Spring', 'Disc', 'Disc Holder', 'Guide', 'Spindle', 'Spindle Retainer', 'Cap',
  'Lever', 'Comp Screw', 'Upper ADJ Ring', 'Upper Ring Pin', 'Lower ADJ Ring', 'Lower Ring Pin', 'Bolts/Studs/Nuts',
  'Up Spring Washer', 'Low Spring Washer', 'Gasket Set', 'ORing', 'MFG Name Plate', 'Inlet Condition',
  'Inlet Flange Face', 'Outlet Condition', 'Out Flange Face', 'Bellows', 'Bug Vent', 'Disc Collar', 'Lift Stop',
  'Overlap Collar', 'Lift Washer', 'Thrust Bearing', 'Soft Goods Kit', 'Limit Washer',
]
const OTHER_PART_KEYS = ['other1', 'other2']

const DIMS = [
  'Nozzle Min', 'Noz Seat Step Min', 'Bore Dia. Min', 'Disc Min Thickness Min', 'Disc Inside Step Min',
  'Disc Outside Step Min', 'Disc Holder OD Min', 'Guide ID Max', 'Guide Clearances Max', 'Spindle Run Out',
  'Base Top to Nozz Max',
]

const DISPOSITIONS = ['OK To Proceed', 'NETR - Replaced', 'NETR - Scrapped']
const CLOSING_CHECKS: Array<[string, string]> = [
  ['VK Entry', 'chk_vk_entry'],
  ['Disassembled', 'chk_disassembled'],
  ['Plate Made', 'chk_plate_made'],
  ['Plate Checked', 'chk_plate_checked'],
  ['VR Stamped', 'chk_vr_stamped'],
  ['T/O Stamped', 'chk_to_stamped'],
  ['Valve Tagged', 'chk_valve_tagged'],
  ['Valve Sealed', 'chk_valve_sealed'],
]

// Step names that feed the photo pages (matched against lower-cased step names).
const AS_FOUND_STEPS = [/^receive valve/, /^disassemble and clean/]
const AS_LEFT_STEPS = [/^paint and prepare for shipping/]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Sections = Array<{ items: ItpTravelerReportItem[] }>
type Photo = { url: string; fileName: string }
type Shot = { url: string; caption: string }

export type ReliefValveServiceTravelerPrintOptions = {
  /** Used in the document title when the form has no JS Shop ID. */
  valveId?: string
  /** Logo `src` (ideally a data URL so it survives the blob: preview window). */
  logoSrc?: string
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/** "A- Good" -> "A", "[- Replace Next Repair" -> "[", "1- Replaced" -> "1". */
export function codeLetter(value: string | null | undefined): string {
  const t = String(value ?? '').trim()
  if (!t) return ''
  const m = t.match(/^(\S)\s*-/)
  return m ? m[1] : t
}

function fmtDate(value: string) {
  const t = value.trim()
  if (!t) return ''
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return iso ? `${iso[2]}/${iso[3]}/${iso[1]}` : t
}

/** Split "a / b" (or "a to b") into two values; a lone value goes in the first slot. */
function splitPair(value: string): [string, string] {
  const t = value.trim()
  if (!t) return ['', '']
  const m = t.split(/\s*\/\s*|\s+to\s+/i)
  return [m[0]?.trim() ?? '', m.slice(1).join(' / ').trim()]
}

function isYes(value: string) {
  return ['yes', 'y', 'true', '1', 'x'].includes(value.trim().toLowerCase())
}

function canon(s: string) {
  return s.trim().toLowerCase().replace(/[\s./]/g, '')
}

/** Index of the option the value selects, or -1. Yes/No also accepts Y/N/true/false. */
function matchChoice(value: string, options: string[]) {
  let c = canon(value)
  if (!c) return -1
  const opts = options.map(canon)
  if (opts.includes('yes')) {
    if (c === 'y' || c === 'true' || c === '1') c = 'yes'
    else if (c === 'n' || c === 'false' || c === '0') c = 'no'
  }
  return opts.indexOf(c)
}

/** Print every choice; bold/underline/circle the selected one. */
function choices(value: string, options: string[]) {
  const sel = matchChoice(value, options)
  const items = options.map((o, i) => `<span class="ch${i === sel ? ' on' : ''}">${esc(o)}</span>`)
  // A value that isn't one of the choices is still shown (selected) so data is never lost.
  if (value.trim() && sel < 0) items.push(`<span class="ch on">${esc(value.trim())}</span>`)
  return items.join(' ')
}

function box(on: boolean) {
  return `<span class="cb${on ? ' on' : ''}"></span>`
}

/** Text value inside an underline; empty prints as a blank line. */
function ln(value: string, cls = '') {
  return `<span class="ln${cls ? ` ${cls}` : ''}">${value.trim() ? esc(value.trim()) : '&nbsp;'}</span>`
}

/** Label + underline value. */
function line(label: string, value: string, cls = '') {
  return `<div class="f${cls ? ` ${cls}` : ''}"><span class="l">${esc(label)}</span>${ln(value)}</div>`
}

/** Label + prebuilt HTML (choices, checkboxes, split values). */
function lineHtml(label: string, html: string, cls = '') {
  return `<div class="f${cls ? ` ${cls}` : ''}"><span class="l">${esc(label)}</span>${html}</div>`
}

function lineChoices(label: string, value: string, options: string[]) {
  return lineHtml(label, `<span class="c">${choices(value, options)}</span>`)
}

function lineBox(label: string, value: string) {
  return `<div class="f">${box(isYes(value))}<span class="l">${esc(label)}</span></div>`
}

function band(title: string) {
  return `<div class="band">${esc(title)}</div>`
}

function paginate<T>(items: T[], weight: (item: T) => number, capacity: number): T[][] {
  const pages: T[][] = []
  let cur: T[] = []
  let used = 0
  for (const item of items) {
    const w = weight(item)
    if (cur.length && used + w > capacity) {
      pages.push(cur)
      cur = []
      used = 0
    }
    cur.push(item)
    used += w
  }
  if (cur.length) pages.push(cur)
  return pages
}

// ---------------------------------------------------------------------------
// Logo (blob: preview windows cannot resolve relative asset URLs)
// ---------------------------------------------------------------------------
let logoPromise: Promise<string> | null = null

function absoluteLogoUrl() {
  try {
    return new URL(jsLogo, window.location.href).href
  } catch {
    return jsLogo
  }
}

/** Fetch the J-S logo as a data URL; falls back to an absolute URL when fetch fails. */
export function loadJsLogoSrc(): Promise<string> {
  if (jsLogo.startsWith('data:')) return Promise.resolve(jsLogo)
  if (!logoPromise) {
    logoPromise = fetch(jsLogo)
      .then((res) => {
        if (!res.ok) throw new Error(`logo ${res.status}`)
        return res.blob()
      })
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(blob)
          }),
      )
      .catch(() => {
        logoPromise = null
        return absoluteLogoUrl()
      })
  }
  return logoPromise
}

// ---------------------------------------------------------------------------
// Page 1
// ---------------------------------------------------------------------------
function page1(g: (key: string) => string, logoSrc: string) {
  const [rangeFrom, rangeTo] = splitPair(g('spring_range'))
  const lift = g('lift')
  let liftA = lift
  let liftB = g('lift_rl')
  if (!liftB.trim() && lift.includes('/')) [liftA, liftB] = splitPair(lift)

  const header = `<header class="hd">
    <div class="hd-l"><img class="logo" src="${esc(logoSrc)}" alt="" /><div class="co">${esc(COMPANY_NAME)}</div></div>
    <div class="hd-c">
      <div class="ttl">${esc(TITLE)}</div>
      <div>Hazardous Service: ${choices(g('hazardous_service'), ['Y', 'N'])}</div>
    </div>
    <div class="hd-r">
      ${line('Owner', g('owner'))}
      ${line('Plant', g('plant'))}
      ${line('Traveler Type', g('traveler_type'))}
      <div class="f"><span class="l red">Due Date</span><span class="ln red">${fmtDate(g('due_date')) ? esc(fmtDate(g('due_date'))) : '&nbsp;'}</span></div>
      ${lineChoices('Field Service', g('field_service'), YN)}
    </div>
  </header>`

  const idBlock = `<div class="g3">
    ${line(SHOP_ID_LABEL, g('shop_id'))}
    ${line('Customer PO', g('customer_po'))}
    ${line('Tag Number', g('tag_number'))}
    ${line('Equip. Location', g('equip_location'))}
    ${line('Work Performed', g('work_performed'))}
    ${line('Unit / Vessel', g('unit_vessel'))}
    ${line('SAP / Asset', g('sap_asset'))}
  </div>`

  const valveData = `${band('Valve Data')}
  <div class="g4">
    ${line('Manufacturer', g('manufacturer'))}
    ${line('Service', g('service'))}
    ${line('Model Number', g('model_number'))}
    ${line('S/N', g('serial_number'))}
  </div>
  <div class="g3">
    <div>
      ${line('Valve Size', g('valve_size'))}
      ${line('Set Pressure', g('set_pressure'))}
      ${line('Capacity', g('capacity'))}
      ${line('Dual NP Capacity', g('dual_np_capacity'))}
      ${line("Req'd Code", g('reqd_code'))}
      ${line('Temperature', g('temperature'))}
      ${lineHtml('Lift / RL', `${box(isYes(g('restricted_lift')))}${ln(liftA, 's')}<span>/</span>${ln(liftB, 's')}`)}
      ${line('Cold Diff Set', g('cold_diff_set'))}
    </div>
    <div>
      ${line('Inlet', g('inlet'))}
      ${line('Orifice Desg.', g('orifice_desg'))}
      ${line('Body Material', g('body_material'))}
      ${line('Bonnet Material', g('bonnet_material'))}
      ${line('Bellows Material', g('bellows_material'))}
      ${line('Spring Number', g('spring_number'))}
      ${line('Spring Material', g('spring_material'))}
      ${line('Back Pressure', g('back_pressure'))}
    </div>
    <div>
      ${line('Outlet', g('outlet'))}
      ${line('Orifice Area', g('orifice_area'))}
      ${line('Trim Material', g('trim_material'))}
      ${line('Soft Seat Material', g('soft_seat_material'))}
      ${line('Cap Type', g('cap_type'))}
      ${lineHtml('From / To', `${ln(rangeFrom, 's')}<span>/</span>${ln(rangeTo, 's')}`)}
    </div>
  </div>`

  const plates = `<div class="g3 plates">
    <div class="bx">
      <h4>Original Nameplate</h4>
      ${lineChoices("XXX'ed Out?", g('onp_xxxed_out'), YN)}
      ${line('Model Number', g('onp_model_number'))}
      ${line('Set Pressure', g('onp_set_pressure'))}
      ${line('Temperature', g('onp_temperature'))}
      ${line('Capacity', g('onp_capacity'))}
      ${line('CDTP', g('onp_cdtp'))}
      ${line('Code Stamp', g('onp_code_stamp'))}
      ${line('Assembled By & Date/Code', g('onp_assembled_by'))}
      ${line('BP', g('onp_bp'))}
    </div>
    <div class="bx">
      <h4>Previous Repair Nameplate</h4>
      ${line('Model Number', g('prn_model_number'))}
      ${line('Set Pressure', g('prn_set_pressure'))}
      ${line('Temperature', g('prn_temperature'))}
      ${line('Capacity', g('prn_capacity'))}
      ${line('CDTP', g('prn_cdtp'))}
      ${line('Repaired By', g('prn_repaired_by'))}
      ${line('Prev VR #', g('prn_prev_vr_no'))}
      ${line('I.D.#', g('prn_id_no'))}
      ${line('BP', g('prn_bp'))}
      ${line('Prev Repair Date', fmtDate(g('prn_repair_date')))}
      ${lineChoices('Prev VR Stamp', g('prn_vr_stamp'), YN)}
    </div>
    <div class="bx">
      <h4>Previous Test Only Plate</h4>
      ${line('PTO Company', g('pto_company'))}
      ${line('PTO Date', fmtDate(g('pto_date')))}
      ${line('PTO ID#', g('pto_id'))}
      ${lineChoices('Prev T/O Stamp', g('pto_stamp'), YN)}
      ${line('Prev T/O Set', g('pto_set'))}
    </div>
  </div>`

  const received = `${band('Received Data')}
  <div class="g2">
    ${line('DUE DATE', fmtDate(g('due_date')))}
    ${line('Date Received', fmtDate(g('date_received')))}
    ${line('Work Performed', g('work_performed'))}
    ${line('Received By', g('received_by'))}
    ${lineChoices('As Found Condition', g('as_found_condition'), ['Good', 'Fair', 'Dirty', 'New'])}
    ${lineChoices('Nameplate', g('nameplate_status'), ['Original', 'Dup', 'Miss', 'Illegible'])}
    ${lineChoices('Set Press Changed', g('set_press_changed'), YN)}
    ${lineChoices('Special Cleaning', g('special_cleaning'), YN)}
    ${lineChoices('Conversion', g('conversion'), YN)}
    ${lineChoices('Seal', g('seal_status'), ['Intact', 'Broke', 'Missing'])}
  </div>`

  const pretest = `${band('Pre-Test Data')}
  <div class="g2">
    ${lineChoices('Pretest', g('pretest'), YN)}
    ${lineHtml('Popped @', `${ln(g('popped_at'), 's')}<span>PSIG</span>`)}
    ${line('Back Pressure Test', g('back_pressure_test'))}
    ${line('Bellows Test', g('bellows_test'))}
    ${line('Pretest By', g('pretest_by'))}
    ${lineHtml('Leak Test', `${ln(g('leak_test'), 's')}<span>@</span>${ln(g('leak_test_at'), 's')}`)}
  </div>
  ${lineChoices('Leak Rate', g('leak_rate'), ['Tight', 'BPM', 'Moderate', 'Excessive'])}
  ${lineHtml('Pretest Comments', ln(g('pretest_comments'), 'pre'))}`

  const dimRows = DIMS.map((d) => {
    const k = slug(d)
    return `<tr><th>${esc(d)}</th>${(['found', 'mfg', 'mach', 'shipped'] as const)
      .map((c) => `<td>${ln(g(`cd_${k}_${c}`))}</td>`)
      .join('')}</tr>`
  }).join('')

  const disDim = `<div class="g2 dd">
    <div>
      ${band('Disassembly')}
      ${line('Compression Screw', g('dis_compression_screw'))}
      ${line('Upper Ring', g('dis_upper_ring'))}
      ${line('Lower Ring', g('dis_lower_ring'))}
      ${line('Inspected By', g('dis_inspected_by'))}
      ${line('Instrument #', g('dis_instrument_no'))}
      ${line('As Rec - Spring #', g('dis_as_rec_spring_no'))}
      ${line('As Rec - Spring Range', g('dis_as_rec_spring_range'))}
    </div>
    <div>
      ${band('Critical Dimensions')}
      <table class="tb">
        <thead><tr><th></th><th>As Found</th><th>Mfg</th><th>Mach. By</th><th>As Shipped</th></tr></thead>
        <tbody>${dimRows}</tbody>
      </table>
    </div>
  </div>`

  return `<section class="sheet">
    ${header}
    ${idBlock}
    ${valveData}
    ${plates}
    ${received}
    ${pretest}
    ${disDim}
    <footer class="ft"><span>Page 1 of 2</span></footer>
  </section>`
}

// ---------------------------------------------------------------------------
// Page 2
// ---------------------------------------------------------------------------
function page2(g: (key: string) => string, logoSrc: string) {
  const partRow = (key: string, label: string) => {
    const cells = (['cond', 'cond2', 'work', 'rec'] as const)
      .map((c) => `<td><span class="code">${esc(codeLetter(g(`pd_${key}_${c}`)) || '')}</span></td>`)
      .join('')
    return `<tr><th>${label}</th>${cells}</tr>`
  }
  const partRows =
    PARTS.map((p) => partRow(slug(p), esc(p))).join('') +
    OTHER_PART_KEYS.map((k) => partRow(k, `<span class="ln">${esc(g(`pd_${k}_name`).trim()) || '&nbsp;'}</span>`)).join('')

  const partsDetails = `<table class="tb parts">
    <thead><tr><th>Parts Details</th><th colspan="4">Cond. Code / WK / Rec</th></tr></thead>
    <tbody>${partRows}</tbody>
  </table>`

  const legend = (title: string, items: string[], cols: number) =>
    `<div class="lg"><h4>${esc(title)}</h4><div class="lg-g" style="column-count:${cols}">${items
      .map((i) => `<div>${esc(i)}</div>`)
      .join('')}</div></div>`

  const legends = `<div class="legends">
    ${legend('Condition Codes', COND_CODES, 2)}
    <div>
      ${legend('Work Codes', WORK_CODES, 1)}
      ${legend('Recommendations', REC_CODES, 1)}
    </div>
  </div>`

  const dispIdx = matchChoice(g('disposition'), DISPOSITIONS)
  const disposition = `<div class="disp">
    ${DISPOSITIONS.map((d, i) => `<span class="dchk">${box(i === dispIdx)} ${esc(d)}</span>`).join('')}
    ${lineHtml('By', ln(g('disposition_by'), 's'))}
    ${lineHtml('Date', ln(fmtDate(g('disposition_date')), 's'))}
  </div>`

  const assembly = `${band('Assembly')}
  <div class="g2">
    ${lineBox('Nozzle Tight', g('asm_nozzle_tight'))}
    ${lineChoices('Bellows Tight', g('asm_bellows_tight'), YNA)}
    ${lineChoices('Disc Collar -2', g('asm_disc_collar'), YNA)}
    ${lineBox('Bonnet Tight', g('asm_bonnet_tight'))}
    ${lineBox('Required Gaskets Installed', g('asm_gaskets_installed'))}
  </div>
  ${lineHtml('Up Adj. Ring - Set', `${ln(g('asm_up_adj_ring_set'), 's')}<span class="c">${choices(g('asm_up_adj_ring_unit'), ['Turns', 'Notches', 'Inches', 'NA'])}</span>`)}
  ${lineHtml('Low Adj. Ring Set', `${ln(g('asm_low_adj_ring_set'), 's')}<span class="c">${choices(g('asm_low_adj_ring_unit'), ['Turns', 'Notches', 'NA'])}</span>`)}
  ${lineHtml('Overlap Collar Set & Sealed', ln(g('asm_overlap_collar')))}`

  const pdescRows = [1, 2, 3, 4, 5, 6]
    .map(
      (i) =>
        `<tr><th>${i}</th><td>${ln(g(`pdesc_${i}_name`))}</td><td>${ln(g(`pdesc_${i}_number`))}</td><td>${ln(g(`pdesc_${i}_heat`))}</td></tr>`,
    )
    .join('')
  const pdesc = `${band('Parts Description')}
  <table class="tb pd"><thead><tr><th></th><th>Part Name</th><th>Part Number</th><th>Heat #</th></tr></thead><tbody>${pdescRows}</tbody></table>
  <div class="g2">
    ${line('Torque Wrench #', g('torque_wrench_no'))}
    ${line('Assembled By', g('assembled_by'))}
    ${line('Cleaned', g('cleaned'))}
    ${line('Machined', g('machined'))}
    ${line('Lapped', g('lapped'))}
    ${line('Instrument Used', g('instrument_used'))}
    ${line('Painted', g('painted'))}
  </div>`

  const testRow = (label: string, press: string, reseat: string) =>
    `<tr><th>${esc(label)}</th><td>${ln(g(press))}</td><td>${ln(g(reseat))}</td></tr>`
  const testData = `${band('Test Data')}
  <div class="g2">
    ${line('Set Pressure', g('test_set_pressure'))}
    ${line('CDTP', g('test_cdtp'))}
    ${line('BP', g('test_bp'))}
    ${line('Suggested BD', g('suggested_bd'))}
    ${line('Test Stand ID', g('test_stand_id'))}
    ${line('ALD Equip ID', g('ald_equip_id'))}
    ${line('Load Cell #', g('load_cell_no'))}
  </div>
  ${lineChoices('Test Method', g('test_method'), ['Bench', 'ALD', 'H/L', 'N2', 'Live', 'Inline'])}
  ${lineChoices('Test Media', g('test_media'), ['Air', 'Water', 'Steam', 'N2'])}
  <table class="tb tp">
    <thead><tr><th></th><th>Test Press</th><th>Reseat Pressure</th></tr></thead>
    <tbody>
      ${testRow('1st', 'test1_press', 'test1_reseat')}
      ${testRow('2nd', 'test2_press', 'test2_reseat')}
      ${testRow('3rd', 'test3_press', 'test3_reseat')}
      ${testRow('Final', 'final_test_press', 'final_reseat')}
    </tbody>
  </table>
  ${lineHtml('Leakage Rate', `${ln(g('leakage_rate'), 's')}<span>@</span>${ln(g('leakage_rate_at'), 's')}`)}
  ${line('Measured Lift', g('measured_lift'))}
  ${lineHtml('BP Test', `<span class="c">${choices(g('bp_test'), YNA)}</span><span>@</span>${ln(g('bp_test_at'), 's')}`)}
  <div class="g2">
    ${line('Cust Gauge Cal', fmtDate(g('cust_gauge_cal')))}
    ${line('Gauge 1 S/N', g('gauge1_sn'))}
    ${line('Date Tested', fmtDate(g('date_tested')))}
    ${line('Tested By', g('tested_by'))}
    ${line('Witnessed By', g('witnessed_by'))}
  </div>`

  const closing = `<div class="g4 chk">
    ${CLOSING_CHECKS.map(([label, key]) => lineChoices(label, g(key), YNA)).join('')}
  </div>
  <div class="g3">
    ${lineBox("Reset Only: X'd MFG Plate", g('reset_only_xd_plate'))}
    ${line('Final Insp / QC', g('final_insp_qc'))}
    ${line('Packed By', g('packed_by'))}
  </div>`

  const header = `<header class="hd2">
    <div class="hd2-l"><img class="logo sm" src="${esc(logoSrc)}" alt="" /><b>${esc(PAGE2_TITLE)}</b></div>
    <div class="hd2-r">
      ${line('Tag Number', g('tag_number'))}
      ${line(`${SHOP_ID_LABEL} #`, g('shop_id'))}
      ${line('S/N', g('serial_number'))}
    </div>
  </header>`

  return `<section class="sheet">
    ${header}
    <div class="p2">
      <div class="p2-l">${partsDetails}</div>
      <div class="p2-r">
        ${disposition}
        ${legends}
        ${assembly}
        ${pdesc}
        ${testData}
      </div>
    </div>
    ${closing}
    ${lineHtml('Cust Notes', ln(g('cust_notes'), 'pre tall'))}
    ${lineHtml('Comments', ln(g('comments'), 'pre tall'))}
    ${lineHtml(COMMENT_LABEL, ln(g('js_comment'), 'pre tall'))}
    <footer class="ft"><span>Page 2 of 2</span></footer>
  </section>`
}

// ---------------------------------------------------------------------------
// Page 3+ (J-S additions: photos and any other js_ values)
// ---------------------------------------------------------------------------
function photoHeader(g: (key: string) => string, title: string) {
  return `<header class="phd">
    <b>${esc(COMPANY_NAME)} - ${esc(TITLE)}</b>
    <span>${esc(g('tag_number') ? `Tag ${g('tag_number')}` : '')} ${esc(g('shop_id') ? `${SHOP_ID_LABEL} ${g('shop_id')}` : '')}</span>
    <span class="pt">${esc(title)}</span>
  </header>`
}

function shotFigure(shot: Shot) {
  return `<figure><div class="im"><img src="${esc(shot.url)}" alt="${esc(shot.caption)}" /></div><figcaption>${esc(shot.caption)}</figcaption></figure>`
}

type ReplacedPart = { name: string; found: Shot[]; left: Shot[] }

function replacedRow(part: ReplacedPart) {
  const side = (title: string, shots: Shot[]) =>
    `<div class="side"><h5>${esc(title)}</h5><div class="shots">${
      shots.length ? shots.map(shotFigure).join('') : '<div class="none">No photo</div>'
    }</div></div>`
  return `<div class="rp"><h4>${esc(part.name)}</h4><div class="rp-g">${side('As-Found', part.found)}${side('As-Left', part.left)}</div></div>`
}

function photoPages(
  g: (key: string) => string,
  sections: Sections,
  collected: ReturnType<typeof collectValveKeepValues>,
  startPage: number,
) {
  const { values, photos, stepPhotos } = collected

  // Original-case step names, keyed like collectValveKeepValues' stepPhotos.
  const stepNames = new Map<string, string>()
  for (const section of sections) {
    for (const item of section.items) stepNames.set(item.name.trim().toLowerCase(), item.name.trim())
  }
  const stepShots = (patterns: RegExp[]): Shot[] => {
    const out: Shot[] = []
    for (const re of patterns) {
      for (const [key, list] of Object.entries(stepPhotos)) {
        if (!re.test(key)) continue
        const caption = stepNames.get(key) ?? key
        for (const p of list as Photo[]) out.push({ url: p.url, caption })
      }
    }
    return out
  }

  const partName = (k: string) => {
    const known = PARTS.find((p) => slug(p) === k)
    if (known) return known
    const typed = values[`vk_pd_${k}_name`]?.trim()
    return typed || `Other part ${k.replace(/^other/, '')}`.trim()
  }

  // Per-part photos from js_pd_<part>_found / _left.
  const partKeys: string[] = []
  for (const key of Object.keys(photos)) {
    const m = key.match(/^js_pd_([a-z0-9_]+)_(found|left)$/)
    if (m && !partKeys.includes(m[1])) partKeys.push(m[1])
  }
  const partShots = (k: string, which: 'found' | 'left'): Shot[] =>
    ((photos[`js_pd_${k}_${which}`] ?? []) as Photo[]).map((p) => ({ url: p.url, caption: partName(k) }))
  const replaced: ReplacedPart[] = []
  const otherPartShots: Shot[] = []
  for (const k of partKeys) {
    const isReplaced = canon(values[`vk_pd_${k}_work`] ?? '').startsWith('1')
    if (isReplaced) {
      replaced.push({ name: partName(k), found: partShots(k, 'found'), left: partShots(k, 'left') })
    } else {
      otherPartShots.push(...partShots(k, 'found'), ...partShots(k, 'left'))
    }
  }

  // Other js_ fields that carry a text value.
  const extras: Array<[string, string]> = []
  for (const section of sections) {
    for (const item of section.items) {
      for (const field of item.fields) {
        const key = valveKeepKeyFromFieldId(field.id)
        if (!key || !key.startsWith('js_') || key.startsWith('js_pd_')) continue
        if (field.type === 'picture' || !field.value?.trim()) continue
        extras.push([field.label, field.value.trim()])
      }
    }
  }

  const asFound = stepShots(AS_FOUND_STEPS)
  const asLeft = stepShots(AS_LEFT_STEPS)
  const pages: Array<{ title: string; body: string }> = []

  const gridPages = (title: string, shots: Shot[]) => {
    paginate(shots, () => 1, 6).forEach((chunk, i, all) => {
      pages.push({
        title: all.length > 1 ? `${title} (${i + 1} of ${all.length})` : title,
        body: `<div class="pg">${chunk.map(shotFigure).join('')}</div>`,
      })
    })
  }

  gridPages('As-Found Photos', asFound)
  paginate(replaced, (r) => Math.max(1, Math.ceil(Math.max(r.found.length, r.left.length) / 2)), 3).forEach(
    (chunk, i, all) => {
      pages.push({
        title: all.length > 1 ? `Replaced Parts (${i + 1} of ${all.length})` : 'Replaced Parts',
        body: chunk.map(replacedRow).join(''),
      })
    },
  )
  gridPages('As-Left Photos', asLeft)
  gridPages('Other Part Photos', otherPartShots)
  if (extras.length) {
    pages.push({
      title: 'Additional J-S Information',
      body: `<table class="tb ex"><tbody>${extras
        .map(([label, value]) => `<tr><th>${esc(label)}</th><td class="pre">${esc(value)}</td></tr>`)
        .join('')}</tbody></table>`,
    })
  }

  return pages
    .map(
      (p, i) => `<section class="sheet photo">
    ${photoHeader(g, p.title)}
    <div class="pbody">${p.body}</div>
    <footer class="ft"><span>Page ${startPage + i}</span></footer>
  </section>`,
    )
    .join('\n')
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------
const CSS = `
    @page { size: letter portrait; margin: 0.35in 0.4in; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; font-size: 8px; line-height: 1.15; }
    .sheet { page-break-after: always; break-after: page; display: flex; flex-direction: column; }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
    .sheet > * { flex: 0 0 auto; }
    .ft { margin-top: auto; padding-top: 4px; font-size: 8px; text-align: right; }

    .f { display: flex; align-items: baseline; gap: 3px; min-height: 11px; margin: 0; min-width: 0; }
    .l { font-weight: 700; white-space: nowrap; }
    .l.red, .ln.red { color: #c00; }
    .ln { flex: 1 1 auto; border-bottom: 1px solid #000; min-height: 10px; padding: 0 2px; min-width: 14px; overflow-wrap: anywhere; }
    .ln.s { flex: 1 1 24px; min-width: 24px; }
    .ln.pre { white-space: pre-wrap; }
    .ln.tall { min-height: 22px; }
    .c { white-space: nowrap; }
    .ch { padding: 0 3px; margin-right: 1px; color: #444; }
    .ch.on { font-weight: 700; color: #000; text-decoration: underline; border: 1px solid #000; border-radius: 8px; }
    .cb { display: inline-block; width: 8px; height: 8px; border: 1px solid #000; vertical-align: -1px; background: #fff; }
    .cb.on { background: linear-gradient(45deg, transparent 40%, #000 40%, #000 60%, transparent 60%), linear-gradient(-45deg, transparent 40%, #000 40%, #000 60%, transparent 60%); }

    .g2, .g3, .g4 { display: grid; column-gap: 10px; }
    .g2 { grid-template-columns: 1fr 1fr; }
    .g3 { grid-template-columns: 1fr 1fr 1fr; }
    .g4 { grid-template-columns: repeat(4, 1fr); }
    .band { background: #d9d9d9; font-weight: 700; font-size: 9px; padding: 1px 4px; margin: 4px 0 2px; text-transform: uppercase; letter-spacing: 0.02em; }

    .hd { display: grid; grid-template-columns: 1.1fr 1.2fr 1.1fr; gap: 10px; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 3px; align-items: start; }
    .hd-l { display: flex; align-items: center; gap: 6px; }
    .logo { height: 34px; width: auto; display: block; }
    .logo.sm { height: 22px; }
    .co { font-size: 11px; font-weight: 700; }
    .hd-c { text-align: center; }
    .ttl { font-size: 14px; font-weight: 700; margin-bottom: 4px; }

    .plates { margin-top: 4px; align-items: start; }
    .bx { border: 1px solid #000; padding: 2px 4px 3px; }
    .bx h4 { margin: 0 0 2px; font-size: 8.5px; text-transform: uppercase; }
    .dd { margin-top: 0; align-items: start; }

    table.tb { width: 100%; border-collapse: collapse; }
    table.tb th, table.tb td { padding: 0 2px; vertical-align: bottom; text-align: left; font-weight: 400; }
    table.tb thead th { font-weight: 700; text-align: center; font-size: 7.5px; }
    table.tb tbody th { font-weight: 700; white-space: nowrap; font-size: 7.5px; }
    table.tb td .ln { display: block; }

    .hd2 { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; border-bottom: 2px solid #000; padding-bottom: 3px; margin-bottom: 3px; }
    .hd2-l { display: flex; align-items: center; gap: 6px; font-size: 11px; }
    .hd2-r { display: grid; grid-template-columns: repeat(3, auto); gap: 0 10px; }
    .p2 { display: grid; grid-template-columns: 0.36fr 0.64fr; gap: 10px; align-items: start; }
    table.parts { border: 1px solid #000; }
    table.parts thead th { border-bottom: 1px solid #000; }
    table.parts tbody th { padding-right: 4px; width: 1%; }
    table.parts td { text-align: center; width: 15px; }
    .code { display: block; border: 1px solid #000; min-width: 15px; height: 11px; text-align: center; font-weight: 700; line-height: 10px; }
    table.parts td { padding: 0 1px; }
    table.parts tbody tr { height: 14px; }
    .disp { display: flex; flex-wrap: wrap; gap: 2px 10px; align-items: baseline; border: 1px solid #000; padding: 2px 4px; }
    .disp .f { min-width: 70px; }
    .legends { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; font-size: 7.5px; }
    .lg h4 { margin: 0 0 1px; font-size: 8px; text-decoration: underline; }
    .lg-g { column-gap: 8px; }
    .lg-g div { break-inside: avoid; }
    table.pd td, table.pd th { padding: 0 2px; }
    table.tp { width: 70%; margin: 2px 0; }
    .chk { margin-top: 6px; border-top: 1px solid #000; padding-top: 3px; }

    .phd { display: flex; justify-content: space-between; gap: 10px; border-bottom: 2px solid #000; padding-bottom: 3px; margin-bottom: 6px; font-size: 9px; }
    .phd .pt { font-weight: 700; font-size: 11px; }
    .pbody { min-height: 9in; }
    .pg { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; }
    figure { margin: 0; break-inside: avoid; }
    .im { height: 2.65in; border: 1px solid #999; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .im img { max-width: 100%; max-height: 100%; object-fit: contain; }
    figcaption { font-size: 8px; padding-top: 1px; }
    .rp { margin-bottom: 8px; break-inside: avoid; }
    .rp h4 { margin: 0 0 2px; font-size: 10px; background: #d9d9d9; padding: 1px 4px; }
    .rp-g { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .side h5 { margin: 0 0 2px; font-size: 8.5px; }
    .shots { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
    .shots .im { height: 1.9in; }
    .none { color: #777; font-style: italic; padding: 6px 0; }
    table.ex th { width: 30%; padding: 2px 4px; border-bottom: 1px solid #ccc; font-size: 9px; vertical-align: top; }
    table.ex td { padding: 2px 4px; border-bottom: 1px solid #ccc; font-size: 9px; }
    .pre { white-space: pre-wrap; }

    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
`

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function buildReliefValveServiceTravelerPrintHtml(
  sections: Sections,
  options?: ReliefValveServiceTravelerPrintOptions,
) {
  const collected = collectValveKeepValues(sections)
  const g = (key: string) => collected.values[`vk_${key}`] ?? ''
  const logoSrc = options?.logoSrc ?? absoluteLogoUrl()
  const titleId = options?.valveId?.trim() || g('shop_id') || g('tag_number') || 'Traveler'

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(TITLE)} - ${esc(titleId)}</title>
  <style>${CSS}</style>
</head>
<body>
  ${page1(g, logoSrc)}
  ${page2(g, logoSrc)}
  ${photoPages(g, sections, collected, 3)}
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body>
</html>`
}

/**
 * Opens the preview tab synchronously (iOS blocks window.open after an await), then loads the
 * logo as a data URL, builds the form and shows it.
 */
export async function openReliefValveServiceTravelerPrint(
  sections: Sections,
  options?: ReliefValveServiceTravelerPrintOptions,
) {
  const preview = openPreviewWindow()
  const logoSrc = options?.logoSrc ?? (await loadJsLogoSrc())
  const html = buildReliefValveServiceTravelerPrintHtml(sections, { ...options, logoSrc })
  return showHtmlPreview(html, preview)
}
