import jsLogo from '../assets/js-logo.png'
import type { ItpTravelerReportItem } from './itpTravelerReport'
import { openPreviewWindow, showHtmlPreview } from './printHtml'
import {
  JS_TRAVELER_DIAGRAM_BODY,
  JS_TRAVELER_DIAGRAM_LID,
  JS_TRAVELER_DIAGRAM_TRUNNION,
} from './jsTravelerReportArt'

// ---------------------------------------------------------------------------
// J-S QA/QC Traveler report (Twinseal).
// Prints traveler data in the layout of the report the old traveler site produced
// (docs/reference/Twinseal Traveler.pdf): same sections, labels and order.
//
// Fields are found by a stable key in the field id: "...jt_<step ref>_<label>", assigned by
// keyed("jt", ...) in scripts/generate-traveler-templates.py (entry T["i"]). Anything keyed jt_
// that this layout does not place is still printed under "Additional data", so nothing is lost.
// ---------------------------------------------------------------------------
const TITLE = 'J~S Machine and Valve QA/QC Traveler'
const KEY_PREFIX = 'jt_'

type Sections = Array<{ items: ItpTravelerReportItem[] }>
type Photo = { url: string; fileName: string; caption?: string; contentType?: string }
type Cell = { label: string; value: string; type: string; photos: Photo[]; step: string }

export type JsTravelerReportMeta = {
  valveId?: string | null
  customer?: string | null
  valveType?: string | null
  size?: string | null
  pressureClass?: string | null
  poNumber?: string | null
  dueDate?: string | null
  description?: string | null
  manufacturer?: string | null
  salesman?: string | null
  location?: string | null
}

export type JsTravelerReportPart = {
  partName: string
  partNumber?: string | null
  quantity?: number | null
  status?: string | null
  itpItemName?: string | null
  notes?: string | null
}

export type JsTravelerReportOptions = {
  meta?: JsTravelerReportMeta
  parts?: JsTravelerReportPart[]
  logoSrc?: string
  /** QR image (data URL) that opens this traveler, shown top right like the old report. */
  qrSrc?: string
  /** Builds the QR image; awaited after the preview tab is open. Used when qrSrc is not given. */
  loadQr?: () => Promise<string>
}

export function jsTravelerKeyFromFieldId(fieldId: string): string | null {
  const i = fieldId.indexOf(KEY_PREFIX)
  if (i < 0) return null
  if (fieldId.endsWith('__followup')) return null
  return fieldId.slice(i + KEY_PREFIX.length)
}

export function reportHasJsTravelerFields(sections: Sections): boolean {
  return sections.some((s) => s.items.some((it) => it.fields.some((f) => jsTravelerKeyFromFieldId(f.id))))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function fmtDate(value: string | null | undefined) {
  const t = String(value ?? '').trim()
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return iso ? `${Number(iso[2])}/${Number(iso[3])}/${iso[1]}` : t
}

function isImage(p: Photo) {
  if (p.contentType) return p.contentType.startsWith('image/')
  return !/\.pdf($|\?)/i.test(p.fileName || p.url)
}

type Ctx = {
  cells: Map<string, Cell>
  steps: Map<string, ItpTravelerReportItem>
  used: Set<string>
  meta: JsTravelerReportMeta
}

function collect(sections: Sections, meta: JsTravelerReportMeta): Ctx {
  const cells = new Map<string, Cell>()
  const steps = new Map<string, ItpTravelerReportItem>()
  for (const section of sections) {
    for (const item of section.items) {
      const stepKey = slug(item.ref || item.name)
      if (!steps.has(stepKey)) steps.set(stepKey, item)
      const followUps = new Map<string, string>()
      for (const f of item.fields) {
        if (f.id.endsWith('__followup') && f.value?.trim()) followUps.set(f.id.slice(0, -'__followup'.length), f.value.trim())
      }
      for (const f of item.fields) {
        const key = jsTravelerKeyFromFieldId(f.id)
        if (!key) continue
        let value = String(f.value ?? '').trim()
        const follow = followUps.get(f.id)
        if (follow) value = /^other$/i.test(value) || !value ? follow : `${value} - ${follow}`
        cells.set(key, {
          label: f.label,
          value,
          type: f.type ?? 'text',
          photos: (f.photos ?? []).map((p) => ({ url: p.url, fileName: p.fileName, caption: p.caption, contentType: p.contentType })),
          step: stepKey,
        })
      }
    }
  }
  return { cells, steps, used: new Set(), meta }
}

/** Value of a keyed field; marks it as placed. */
function v(c: Ctx, key: string) {
  c.used.add(key)
  return c.cells.get(key)?.value ?? ''
}

function kv(label: string, value: string, cls = '') {
  // Questions keep their question mark and take no colon, like the old report.
  const sep = label.trim().endsWith('?') ? '' : ':'
  return `<div class="kv ${cls}"><b>${esc(label)}${sep}</b> ${esc(value)}</div>`
}

function grid(cols: number, cells: string[]) {
  return `<div class="g g${cols}">${cells.join('')}</div>`
}

function bar(title: string, sub = false) {
  return `<div class="bar${sub ? ' sub' : ''}">${esc(title)}</div>`
}

function tech(c: Ctx, ...stepKeys: string[]) {
  const initials = Array.from(
    new Set(stepKeys.map((k) => c.steps.get(k)?.techInitials?.trim()).filter((x): x is string => Boolean(x))),
  ).join('/')
  return `<div class="tech"><span><b>Tech Initials:</b> ${esc(initials)}</span></div>`
}

function mapChoice(value: string, yes: string[], no: string[]) {
  const t = value.trim().toLowerCase()
  if (!t) return ''
  if (yes.some((y) => y.toLowerCase() === t)) return 'Yes'
  if (no.some((n) => n.toLowerCase() === t)) return 'No'
  return value
}

function qa(c: Ctx, keys: string[]) {
  return `<div class="qa">${keys
    .map((k) => {
      const cell = c.cells.get(k)
      const q = cell ? `${cell.label}?` : k
      return `<div class="q"><b>${esc(q)}</b><span>${esc(v(c, k))}</span></div>`
    })
    .join('')}</div>`
}

function stepKeys(c: Ctx, step: string) {
  return Array.from(c.cells.entries())
    .filter(([, cell]) => cell.step === step)
    .map(([key]) => key)
}

function stepHasData(c: Ctx, step: string) {
  const item = c.steps.get(step)
  if (!item) return false
  if (item.done || (item.photos?.length ?? 0) > 0) return true
  return stepKeys(c, step).some((k) => {
    const cell = c.cells.get(k)
    return Boolean(cell && (cell.value || cell.photos.length))
  })
}

/** Generic block for a step: every non-picture field as label: value. */
function stepBlock(c: Ctx, step: string, cols = 3) {
  const item = c.steps.get(step)
  if (!item) return ''
  const cells = stepKeys(c, step)
    .filter((k) => c.cells.get(k)?.type !== 'picture')
    .map((k) => kv(c.cells.get(k)!.label, v(c, k)))
  stepKeys(c, step).forEach((k) => c.used.add(k))
  const notes = item.notes?.trim() ? `<div class="kv wide"><b>Notes:</b> ${esc(item.notes.trim())}</div>` : ''
  return `<div class="blk">${bar(item.name, true)}<div class="box">${grid(cols, cells)}${notes}${tech(c, step)}</div></div>`
}

function photoGrid(photos: Photo[], big = false) {
  return `<div class="ph${big ? ' big' : ''}">${photos
    .map((p) =>
      isImage(p)
        ? `<figure><img src="${esc(p.url)}" alt=""/>${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`
        : `<figure class="doc"><a href="${esc(p.url)}">${esc(p.fileName || 'Document')}</a>${
            p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''
          }</figure>`,
    )
    .join('')}</div>`
}

function stepPhotos(c: Ctx, step: string): Photo[] {
  return (c.steps.get(step)?.photos ?? []).map((p) => ({
    url: p.url,
    fileName: p.fileName,
    caption: p.caption,
    contentType: p.contentType,
  }))
}

// ---------------------------------------------------------------------------
// Sections, in the order of the old report
// ---------------------------------------------------------------------------
function header(c: Ctx, logoSrc: string, qrSrc?: string) {
  const m = c.meta
  const type = v(c, 'basic_info_type') || m.valveType || ''
  const customer = v(c, 'basic_info_customer') || m.customer || ''
  const title = [type, m.valveId, customer].filter(Boolean).join(' - ')
  return `<header class="hd"><img class="logo" src="${esc(logoSrc)}" alt=""/><span class="ttl">${esc(TITLE)}</span>${
    qrSrc ? `<img class="qr" src="${esc(qrSrc)}" alt=""/>` : ''
  }</header><div class="job">${esc(title)}</div>`
}

function basicInfo(c: Ctx) {
  const m = c.meta
  const f = (key: string, fallback?: string | null) => v(c, `basic_info_${key}`) || String(fallback ?? '').trim()
  const cells = [
    kv('Valve Id', String(m.valveId ?? '')),
    kv('Type', f('type', m.valveType)),
    kv('Po Number', f('purchase_order', m.poNumber)),
    kv('Customer', f('customer', m.customer)),
    kv('Salesman', String(m.salesman ?? '')),
    kv('Manufacturer Sn', f('manufacturer_sn')),
    kv('Location', f('location_id', m.location)),
    kv('Manufacturer', f('manufacturer', m.manufacturer)),
    kv('Due Date', fmtDate(m.dueDate)),
    kv('Size', f('size', m.size)),
    kv('Pressure', f('pressure', m.pressureClass)),
    kv('Figure Number', f('figure_number')),
    kv('Drawing Number', f('drawing_number')),
    kv('Operator', f('operator')),
    kv('Valve Condition', f('valve_condition')),
    kv('End Connection', f('end_connection')),
    kv('Notes', f('notes', m.description)),
    kv('Customer Id', f('customer_id')),
  ]
  // Shown only when filled, like the old report.
  const optional: Array<[string, string]> = [
    ['Tag #', f('tag')],
    ['Accessories', f('accessories')],
    ['Junked Reason', f('junked_reason')],
    ['Modification Required', f('modification_required')],
    ['Modification Notes', f('modification_notes')],
  ]
  for (const [label, value] of optional) if (value) cells.push(kv(label, value))
  return `${bar('Basic information')}<div class="box">${grid(4, cells)}</div>`
}

function materialId(c: Ctx) {
  const parts: Array<[string, string]> = [
    ['Body', 'body'],
    ['Body Lining', 'body_lining'],
    ['Stem', 'stem'],
    ['Lids', 'lids'],
    ['Lid Groove', 'lid_groove'],
    ['Stem Overlay', 'stem_overlay'],
    ['Packing Gland', 'packing_gland'],
    ['Packing Area', 'packing_area'],
    ['PMI Required', 'pmi_required'],
  ]
  c.used.add('material_id_pmi_report')
  return `${bar('Material Identification')}<div class="box">${grid(
    4,
    parts.map(([label, key]) => kv(label, v(c, `material_id_${key}`))),
  )}</div><div class="note"><i>Before and After Images located at end of document.</i>${tech(c, 'basic_info', 'material_id')}</div>`
}

function valveSpecs(c: Ctx) {
  const p = (key: string) => v(c, `parts_record_${key}`)
  return `${bar('Valve Specifications')}${bar('Studs', true)}<div class="box">${grid(3, [
    kv('Studs Type', p('studs_type')),
    kv('Studs Size', p('studs_size')),
    kv('Studs Quantity', p('studs_quantity')),
  ])}</div>${bar('Slips', true)}<div class="box">${grid(4, [
    kv('Part #', p('slips_part')),
    kv('Material', p('slips_material')),
    kv('Condition', v(c, 'slips_slips')),
    kv('Notes', v(c, 'slips_slips_notes')),
  ])}</div>${bar('Soft Goods', true)}<div class="box">${grid(4, [
    kv('Part #', p('soft_goods_part')),
    kv('Material', p('soft_goods_material')),
  ])}${tech(c, 'parts_record')}</div>`
}

function criticalDimensions(c: Ctx) {
  const b = (key: string) => v(c, `body_insp_${key}`)
  const l = (key: string) => v(c, `lids_${key}`)
  const flanges = b('flanges')
  const bore = b('body_bore_lining')
  const lids = l('lids')
  return `${bar('Critical Dimensions')}<div class="box">
    <div class="dg"><img src="${JS_TRAVELER_DIAGRAM_BODY}" alt="" style="width:105px"/>${grid(2, [
      kv('Thickness of A', b('thickness_of_flange_a')),
      kv('Dimensions Acceptable?', mapChoice(flanges, ['Good'], ['Need facing'])),
      kv('Thickness of B', b('thickness_of_flange_b')),
      kv('Flanges', flanges),
      kv('Dimension of C', b('dimension_c')),
    ])}</div>
    ${grid(2, [kv('Is valve body free of defects?', b('is_valve_body_free_of_defects')), kv('What defects are found?', b('what_defects_are_found'))])}
    ${b('other_body_findings') ? kv('Other body findings', b('other_body_findings'), 'wide') : ''}
    <div class="dg"><img src="${JS_TRAVELER_DIAGRAM_LID}" alt="" style="width:150px"/></div>
    ${grid(3, [
      kv('A of top lid', l('a_of_top_lid')),
      kv('A of bottom lid', l('a_of_bottom_lid')),
      kv('Diameter of body bore', b('diameter_of_body_bore')),
      kv('B of top lid', l('b_of_top_lid')),
      kv('B of bottom lid', l('b_of_bottom_lid')),
      kv('Was body welded?', mapChoice(bore, ['Bad'], ['Good'])),
      kv('C of top lid', l('c_of_top_lid')),
      kv('C of bottom lid', l('c_of_bottom_lid')),
      kv('Body bore / lining', bore),
      kv('Top ORing groove width', l('top_o_ring_groove_width')),
      kv('Bottom ORing groove width', l('bottom_o_ring_groove_width')),
      kv('Lids', lids),
    ])}
    ${tech(c, 'body_insp', 'lids')}</div>`
}

function packingArea(c: Ctx) {
  const p = (key: string) => v(c, `packing_area_${key}`)
  const area = p('packing_area')
  const pin = p('drive_pin_hole')
  return `${bar('Packing Area')}<div class="box">${grid(2, [
    kv('Was packing area welded?', mapChoice(area, ['Need weld repair'], ['Good'])),
    kv('Packing area ID', p('packing_area_id')),
    kv('Was new packing gland used?', p('was_new_packing_gland_used')),
    kv('Packing area depth', p('packing_area_depth')),
  ])}
    <div class="dg"><img src="${JS_TRAVELER_DIAGRAM_TRUNNION}" alt="" style="width:190px"/></div>
    ${grid(4, [
      kv('Dimension A', p('dimension_a')),
      kv('Dimension B', p('dimension_b')),
      kv('Dimension C', p('dimension_c')),
      kv('Dimension D', p('dimension_d')),
    ])}
    ${grid(2, [
      kv('Is the drive pin hole acceptable?', mapChoice(pin, ['Acceptable'], ['Re-drill'])),
      kv('Was the drive pin hole re-drilled?', mapChoice(pin, ['Re-drill'], ['Acceptable'])),
      kv('Trunnion finish', p('trunnion_finish')),
      kv('Trunnion', p('trunnion')),
    ])}
    ${tech(c, 'packing_area')}</div>`
}

function dtr(c: Ctx) {
  const d = (key: string) => v(c, `dtr_${key}`)
  return `${bar('DTR Drilling')}<div class="box">${grid(4, [
    kv('Are DTR holes drilled?', d('are_dtr_holes_drilled')),
    kv('Are DTR holes in both ports?', d('are_dtr_holes_in_both_ports')),
    kv('Body DTR hole size', d('body_dtr_hole_size')),
    kv('Port DTR hole size', d('port_dtr_hole_size')),
  ])}${d('dtr_system') ? kv('DTR system', d('dtr_system'), 'wide') : ''}${tech(c, 'dtr')}</div>`
}

function torque(c: Ctx) {
  const t = (key: string) => v(c, `torque_${key}`)
  const unit = t('torque_unit')
  const withUnit = (value: string) => (value && unit && !/[a-z]/i.test(value) ? `${value} ${unit}` : value)
  return `${bar('Bolt Torque')}<div class="box">${grid(3, [
    kv('30%', withUnit(t('bolt_torque_30'))),
    kv('70%', withUnit(t('bolt_torque_70'))),
    kv('100%', withUnit(t('bolt_torque_100'))),
  ])}</div>${bar('Gasket Area', true)}<div class="box">${kv('Gasket Area Surface Finish', t('gasket_area_surface_finish'))}${tech(
    c,
    'torque',
  )}</div>`
}

const REPAIR_STEPS = [
  'face_flanges',
  'bore_as_found',
  'pre_machine',
  'bore_weld',
  'machine_2',
  'grind',
  'lids_weld',
  'lids_machine',
  'packing_area_weld',
  'packing_area_machine',
  'trunnion_weld',
  'trunnion_machine',
  'drive_pin',
  'rebond',
]

function repairs(c: Ctx) {
  const blocks = REPAIR_STEPS.filter((s) => stepHasData(c, s)).map((s) => stepBlock(c, s))
  // Steps that were never unlocked print nothing, but their keys still count as placed.
  REPAIR_STEPS.forEach((s) => stepKeys(c, s).forEach((k) => c.used.add(k)))
  if (!blocks.length) return ''
  return `${bar('Welding and Repair Records')}${blocks.join('')}`
}

function partsOrdered(parts: JsTravelerReportPart[]) {
  const rows = parts
    .map(
      (p) =>
        `<tr><td>${esc(String(p.quantity ?? ''))}</td><td>${esc(p.partName)}</td><td>${esc(p.partNumber ?? '')}</td><td>${esc(
          p.status ?? '',
        )}</td><td>${esc(p.notes ?? '')}</td></tr>`,
    )
    .join('')
  return `${bar('Parts Ordered')}<div class="box">${
    rows
      ? `<table class="pt"><thead><tr><th>Qty</th><th>Part</th><th>Part #</th><th>Status</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<div class="kv">&nbsp;</div>'
  }</div>`
}

function testing(c: Ctx) {
  const t = (key: string) => v(c, `test_${key}`)
  const row = (name: string, key: string) =>
    grid(4, [
      kv(`${name} Test Gauge`, t(`${key}_test_gauge`)),
      kv(`${name} Test Time`, t(`${key}_test_time`)),
      kv(`${name} Test Pressure`, t(`${key}_test_pressure`)),
      kv(`${name} Test Result`, t(`${key}_test_result`)),
    ]) + (t(`${key}_test_fail_reason`) ? kv(`${name} Test Reason`, t(`${key}_test_fail_reason`), 'wide') : '')
  const extras = ['methane', 'helium', 'cavity_relief'].filter((s) => stepHasData(c, s)).map((s) => stepBlock(c, s))
  ;['methane', 'helium', 'cavity_relief'].forEach((s) => stepKeys(c, s).forEach((k) => c.used.add(k)))
  ;['methane_test_required', 'helium_test_required', 'cavity_relief_test_required'].forEach((k) => c.used.add(`test_${k}`))
  return `${bar('Testing')}<div class="box">${grid(4, [
    kv('Test Procedure', t('test_procedure')),
    kv('Test Medium', t('test_medium')),
    kv('Chart Required', t('is_chart_required')),
    kv('Chart Time', t('chart_time')),
    kv('Chart Recorder Number', t('chart_recorder')),
  ])}${row('Low', 'low_pressure_seat')}${row('High', 'high_pressure_seat')}${row('Shell', 'shell')}${kv(
    'Paint Coverage Mills',
    v(c, 'shipping_paint_coverage_mils'),
  )}${tech(c, 'test')}</div>${extras.join('')}`
}

function qualityAssurance(c: Ctx) {
  const keysOf = (step: string) => stepKeys(c, step).filter((k) => c.cells.get(k)?.type === 'yes_no')
  const shipping = keysOf('shipping')
  const paintColor = v(c, 'shipping_paint_color')
  c.used.add('final_qc_qa_qc_documents')
  return `${bar('Quality Assurance')}<div class="box"><div class="qh">Test Area</div>${qa(c, keysOf('test_qa'))}${tech(
    c,
    'test_qa',
  )}</div><div class="box"><div class="qh">Shipping Area</div>${qa(c, shipping)}${
    paintColor ? kv('Paint color', paintColor) : ''
  }${tech(c, 'shipping')}</div>${bar('Final Inspection')}<div class="box">${qa(c, keysOf('final_qc'))}${tech(c, 'final_qc')}</div>`
}

function additionalData(c: Ctx) {
  const rows = Array.from(c.cells.entries()).filter(
    ([key, cell]) => !c.used.has(key) && cell.type !== 'picture' && cell.value,
  )
  if (!rows.length) return ''
  return `${bar('Additional data')}<div class="box">${grid(
    3,
    rows.map(([, cell]) => kv(cell.label, cell.value)),
  )}</div>`
}

function images(c: Ctx) {
  const out: string[] = []
  const before = stepPhotos(c, 'basic_info')
  const after = stepPhotos(c, 'shipping')
  out.push(`${bar('Before Images')}${before.length ? photoGrid(before) : '<div class="none">&nbsp;</div>'}`)
  // Other step photos (body after blast, test chart, ...) under their own step name.
  for (const [key, item] of c.steps) {
    if (key === 'basic_info' || key === 'shipping') continue
    const photos = stepPhotos(c, key)
    if (photos.length) out.push(`${bar(item.pictureLabel?.trim() || `${item.name} photos`)}${photoGrid(photos)}`)
  }
  out.push(`${bar('After Images')}${after.length ? photoGrid(after, true) : '<div class="none">&nbsp;</div>'}`)
  const docs: Photo[] = []
  for (const [, cell] of c.cells) {
    if (cell.type !== 'picture') continue
    for (const p of cell.photos) docs.push({ ...p, caption: p.caption || cell.label })
  }
  out.push(`${bar('QA/QC Documents')}${docs.length ? photoGrid(docs, true) : '<div class="none">&nbsp;</div>'}`)
  return out.join('')
}

// ---------------------------------------------------------------------------
// CSS (matches the old report: grey section bars, bordered boxes, bold labels)
// ---------------------------------------------------------------------------
const CSS = `
  @page { size: letter portrait; margin: 0.25in 0.3in; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #555; font-family: 'DejaVu Sans', Verdana, Geneva, Tahoma, sans-serif; font-size: 7.6pt; line-height: 1.35; }
  b { color: #444; }
  .hd { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 2px 0 6px; }
  .hd .logo { height: 62px; }
  .hd .ttl { font-size: 16.5pt; color: #333; }
  .hd .qr { height: 90px; }
  .job { font-size: 10pt; font-weight: 700; color: #444; margin: 0 0 1px; }
  .bar { background: #777; color: #fff; font-weight: 700; font-size: 9.5pt; padding: 1px 7px; margin-top: 1px; break-after: avoid; }
  .bar.sub { font-size: 9.5pt; }
  .box { border: 1.5px solid #222; padding: 3px 7px 2px; margin-bottom: 1px; break-inside: avoid; }
  .blk { break-inside: avoid; }
  .g { display: grid; column-gap: 8px; row-gap: 2px; align-items: start; }
  .g2 { grid-template-columns: repeat(2, 1fr); }
  .g3 { grid-template-columns: repeat(3, 1fr); }
  .g4 { grid-template-columns: repeat(4, 1fr); }
  .kv { padding: 1px 0; overflow-wrap: anywhere; }
  .kv.wide { grid-column: 1 / -1; }
  .note { display: flex; justify-content: space-between; align-items: center; font-size: 7pt; padding-left: 2px; }
  .note .tech { margin: 0; }
  .tech { display: flex; justify-content: flex-end; margin: 3px -7px -2px; }
  .tech span { background: #eee; padding: 2px 8px; min-width: 150px; }
  .dg { display: flex; gap: 14px; align-items: flex-start; padding: 2px 0; }
  .dg .g { flex: 1; }
  .qh { font-weight: 700; font-size: 9.5pt; text-decoration: underline; color: #444; margin: 0 0 6px; }
  .qa { display: grid; grid-template-columns: 1fr 1fr; column-gap: 10px; row-gap: 3px; }
  .q { break-inside: avoid; }
  .q b { display: block; }
  .q span { display: block; min-height: 1.2em; }
  table.pt { width: 100%; border-collapse: collapse; }
  table.pt th, table.pt td { text-align: left; padding: 1px 6px 1px 0; vertical-align: top; }
  .ph { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 4px 2px 6px; }
  .ph.big { grid-template-columns: 1fr; }
  .ph figure { margin: 0; break-inside: avoid; }
  .ph img { width: 100%; max-height: 4.6in; object-fit: contain; object-position: left top; display: block; }
  .ph.big img { max-height: 9.2in; }
  .ph figcaption { font-size: 7pt; padding-top: 1px; }
  .ph .doc { border: 1px solid #999; padding: 8px; }
  .none { min-height: 10px; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
`

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
function absoluteLogoUrl() {
  try {
    return new URL(jsLogo, window.location.origin).href
  } catch {
    return jsLogo
  }
}

export function loadJsLogoSrc(): Promise<string> {
  const url = absoluteLogoUrl()
  if (url.startsWith('data:')) return Promise.resolve(url)
  return fetch(url)
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('logo'))))
    .then(
      (blob) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => resolve(url)
          reader.readAsDataURL(blob)
        }),
    )
    .catch(() => url)
}

export function buildJsTravelerReportHtml(sections: Sections, options?: JsTravelerReportOptions) {
  const c = collect(sections, options?.meta ?? {})
  const logoSrc = options?.logoSrc ?? absoluteLogoUrl()
  const body = [
    header(c, logoSrc, options?.qrSrc),
    basicInfo(c),
    materialId(c),
    valveSpecs(c),
    criticalDimensions(c),
    packingArea(c),
    dtr(c),
    torque(c),
    repairs(c),
    partsOrdered(options?.parts ?? []),
    testing(c),
    qualityAssurance(c),
    additionalData(c),
    images(c),
  ].join('\n')
  const titleId = String(options?.meta?.valveId ?? '').trim() || 'Traveler'
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(TITLE)} - ${esc(titleId)}</title>
  <style>${CSS}</style>
</head>
<body>
${body}
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 400); });</script>
</body>
</html>`
}

/**
 * Opens the preview tab synchronously (iOS blocks window.open after an await), then loads the
 * logo as a data URL, builds the report and shows it.
 */
export async function openJsTravelerReportPrint(sections: Sections, options?: JsTravelerReportOptions) {
  const preview = openPreviewWindow()
  const logoSrc = options?.logoSrc ?? (await loadJsLogoSrc())
  let qrSrc = options?.qrSrc
  if (!qrSrc && options?.loadQr) {
    try {
      qrSrc = await options.loadQr()
    } catch {
      qrSrc = undefined
    }
  }
  const html = buildJsTravelerReportHtml(sections, { ...options, logoSrc, qrSrc })
  return showHtmlPreview(html, preview)
}
