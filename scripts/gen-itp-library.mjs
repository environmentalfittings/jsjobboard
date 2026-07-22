import fs from 'node:fs'

const { LIB, TEMPLATES } = JSON.parse(fs.readFileSync('_extracted_lib.json', 'utf8'))

const header = `/**
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

`

const helpers = `
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
    const k = \`repair:\${fam}\`
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
`

const body =
  header +
  'export const ITP_LIBRARY: ItpLibrarySection[] = ' +
  JSON.stringify(LIB, null, 2) +
  ' as ItpLibrarySection[]\n\n' +
  'export const ITP_LIBRARY_TEMPLATES: Record<string, string[]> = ' +
  JSON.stringify(TEMPLATES, null, 2) +
  '\n' +
  helpers

fs.writeFileSync('src/constants/itpLibrary.ts', body)
console.log('wrote src/constants/itpLibrary.ts', body.length)
