import type { ItpMeasFieldDef } from '../types/itpMeasFields'
import type { ItpTravelerReportField, ItpTravelerReportItem } from './itpTravelerReport'

/** Stable ValveKeep / J-S key from a field id (`trv_u_05_vk_pd_body_work` → `vk_pd_body_work`). */
export function valveKeepKeyFromFieldId(fieldId: string): string | null {
  const id = String(fieldId ?? '')
  const vk = id.match(/(?:^|_)(vk_[a-z0-9_]+)$/i)
  if (vk) return vk[1].toLowerCase()
  const js = id.match(/(?:^|_)(js_[a-z0-9_]+)$/i)
  if (js) return js[1].toLowerCase()
  return null
}

export function planHasValveKeepFields(
  items: Array<{ fields?: Array<{ id?: string }> | ItpMeasFieldDef[] }>,
): boolean {
  return items.some((item) =>
    (item.fields ?? []).some((field) => {
      const key = valveKeepKeyFromFieldId(String((field as { id?: string }).id ?? ''))
      return Boolean(key && key.startsWith('vk_'))
    }),
  )
}

export function reportHasValveKeepFields(sections: Array<{ items: ItpTravelerReportItem[] }>): boolean {
  return planHasValveKeepFields(sections.flatMap((section) => section.items))
}

/** Map vk_/js_ keys → value / photos from a built traveler report. */
export function collectValveKeepValues(sections: Array<{ items: ItpTravelerReportItem[] }>): {
  values: Record<string, string>
  photos: Record<string, Array<{ url: string; fileName: string }>>
  stepPhotos: Record<string, Array<{ url: string; fileName: string }>>
} {
  const values: Record<string, string> = {}
  const photos: Record<string, Array<{ url: string; fileName: string }>> = {}
  const stepPhotos: Record<string, Array<{ url: string; fileName: string }>> = {}

  for (const section of sections) {
    for (const item of section.items) {
      const stepKey = item.name.trim().toLowerCase()
      if (item.photos?.length) {
        stepPhotos[stepKey] = item.photos.map((photo) => ({
          url: photo.url,
          fileName: photo.fileName,
        }))
      }
      for (const field of item.fields as ItpTravelerReportField[]) {
        const key = valveKeepKeyFromFieldId(field.id)
        if (!key) continue
        if (field.value?.trim()) values[key] = field.value.trim()
        if (field.photos?.length) {
          photos[key] = field.photos.map((photo) => ({
            url: photo.url,
            fileName: photo.fileName,
          }))
        }
      }
    }
  }
  return { values, photos, stepPhotos }
}

export type ValveKeepPartsRow = {
  partKey: string
  partLabel: string
  name?: ItpMeasFieldDef
  cond?: ItpMeasFieldDef
  cond2?: ItpMeasFieldDef
  work?: ItpMeasFieldDef
  rec?: ItpMeasFieldDef
  found?: ItpMeasFieldDef
  left?: ItpMeasFieldDef
}

export type ValveKeepDimRow = {
  dimKey: string
  dimLabel: string
  found?: ItpMeasFieldDef
  mfg?: ItpMeasFieldDef
  mach?: ItpMeasFieldDef
  shipped?: ItpMeasFieldDef
}

export type ValveKeepPdescRow = {
  index: number
  name?: ItpMeasFieldDef
  number?: ItpMeasFieldDef
  heat?: ItpMeasFieldDef
}

export type ValveKeepFieldGroups = {
  partsRows: ValveKeepPartsRow[]
  dimRows: ValveKeepDimRow[]
  pdescRows: ValveKeepPdescRow[]
  rest: ItpMeasFieldDef[]
}

function partLabelFromFields(partKey: string, fields: ItpMeasFieldDef[]): string {
  const nameField = fields.find((field) => {
    const key = valveKeepKeyFromFieldId(field.id)
    return key === `vk_pd_${partKey}_name`
  })
  if (nameField?.label) {
    return nameField.label.replace(/\s*-\s*name$/i, '').trim() || partKey
  }
  const sample = fields.find((field) => {
    const key = valveKeepKeyFromFieldId(field.id)
    return key?.startsWith(`vk_pd_${partKey}_`)
  })
  const label = String(sample?.label ?? partKey)
  return label.replace(/\s*-\s*(condition 2|condition|work|recommendation|as-found photo|as-left photo).*$/i, '').trim() || partKey
}

function dimLabelFromFields(dimKey: string, fields: ItpMeasFieldDef[]): string {
  const sample = fields.find((field) => valveKeepKeyFromFieldId(field.id)?.startsWith(`vk_cd_${dimKey}_`))
  const label = String(sample?.label ?? dimKey)
  return label.replace(/\s*-\s*(As Found|Mfg|Mach\. By|As Shipped).*$/i, '').trim() || dimKey
}

/** Split ValveKeep table fields out of a flat meas-field list for compact UI tables. */
export function groupValveKeepTechFields(fields: ItpMeasFieldDef[]): ValveKeepFieldGroups {
  const used = new Set<string>()
  const byKey = new Map<string, ItpMeasFieldDef>()
  for (const field of fields) {
    const key = valveKeepKeyFromFieldId(field.id)
    if (key) byKey.set(key, field)
  }

  const partKeys: string[] = []
  const seenParts = new Set<string>()
  for (const field of fields) {
    const key = valveKeepKeyFromFieldId(field.id)
    const match = key?.match(/^vk_pd_([a-z0-9_]+)_(?:name|cond|cond2|work|rec)$/)
    if (!match) continue
    if (seenParts.has(match[1])) continue
    seenParts.add(match[1])
    partKeys.push(match[1])
  }

  const partsRows: ValveKeepPartsRow[] = partKeys.map((partKey) => {
    const row: ValveKeepPartsRow = {
      partKey,
      partLabel: partLabelFromFields(partKey, fields),
      name: byKey.get(`vk_pd_${partKey}_name`),
      cond: byKey.get(`vk_pd_${partKey}_cond`),
      cond2: byKey.get(`vk_pd_${partKey}_cond2`),
      work: byKey.get(`vk_pd_${partKey}_work`),
      rec: byKey.get(`vk_pd_${partKey}_rec`),
      found: byKey.get(`js_pd_${partKey}_found`),
      left: byKey.get(`js_pd_${partKey}_left`),
    }
    for (const field of [row.name, row.cond, row.cond2, row.work, row.rec, row.found, row.left]) {
      if (field) used.add(field.id)
    }
    return row
  })

  const dimKeys: string[] = []
  const seenDims = new Set<string>()
  for (const field of fields) {
    const key = valveKeepKeyFromFieldId(field.id)
    const match = key?.match(/^vk_cd_([a-z0-9_]+)_(?:found|mfg|mach|shipped)$/)
    if (!match) continue
    if (seenDims.has(match[1])) continue
    seenDims.add(match[1])
    dimKeys.push(match[1])
  }

  const dimRows: ValveKeepDimRow[] = dimKeys.map((dimKey) => {
    const row: ValveKeepDimRow = {
      dimKey,
      dimLabel: dimLabelFromFields(dimKey, fields),
      found: byKey.get(`vk_cd_${dimKey}_found`),
      mfg: byKey.get(`vk_cd_${dimKey}_mfg`),
      mach: byKey.get(`vk_cd_${dimKey}_mach`),
      shipped: byKey.get(`vk_cd_${dimKey}_shipped`),
    }
    for (const field of [row.found, row.mfg, row.mach, row.shipped]) {
      if (field) used.add(field.id)
    }
    return row
  })

  const pdescRows: ValveKeepPdescRow[] = []
  for (let index = 1; index <= 6; index += 1) {
    const name = byKey.get(`vk_pdesc_${index}_name`)
    const number = byKey.get(`vk_pdesc_${index}_number`)
    const heat = byKey.get(`vk_pdesc_${index}_heat`)
    if (!name && !number && !heat) continue
    pdescRows.push({ index, name, number, heat })
    for (const field of [name, number, heat]) {
      if (field) used.add(field.id)
    }
  }

  const rest = fields.filter((field) => !used.has(field.id))
  return { partsRows, dimRows, pdescRows, rest }
}
