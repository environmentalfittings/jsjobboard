import type { ItpTravelerReportItem, ItpTravelerReportSection } from './itpTravelerReport'
import { codeLetter } from './reliefValveServiceTravelerPrint'
import { collectValveKeepValues, valveKeepKeyFromFieldId } from './valveKeepFields'
import {
  VALVEKEEP_CSV_COLUMNS,
  VALVEKEEP_CSV_DELIMITER,
  VALVEKEEP_CSV_EXTENSION,
  valveKeepCsvColumnDrift,
  type ValveKeepCsvColumn,
  type ValveKeepCsvFormat,
} from './valveKeepCsvColumns'

type Sections = Array<{ items: ItpTravelerReportItem[] }>

function fmtDate(value: string): string {
  const t = value.trim()
  if (!t) return ''
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}/${iso[2]}/${iso[3]}`
  const slash = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (slash) {
    const mm = slash[1].padStart(2, '0')
    const dd = slash[2].padStart(2, '0')
    return `${slash[3]}/${mm}/${dd}`
  }
  return t
}

function fmtYesNo(value: string): string {
  const t = value.trim()
  if (!t) return ''
  const c = t.toLowerCase().replace(/\s+/g, '')
  if (['yes', 'y', 'true', '1'].includes(c)) return 'Yes'
  if (['no', 'n', 'false', '0'].includes(c)) return 'No'
  if (['na', 'n/a', 'n.a.', 'n.a'].includes(c)) return 'NA'
  return t
}

function formatCell(raw: string, format: ValveKeepCsvFormat): string {
  const value = String(raw ?? '').trim()
  if (!value) return ''
  switch (format) {
    case 'date':
      return fmtDate(value)
    case 'yesno':
      return fmtYesNo(value)
    case 'code':
      return codeLetter(value)
    default:
      return value
  }
}

/** Quote a CSV field when it contains the delimiter, quotes, or line breaks. */
export function quoteCsvField(value: string, delimiter = VALVEKEEP_CSV_DELIMITER): string {
  const text = String(value ?? '')
  if (/["\r\n]/.test(text) || text.includes(delimiter)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function buildValveKeepCsvContent(
  values: Record<string, string>,
  columns: ValveKeepCsvColumn[] = VALVEKEEP_CSV_COLUMNS,
  delimiter = VALVEKEEP_CSV_DELIMITER,
): string {
  const header = columns.map((c) => quoteCsvField(c.header, delimiter)).join(delimiter)
  const row = columns
    .map((c) => quoteCsvField(formatCell(values[c.key] ?? '', c.format), delimiter))
    .join(delimiter)
  // UTF-8 BOM + CRLF for Excel.
  return `\uFEFF${header}\r\n${row}\r\n`
}

export function collectReportVkKeys(sections: Sections): string[] {
  const keys = new Set<string>()
  for (const section of sections) {
    for (const item of section.items) {
      for (const field of item.fields) {
        const key = valveKeepKeyFromFieldId(field.id)
        if (key?.startsWith('vk_')) keys.add(key)
      }
    }
  }
  return [...keys].sort()
}

export function travelerIsComplete(sections: Array<{ items: ItpTravelerReportItem[] }>): boolean {
  const items = sections.flatMap((section) => section.items)
  if (items.length === 0) return false
  return items.every((item) => item.done)
}

function todayIsoDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function safeFilePart(value: string): string {
  const cleaned = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/\s+/g, '-')
  return cleaned.replace(/-+/g, '-').replace(/^-|-$/g, '') || 'valve'
}

export function valveKeepCsvFilename(options: {
  shopId?: string | null
  valveId?: string | null
  date?: string
  extension?: string
}): string {
  const id = safeFilePart(options.shopId?.trim() || options.valveId?.trim() || 'valve')
  const date = options.date?.trim() || todayIsoDate()
  const ext = (options.extension || VALVEKEEP_CSV_EXTENSION).replace(/^\./, '')
  return `valvekeep-${id}-${date}.${ext}`
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export type ValveKeepCsvExportResult = {
  ok: boolean
  filename?: string
  incomplete?: boolean
  cancelled?: boolean
  drift?: string[]
  error?: string
}

/**
 * Builds and downloads one ValveKeep CSV for this traveler.
 * If any step is not checked off, asks before exporting.
 */
export function exportValveKeepCsv(
  sections: ItpTravelerReportSection[],
  options?: { valveId?: string | null; confirmIncomplete?: (message: string) => boolean },
): ValveKeepCsvExportResult {
  const incomplete = !travelerIsComplete(sections)
  if (incomplete) {
    const confirmFn = options?.confirmIncomplete ?? ((message) => window.confirm(message))
    const ok = confirmFn('This traveler is not finished. Export anyway?')
    if (!ok) return { ok: false, incomplete: true, cancelled: true }
  }

  const drift = valveKeepCsvColumnDrift(collectReportVkKeys(sections))
  if (import.meta.env.DEV && drift.length) {
    console.warn('[ValveKeep CSV]', drift.join('\n'))
  }

  const { values } = collectValveKeepValues(sections)
  // Only vk_ values are written; js_ keys in `values` are ignored by the column map.
  const shopId = values.vk_shop_id?.trim() || ''
  const filename = valveKeepCsvFilename({
    shopId,
    valveId: options?.valveId,
  })
  const content = buildValveKeepCsvContent(values)
  downloadTextFile(filename, content, 'text/csv;charset=utf-8')
  return { ok: true, filename, incomplete, drift: drift.length ? drift : undefined }
}
