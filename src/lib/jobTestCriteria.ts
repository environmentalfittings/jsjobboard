import { isReliefValveType, type ReliefValveMedia } from './reliefValveTest'
import { TEST_PROCEDURE_OTHER } from './testLogProcedure'
import { formatJobTestTypes, parseJobTestTypes } from './jobTestTypes'

/** Job-card test selections when valve type is Relief / Safety. */
export const RELIEF_VALVE_JOB_TEST_OPTIONS = ['AIR/GAS', 'Liquid', 'Steam', 'Other'] as const
export type ReliefValveJobTestOption = (typeof RELIEF_VALVE_JOB_TEST_OPTIONS)[number]

export const PRE_TEST_REQUIRED_LABEL = 'Pre-Test Required'

export function statusRequiresPreTest(status: string | null | undefined): boolean {
  return /failure\s*analysis/i.test(String(status ?? ''))
}

export function isPreTestRequiredForced(options: {
  needsFailureAnalysis: boolean
  status?: string | null
}): boolean {
  return options.needsFailureAnalysis || statusRequiresPreTest(options.status)
}

export function resolvePreTestRequired(options: {
  preTestRequired: boolean
  needsFailureAnalysis: boolean
  status?: string | null
}): boolean {
  if (isPreTestRequiredForced(options)) return true
  return options.preTestRequired
}

export function valveRequiresPreTest(valve: {
  pre_test_required?: boolean | null
  needs_failure_analysis?: boolean | null
  status?: string | null
}): boolean {
  return resolvePreTestRequired({
    preTestRequired: valve.pre_test_required === true,
    needsFailureAnalysis: valve.needs_failure_analysis === true,
    status: valve.status,
  })
}

export function preTestLockReason(options: {
  needsFailureAnalysis: boolean
  status?: string | null
}): string | undefined {
  if (options.needsFailureAnalysis) return 'Required because failure analysis is selected.'
  if (statusRequiresPreTest(options.status)) {
    return 'Required because this status includes failure analysis.'
  }
  return undefined
}

export function isMissingPreTestRequiredColumn(message: string | null | undefined): boolean {
  return (
    /pre_test_required/i.test(String(message ?? '')) &&
    /column|schema cache|does not exist|PGRST204/i.test(String(message ?? ''))
  )
}

export function omitPreTestRequiredColumn<T extends Record<string, unknown>>(row: T): Omit<T, 'pre_test_required'> {
  const { pre_test_required: _ignored, ...rest } = row
  return rest
}

export function normalizeReliefJobTestOption(raw: string | null | undefined): ReliefValveJobTestOption | '' {
  const n = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
  if (!n) return ''
  if (n === 'air/gas' || n === 'air' || n === 'gas' || n === 'airgas' || n === 'prvair') return 'AIR/GAS'
  if (n === 'liquid' || n === 'water' || n === 'prvwater') return 'Liquid'
  if (n === 'steam' || n === 'prvsteam') return 'Steam'
  if (n === 'other') return 'Other'
  return ''
}

export function reliefJobTestToLogMedia(token: string): ReliefValveMedia | '' {
  const option = normalizeReliefJobTestOption(token)
  if (option === 'AIR/GAS') return 'Air/Gas'
  if (option === 'Liquid') return 'Liquid'
  if (option === 'Steam') return 'Steam'
  if (option === 'Other') return 'Other'
  return ''
}

export function jobTestOptionsForValveType(
  valveType: string | null | undefined,
  procedureOptions: readonly string[],
): string[] {
  if (isReliefValveType(valveType)) return [...RELIEF_VALVE_JOB_TEST_OPTIONS]
  return [...procedureOptions]
}

export function parseJobTestSelections(
  raw: string | null | undefined,
  valveType: string | null | undefined,
  procedureOptions: readonly string[],
): { selected: string[]; otherText: string; preTestRequired: boolean } {
  const tokens = parseJobTestTypes(raw, [
    ...jobTestOptionsForValveType(valveType, procedureOptions),
    TEST_PROCEDURE_OTHER,
    PRE_TEST_REQUIRED_LABEL,
  ])
  const preTestRequired = tokens.some((token) => token.toLowerCase() === PRE_TEST_REQUIRED_LABEL.toLowerCase())
  const rest = tokens.filter((token) => token.toLowerCase() !== PRE_TEST_REQUIRED_LABEL.toLowerCase())

  if (isReliefValveType(valveType)) {
    const recognized: ReliefValveJobTestOption[] = []
    const custom: string[] = []
    let wantsOther = false
    for (const token of rest) {
      const option = normalizeReliefJobTestOption(token)
      if (option && option !== 'Other') {
        if (!recognized.includes(option)) recognized.push(option)
        continue
      }
      if (option === 'Other' || token.toLowerCase() === 'other') {
        wantsOther = true
        continue
      }
      custom.push(token)
    }
    if (custom.length) {
      return {
        selected: ['Other'],
        otherText: custom.join(', '),
        preTestRequired,
      }
    }
    if (wantsOther && !recognized.length) {
      return { selected: ['Other'], otherText: '', preTestRequired }
    }
    return {
      selected: recognized.slice(0, 1),
      otherText: '',
      preTestRequired,
    }
  }

  const known = new Set([...procedureOptions, TEST_PROCEDURE_OTHER])
  const recognized = rest.filter((token) => known.has(token))
  const custom = rest.filter((token) => !known.has(token))
  return {
    selected: custom.length ? [...recognized, TEST_PROCEDURE_OTHER] : recognized,
    otherText: custom.join(', '),
    preTestRequired,
  }
}

export function formatJobTestSelections(options: {
  valveType: string | null | undefined
  selected: string[]
  otherText: string
}): string {
  const other = options.otherText.trim()
  if (isReliefValveType(options.valveType)) {
    if (options.selected.includes('Other')) {
      return formatJobTestTypes([other || 'Other'])
    }
    const media = options.selected.find(
      (value) => value !== 'Other' && RELIEF_VALVE_JOB_TEST_OPTIONS.includes(value as ReliefValveJobTestOption),
    )
    return formatJobTestTypes(media ? [media] : [])
  }
  const values = options.selected.includes(TEST_PROCEDURE_OTHER)
    ? [...options.selected.filter((value) => value !== TEST_PROCEDURE_OTHER), other]
    : options.selected
  return formatJobTestTypes(values)
}
