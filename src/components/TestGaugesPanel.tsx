import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from './ToastNotification'
import { TestLogColumnHeader } from './testLog/TestLogColumnHeader'
import { TestGaugeExternalCertModal } from './TestGaugeExternalCertModal'
import {
  attachTestGaugeCertificate,
  createTestGauge,
  daysUntilGaugeCalibrationDue,
  deleteTestGauge,
  filterAllowedTestGauges,
  formatGaugeCalibrationAlert,
  getGaugeCalibrationStatus,
  loadTestGauges,
  normalizeSuggestedGaugeType,
  removeTestGaugeCertificate,
  SUGGESTED_GAUGE_TYPES,
  testGaugeCertificateUrl,
  updateTestGauge,
  updateTestGaugeDepartment,
  updateTestGaugeFrequency,
  updateTestGaugeNotes,
  updateTestGaugeType,
} from '../lib/testGaugeRegistry'
import { moveGaugeCategoryToolsToTestGauges, moveTestGaugeToToolLog } from '../lib/moveToolGaugesToTestGauges'
import {
  formatGaugeFrequencyLabel,
  GAUGE_CALIBRATION_FREQUENCY_OPTIONS,
  GAUGE_FREQUENCY_OTHER,
  nextDueFromGaugeFrequency,
  parseGaugeFrequency,
  resolveGaugeFrequencyValue,
  type GaugeFrequencySelect,
} from '../lib/toolCalibrationSopPoints'
import { openTestGaugesReportPrint } from '../lib/testGaugesReportPrint'
import { emptyTestGaugeForm, testGaugeToForm, SUGGESTED_DEPARTMENTS, type TestGauge, type TestGaugeFormState } from '../types/testGauge'

const BLANK_FILTER = '(Blank)'
const STATUS_FILTER_OPTIONS = ['Active', 'Inactive'] as const
const TYPE_OTHER = 'Other'
const GAUGE_DELETE_PIN = '1582'

type DueFocus = 'due-90' | 'due-60' | 'due-30' | 'overdue'
type SortKey =
  | 'gauge_number'
  | 'manufacturer'
  | 'gauge_type'
  | 'department'
  | 'calibration_frequency'
  | 'last_calibration_date'
  | 'next_calibration_date'
  | 'active'
type SortDir = 'asc' | 'desc'
type ColumnFilters = {
  gauge_type: string[]
  department: string[]
  status: string[]
}

const DEFAULT_COLUMN_FILTERS: ColumnFilters = {
  gauge_type: [],
  department: [],
  status: ['Active'],
}

const TYPE_OPTIONS = [...SUGGESTED_GAUGE_TYPES] as string[]
const DEPARTMENT_OPTIONS = [...SUGGESTED_DEPARTMENTS] as string[]

function uniqueSortedValues(
  rows: TestGauge[],
  getValue: (row: TestGauge) => string | null | undefined,
): string[] {
  const set = new Set<string>()
  for (const row of rows) {
    const raw = (getValue(row) ?? '').trim()
    set.add(raw || BLANK_FILTER)
  }
  return [...set].sort((a, b) => {
    if (a === BLANK_FILTER) return 1
    if (b === BLANK_FILTER) return -1
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  })
}

function statusFilterLabel(active: boolean): string {
  return active ? 'Active' : 'Inactive'
}

function matchesMultiFilter(selected: string[], value: string): boolean {
  if (selected.length === 0) return true
  return selected.includes(value)
}

function matchesDueFocus(row: TestGauge, focus: DueFocus | null): boolean {
  if (!focus) return true
  const days = daysUntilGaugeCalibrationDue(row)
  if (days === null) return false
  if (focus === 'overdue') return days < 0
  if (focus === 'due-30') return days >= 0 && days <= 30
  if (focus === 'due-60') return days >= 0 && days <= 60
  if (focus === 'due-90') return days >= 0 && days <= 90
  return true
}

function dueFocusLabel(focus: DueFocus): string {
  if (focus === 'overdue') return 'out of calibration'
  if (focus === 'due-30') return 'due within 30 days'
  if (focus === 'due-60') return 'due within 60 days'
  return 'due within 90 days'
}

const SORT_KEY_LABELS: Record<SortKey, string> = {
  gauge_number: 'gauge number',
  manufacturer: 'manufacturer',
  gauge_type: 'type',
  department: 'department',
  calibration_frequency: 'frequency',
  last_calibration_date: 'calibrated date',
  next_calibration_date: 'expires date',
  active: 'status',
}

function buildPrintFilterNote(options: {
  search: string
  columnFilters: ColumnFilters
  dueFocus: DueFocus | null
  sortKey: SortKey
  sortDir: SortDir
}): string {
  const parts: string[] = []
  const q = options.search.trim()
  if (q) parts.push(`search “${q}”`)
  if (options.columnFilters.gauge_type.length > 0) {
    parts.push(`type: ${options.columnFilters.gauge_type.join(', ')}`)
  }
  if (options.columnFilters.department.length > 0) {
    parts.push(`dept: ${options.columnFilters.department.join(', ')}`)
  }
  if (options.columnFilters.status.length > 0) {
    parts.push(`status: ${options.columnFilters.status.join(', ')}`)
  }
  if (options.dueFocus) parts.push(dueFocusLabel(options.dueFocus))
  parts.push(`sorted by ${SORT_KEY_LABELS[options.sortKey]} (${options.sortDir})`)
  return parts.join(' · ')
}

function compareSortValues(a: string | null | undefined, b: string | null | undefined, key: SortKey): number {
  const left = (a ?? '').trim()
  const right = (b ?? '').trim()
  if (key === 'gauge_number') {
    const ln = Number.parseInt(left.replace(/\D/g, ''), 10)
    const rn = Number.parseInt(right.replace(/\D/g, ''), 10)
    if (Number.isFinite(ln) && Number.isFinite(rn) && ln !== rn) return ln - rn
  }
  if (key === 'last_calibration_date' || key === 'next_calibration_date') {
    if (!left && !right) return 0
    if (!left) return 1
    if (!right) return -1
    return left.localeCompare(right)
  }
  if (key === 'active') {
    return left.localeCompare(right)
  }
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}

function sortValue(row: TestGauge, key: SortKey): string | null {
  if (key === 'active') return row.active ? 'Active' : 'Inactive'
  return row[key]
}

function formatFrequencyLabel(value: string | null | undefined): string {
  return formatGaugeFrequencyLabel(value)
}

function typeSelectValue(gaugeType: string | null | undefined): string {
  return normalizeSuggestedGaugeType(gaugeType) ?? ''
}

function InlineFrequencyCell({
  row,
  disabled,
  onSave,
}: {
  row: TestGauge
  disabled: boolean
  onSave: (frequency: string, nextDue: string | null) => Promise<boolean>
}) {
  const initial = parseGaugeFrequency(row.calibration_frequency)
  const [selectValue, setSelectValue] = useState<GaugeFrequencySelect>(initial.select)
  const [otherMonths, setOtherMonths] = useState(String(initial.otherMonths || 18))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const next = parseGaugeFrequency(row.calibration_frequency)
    setSelectValue(next.select)
    setOtherMonths(String(next.otherMonths || 18))
  }, [row.id, row.calibration_frequency])

  const persist = async (select: GaugeFrequencySelect, monthsText: string) => {
    const frequency = resolveGaugeFrequencyValue(select, monthsText)
    const nextDue = row.last_calibration_date
      ? nextDueFromGaugeFrequency(row.last_calibration_date, frequency)
      : row.next_calibration_date
    setSaving(true)
    const ok = await onSave(frequency, nextDue)
    setSaving(false)
    if (!ok) {
      const reset = parseGaugeFrequency(row.calibration_frequency)
      setSelectValue(reset.select)
      setOtherMonths(String(reset.otherMonths || 18))
    }
  }

  return (
    <div className="tool-cal-inline-category">
      <select
        className="tool-cal-inline-category-select"
        value={selectValue}
        disabled={disabled || saving}
        aria-label={`Calibration frequency for ${row.gauge_number}`}
        onChange={(e) => {
          const next = e.target.value as GaugeFrequencySelect
          setSelectValue(next)
          if (next === GAUGE_FREQUENCY_OTHER) {
            if (otherMonths.trim()) void persist(next, otherMonths)
            return
          }
          void persist(next, otherMonths)
        }}
      >
        {GAUGE_CALIBRATION_FREQUENCY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        <option value={GAUGE_FREQUENCY_OTHER}>Other</option>
      </select>
      {selectValue === GAUGE_FREQUENCY_OTHER ? (
        <input
          type="number"
          min={1}
          className="tool-cal-inline-category-other"
          value={otherMonths}
          disabled={disabled || saving}
          placeholder="Months"
          aria-label={`Other frequency months for ${row.gauge_number}`}
          onChange={(e) => setOtherMonths(e.target.value)}
          onBlur={() => {
            const months = Number.parseInt(otherMonths, 10)
            if (!Number.isFinite(months) || months <= 0) return
            const current = resolveGaugeFrequencyValue(GAUGE_FREQUENCY_OTHER, months)
            if (current === (row.calibration_frequency ?? '').trim()) return
            void persist(GAUGE_FREQUENCY_OTHER, String(months))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      ) : null}
    </div>
  )
}

function InlineNotesCell({
  row,
  disabled,
  onSave,
}: {
  row: TestGauge
  disabled: boolean
  onSave: (notes: string | null) => Promise<boolean>
}) {
  const [value, setValue] = useState(row.notes ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(row.notes ?? '')
  }, [row.id, row.notes])

  const persist = async () => {
    const next = value.trim() || null
    const current = (row.notes ?? '').trim() || null
    if (next === current) return
    setSaving(true)
    const ok = await onSave(next)
    setSaving(false)
    if (!ok) setValue(row.notes ?? '')
  }

  return (
    <input
      type="text"
      className="tool-cal-inline-category-other test-gauge-inline-notes"
      value={value}
      disabled={disabled || saving}
      placeholder="Add notes…"
      aria-label={`Notes for ${row.gauge_number}`}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        void persist()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setValue(row.notes ?? '')
          e.currentTarget.blur()
        }
      }}
    />
  )
}

function InlineTypeCell({
  row,
  disabled,
  onSave,
}: {
  row: TestGauge
  disabled: boolean
  onSave: (gaugeType: string | null) => Promise<boolean>
}) {
  const [selectValue, setSelectValue] = useState(() => typeSelectValue(row.gauge_type))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelectValue(typeSelectValue(row.gauge_type))
  }, [row.id, row.gauge_type])

  const persist = async (gaugeType: string | null) => {
    setSaving(true)
    const ok = await onSave(gaugeType)
    setSaving(false)
    if (!ok) {
      setSelectValue(typeSelectValue(row.gauge_type))
    }
  }

  return (
    <div className="tool-cal-inline-category">
      <select
        className="tool-cal-inline-category-select"
        value={selectValue}
        disabled={disabled || saving}
        aria-label={`Type for ${row.gauge_number}`}
        onChange={(e) => {
          const next = e.target.value
          setSelectValue(next)
          void persist(next || null)
        }}
      >
        <option value="">—</option>
        {TYPE_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  )
}

function departmentSelectValue(department: string | null | undefined): string {
  const value = (department ?? '').trim()
  if (!value) return ''
  return DEPARTMENT_OPTIONS.includes(value) ? value : TYPE_OTHER
}

function InlineDepartmentCell({
  row,
  disabled,
  onSave,
}: {
  row: TestGauge
  disabled: boolean
  onSave: (department: string | null) => Promise<boolean>
}) {
  const [selectValue, setSelectValue] = useState(() => departmentSelectValue(row.department))
  const [otherText, setOtherText] = useState(() => {
    const value = (row.department ?? '').trim()
    return DEPARTMENT_OPTIONS.includes(value) ? '' : value
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelectValue(departmentSelectValue(row.department))
    const value = (row.department ?? '').trim()
    setOtherText(DEPARTMENT_OPTIONS.includes(value) ? '' : value)
  }, [row.id, row.department])

  const persist = async (department: string | null) => {
    setSaving(true)
    const ok = await onSave(department)
    setSaving(false)
    if (!ok) {
      setSelectValue(departmentSelectValue(row.department))
      const value = (row.department ?? '').trim()
      setOtherText(DEPARTMENT_OPTIONS.includes(value) ? '' : value)
    }
  }

  return (
    <div className="tool-cal-inline-category">
      <select
        className="tool-cal-inline-category-select"
        value={selectValue}
        disabled={disabled || saving}
        aria-label={`Department for ${row.gauge_number}`}
        onChange={(e) => {
          const next = e.target.value
          setSelectValue(next)
          if (next === TYPE_OTHER) {
            if (otherText.trim()) void persist(otherText.trim())
            return
          }
          void persist(next || null)
        }}
      >
        <option value="">—</option>
        {DEPARTMENT_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value={TYPE_OTHER}>{TYPE_OTHER}</option>
      </select>
      {selectValue === TYPE_OTHER ? (
        <input
          type="text"
          className="tool-cal-inline-category-other"
          value={otherText}
          disabled={disabled || saving}
          placeholder="Type department…"
          aria-label={`Other department for ${row.gauge_number}`}
          onChange={(e) => setOtherText(e.target.value)}
          onBlur={() => {
            const next = otherText.trim()
            const current = (row.department ?? '').trim()
            if (next === current) return
            void persist(next || null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      ) : null}
    </div>
  )
}

export function TestGaugesPanel() {
  const { showToast } = useToast()
  const certInputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<TestGauge[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<TestGaugeFormState>(emptyTestGaugeForm())
  const [pendingCertGaugeId, setPendingCertGaugeId] = useState<string | null>(null)
  const [externalCertGauge, setExternalCertGauge] = useState<TestGauge | null>(null)
  const [externalCertTab, setExternalCertTab] = useState<'new' | 'history'>('new')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('gauge_number')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(DEFAULT_COLUMN_FILTERS)
  const [dueFocus, setDueFocus] = useState<DueFocus | null>(null)
  const [typeSavingId, setTypeSavingId] = useState<string | null>(null)
  const [departmentSavingId, setDepartmentSavingId] = useState<string | null>(null)
  const [frequencySavingId, setFrequencySavingId] = useState<string | null>(null)
  const [notesSavingId, setNotesSavingId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const moved = await moveGaugeCategoryToolsToTestGauges()
      if (moved.error) {
        showToast(moved.error)
      } else if (moved.moved > 0) {
        showToast(
          `Moved ${moved.moved} item${moved.moved === 1 ? '' : 's'} from tool log to test gauges`,
        )
      }
      setRows(filterAllowedTestGauges(await loadTestGauges(true)))
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not load test gauges')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void reload()
  }, [reload])

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyTestGaugeForm())
    setFormOpen(false)
    setPendingCertGaugeId(null)
    if (certInputRef.current) certInputRef.current.value = ''
  }

  const openAddForm = () => {
    setEditingId(null)
    setForm(emptyTestGaugeForm())
    setFormOpen(true)
  }

  const startEdit = (row: TestGauge) => {
    if (editingId === row.id && formOpen) {
      resetForm()
      return
    }
    setEditingId(row.id)
    setForm(testGaugeToForm(row))
    setFormOpen(true)
  }

  const saveGauge = async () => {
    setSaving(true)
    if (editingId) {
      const previous = rows.find((row) => row.id === editingId) ?? null
      const { error } = await updateTestGauge(editingId, form, previous)
      setSaving(false)
      if (error) {
        showToast(error)
        return
      }
      showToast('Test gauge updated')
    } else {
      const { row, error } = await createTestGauge(form)
      setSaving(false)
      if (error || !row) {
        showToast(error ?? 'Could not save gauge')
        return
      }
      showToast('Test gauge added')
      if (pendingCertGaugeId === 'new' && certInputRef.current?.files?.[0]) {
        const { error: certError } = await attachTestGaugeCertificate(row, certInputRef.current.files[0])
        if (certError) showToast(certError)
        if (certInputRef.current) certInputRef.current.value = ''
      }
    }
    resetForm()
    await reload()
  }

  const removeGauge = async (row: TestGauge) => {
    const entered = window.prompt(`Enter password to delete gauge ${row.gauge_number}`)
    if (entered === null) return
    if (entered.trim() !== GAUGE_DELETE_PIN) {
      showToast('Incorrect password')
      return
    }
    const { error } = await deleteTestGauge(row)
    if (error) {
      showToast(error)
      return
    }
    if (editingId === row.id) resetForm()
    showToast('Test gauge deleted')
    await reload()
  }

  const moveGaugeToToolLog = async (row: TestGauge) => {
    if (
      !window.confirm(
        `Move ${row.gauge_number} to the Tool calibration log and remove it from Test gauges?`,
      )
    ) {
      return
    }
    const { error } = await moveTestGaugeToToolLog(row)
    if (error) {
      showToast(error)
      await reload()
      return
    }
    if (editingId === row.id) resetForm()
    showToast(`${row.gauge_number} moved to tool log`)
    await reload()
  }

  const saveTypeInline = async (row: TestGauge, gaugeType: string | null) => {
    setTypeSavingId(row.id)
    const { error } = await updateTestGaugeType(row.id, gaugeType)
    setTypeSavingId(null)
    if (error) {
      showToast(error)
      return false
    }
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, gauge_type: gaugeType } : item)))
    return true
  }

  const saveDepartmentInline = async (row: TestGauge, department: string | null) => {
    setDepartmentSavingId(row.id)
    const { error } = await updateTestGaugeDepartment(row.id, department)
    setDepartmentSavingId(null)
    if (error) {
      showToast(error)
      return false
    }
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, department } : item)))
    return true
  }

  const saveFrequencyInline = async (row: TestGauge, frequency: string, nextDue: string | null) => {
    setFrequencySavingId(row.id)
    const { error } = await updateTestGaugeFrequency(row.id, frequency, nextDue)
    setFrequencySavingId(null)
    if (error) {
      showToast(error)
      return false
    }
    setRows((prev) =>
      prev.map((item) =>
        item.id === row.id
          ? { ...item, calibration_frequency: frequency, next_calibration_date: nextDue }
          : item,
      ),
    )
    return true
  }

  const saveNotesInline = async (row: TestGauge, notes: string | null) => {
    setNotesSavingId(row.id)
    const { error } = await updateTestGaugeNotes(row.id, notes)
    setNotesSavingId(null)
    if (error) {
      showToast(
        error.includes('notes') || error.includes('schema cache')
          ? 'Run migration-test-gauges-calibration-frequency.sql in Supabase first'
          : error,
      )
      return false
    }
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, notes } : item)))
    return true
  }

  const clearCert = async (row: TestGauge) => {
    if (!window.confirm('Remove the current calibration certificate file from this gauge?')) return
    const { error } = await removeTestGaugeCertificate(row)
    if (error) {
      showToast(error)
      return
    }
    showToast('Certificate removed')
    await reload()
  }

  const openExternalCert = (row: TestGauge, tab: 'new' | 'history' = 'new') => {
    setExternalCertTab(tab)
    setExternalCertGauge(row)
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('asc')
  }

  const setColumnFilter = (key: keyof ColumnFilters, selected: string[]) => {
    setColumnFilters((prev) => ({ ...prev, [key]: selected }))
  }

  const selectDueFocus = (focus: DueFocus | null) => {
    setDueFocus((prev) => (prev === focus ? null : focus))
    if (focus) setColumnFilters((prev) => ({ ...prev, status: ['Active'] }))
  }

  const showAllActive = () => {
    setDueFocus(null)
    setColumnFilters((prev) => ({ ...prev, status: ['Active'] }))
  }

  const clearTableFilters = () => {
    setDueFocus(null)
    setColumnFilters(DEFAULT_COLUMN_FILTERS)
  }

  const summary = useMemo(() => {
    let active = 0
    let due90 = 0
    let due60 = 0
    let due30 = 0
    let overdue = 0
    for (const row of rows) {
      if (!row.active) continue
      active += 1
      const days = daysUntilGaugeCalibrationDue(row)
      if (days === null) continue
      if (days < 0) {
        overdue += 1
        continue
      }
      if (days <= 90) due90 += 1
      if (days <= 60) due60 += 1
      if (days <= 30) due30 += 1
    }
    return { active, due90, due60, due30, overdue }
  }, [rows])

  const filterOptions = useMemo(
    () => ({
      gauge_type: uniqueSortedValues(rows, (row) => row.gauge_type),
      department: uniqueSortedValues(rows, (row) => row.department),
      status: [...STATUS_FILTER_OPTIONS],
    }),
    [rows],
  )

  const sortedRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = rows.filter((row) => {
      if (
        !matchesMultiFilter(columnFilters.gauge_type, (row.gauge_type ?? '').trim() || BLANK_FILTER)
      ) {
        return false
      }
      if (
        !matchesMultiFilter(columnFilters.department, (row.department ?? '').trim() || BLANK_FILTER)
      ) {
        return false
      }
      if (!matchesMultiFilter(columnFilters.status, statusFilterLabel(row.active))) return false
      if (!matchesDueFocus(row, dueFocus)) return false
      if (!q) return true
      const hay = [
        row.gauge_number,
        row.manufacturer,
        row.gauge_type,
        row.department,
        row.notes,
        formatFrequencyLabel(row.calibration_frequency),
        row.active ? 'active' : 'inactive',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })

    const next = [...filtered]
    next.sort((a, b) => {
      const cmp = compareSortValues(sortValue(a, sortKey), sortValue(b, sortKey), sortKey)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return next
  }, [rows, search, sortKey, sortDir, columnFilters, dueFocus])

  const activeColumnFilterCount =
    columnFilters.gauge_type.length +
    columnFilters.department.length +
    (columnFilters.status.length === 1 && columnFilters.status[0] === 'Active'
      ? 0
      : columnFilters.status.length > 0
        ? 1
        : 0) +
    (dueFocus ? 1 : 0)

  const isDefaultActiveOnly =
    columnFilters.status.length === 1 &&
    columnFilters.status[0] === 'Active' &&
    columnFilters.gauge_type.length === 0 &&
    columnFilters.department.length === 0 &&
    !dueFocus

  const header = (key: SortKey, label: string, filterKey?: keyof ColumnFilters) => (
    <TestLogColumnHeader
      label={label}
      sortActive={sortKey === key}
      sortDirection={sortDir}
      onSort={() => toggleSort(key)}
      filterOptions={filterKey ? filterOptions[filterKey] : undefined}
      selectedFilters={filterKey ? columnFilters[filterKey] : undefined}
      onFilterChange={filterKey ? (selected) => setColumnFilter(filterKey, selected) : undefined}
    />
  )

  const gaugeFormFields = (
    <div className="test-gauge-admin-grid">
      <label>
        Gauge number
        <input
          type="text"
          value={form.gauge_number}
          onChange={(e) => setForm((f) => ({ ...f, gauge_number: e.target.value }))}
          placeholder="e.g. JS284"
        />
      </label>
      <label>
        Manufacturer
        <input
          type="text"
          value={form.manufacturer}
          onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
        />
      </label>
      <label>
        Type
        <select
          value={form.typeSelect}
          onChange={(e) => {
            const typeSelect = e.target.value
            setForm((f) => ({
              ...f,
              typeSelect,
              typeOther: '',
            }))
          }}
        >
          <option value="">Select type…</option>
          {TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label>
        Department
        <select
          value={form.departmentSelect}
          onChange={(e) => {
            const departmentSelect = e.target.value
            setForm((f) => ({
              ...f,
              departmentSelect,
              departmentOther: departmentSelect === TYPE_OTHER ? f.departmentOther : '',
            }))
          }}
        >
          <option value="">Select department…</option>
          {DEPARTMENT_OPTIONS.map((dept) => (
            <option key={dept} value={dept}>
              {dept}
            </option>
          ))}
          <option value={TYPE_OTHER}>{TYPE_OTHER}</option>
        </select>
      </label>
      {form.departmentSelect === TYPE_OTHER ? (
        <label>
          Other department
          <input
            type="text"
            value={form.departmentOther}
            placeholder="Type department…"
            onChange={(e) => setForm((f) => ({ ...f, departmentOther: e.target.value }))}
          />
        </label>
      ) : null}
      <label>
        Last calibration date
        <input
          type="date"
          value={form.last_calibration_date}
          onChange={(e) => {
            const last_calibration_date = e.target.value
            setForm((f) => ({
              ...f,
              last_calibration_date,
              next_calibration_date: last_calibration_date
                ? nextDueFromGaugeFrequency(last_calibration_date, f.calibration_frequency)
                : '',
            }))
          }}
        />
      </label>
      <label>
        Calibration frequency
        <select
          value={parseGaugeFrequency(form.calibration_frequency).select}
          onChange={(e) => {
            const select = e.target.value as GaugeFrequencySelect
            const current = parseGaugeFrequency(form.calibration_frequency)
            const otherMonths = select === GAUGE_FREQUENCY_OTHER ? current.otherMonths || 18 : current.otherMonths
            const calibration_frequency = resolveGaugeFrequencyValue(select, otherMonths)
            setForm((f) => ({
              ...f,
              calibration_frequency,
              next_calibration_date: f.last_calibration_date
                ? nextDueFromGaugeFrequency(f.last_calibration_date, calibration_frequency)
                : '',
            }))
          }}
        >
          {GAUGE_CALIBRATION_FREQUENCY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
          <option value={GAUGE_FREQUENCY_OTHER}>Other</option>
        </select>
      </label>
      {parseGaugeFrequency(form.calibration_frequency).select === GAUGE_FREQUENCY_OTHER ? (
        <label>
          Other frequency (months)
          <input
            type="number"
            min={1}
            value={parseGaugeFrequency(form.calibration_frequency).otherMonths || ''}
            placeholder="e.g. 18"
            onChange={(e) => {
              const months = e.target.value
              const calibration_frequency = resolveGaugeFrequencyValue(GAUGE_FREQUENCY_OTHER, months)
              setForm((f) => ({
                ...f,
                calibration_frequency,
                next_calibration_date: f.last_calibration_date
                  ? nextDueFromGaugeFrequency(f.last_calibration_date, calibration_frequency)
                  : '',
              }))
            }}
          />
        </label>
      ) : null}
      <label>
        Expires (calculated)
        <input type="date" value={form.next_calibration_date} readOnly title="Calculated from calibrated date + frequency" />
      </label>
      <label>
        Certificate number
        <input
          type="text"
          value={form.certificate_number}
          placeholder="Lab certificate #"
          onChange={(e) => setForm((f) => ({ ...f, certificate_number: e.target.value }))}
        />
      </label>
      <label>
        Notes
        <input
          type="text"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Optional notes"
        />
      </label>
      <label className="test-gauge-admin-active">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
        />
        Active (show in test log dropdowns)
      </label>
    </div>
  )

  return (
    <section className="dashboard-panel admin-lists-panel">
      <h3>Test gauges</h3>
      <p className="placeholder-copy resources-hint">
        Calibrated test gauges and chart recorders for the test log. Only{' '}
        <strong>Pressure</strong>, <strong>Load Cell</strong>, <strong>Chart recorder</strong>, and{' '}
        <strong>Dead Weight Tester</strong> types are shown here — shop tools like depth gauges belong on the
        tool calibration log. Use <strong>Upload cert</strong> to record a new certificate (prior calibrations
        are archived). Use <strong>History</strong> to review archived certificates. Active gauges are shown by
        default — click a summary card to focus due windows. Use column filters for Type, Department, or Status.
      </p>

      <div className="dashboard-kpis tool-cal-kpis" aria-label="Test gauge calibration summary">
        <button
          type="button"
          className={`kpi-card tool-cal-kpi-btn${isDefaultActiveOnly ? ' is-active' : ''}`}
          onClick={showAllActive}
        >
          <span className="kpi-label">Active gauges</span>
          <div className="kpi-number blue">{loading ? '—' : summary.active}</div>
          <span className="kpi-sublabel">Show all active</span>
        </button>
        <button
          type="button"
          className={`kpi-card tool-cal-kpi-btn${dueFocus === 'due-90' ? ' is-active' : ''}`}
          onClick={() => selectDueFocus('due-90')}
        >
          <span className="kpi-label">Due in 90 days</span>
          <div className="kpi-number amber">{loading ? '—' : summary.due90}</div>
          <span className="kpi-sublabel">Active · click to filter</span>
        </button>
        <button
          type="button"
          className={`kpi-card tool-cal-kpi-btn${dueFocus === 'due-60' ? ' is-active' : ''}`}
          onClick={() => selectDueFocus('due-60')}
        >
          <span className="kpi-label">Due in 60 days</span>
          <div className="kpi-number amber">{loading ? '—' : summary.due60}</div>
          <span className="kpi-sublabel">Active · click to filter</span>
        </button>
        <button
          type="button"
          className={`kpi-card tool-cal-kpi-btn${dueFocus === 'due-30' ? ' is-active' : ''}`}
          onClick={() => selectDueFocus('due-30')}
        >
          <span className="kpi-label">Due in 30 days</span>
          <div className="kpi-number amber">{loading ? '—' : summary.due30}</div>
          <span className="kpi-sublabel">Active · click to filter</span>
        </button>
        <button
          type="button"
          className={`kpi-card tool-cal-kpi-btn tool-cal-kpi-btn--critical${dueFocus === 'overdue' ? ' is-active' : ''}`}
          onClick={() => selectDueFocus('overdue')}
        >
          <span className="kpi-label">Out of calibration</span>
          <div className="kpi-number red">{loading ? '—' : summary.overdue}</div>
          <span className="kpi-sublabel">Active · expired</span>
        </button>
      </div>

      <div className="test-gauge-admin-actions" style={{ marginBottom: 12 }}>
        {!(formOpen && editingId == null) ? (
          <button type="button" className="button-primary" onClick={openAddForm}>
            Add gauge
          </button>
        ) : null}
        <button
          type="button"
          className="button-secondary"
          disabled={loading}
          onClick={() =>
            openTestGaugesReportPrint(sortedRows, {
              filterNote: buildPrintFilterNote({
                search,
                columnFilters,
                dueFocus,
                sortKey,
                sortDir,
              }),
            })
          }
        >
          Print report
        </button>
      </div>

      {formOpen && editingId == null ? (
        <div className="test-gauge-admin-form">
          <h4>Add gauge</h4>
          {gaugeFormFields}
          <label className="test-gauge-cert-upload">
            Calibration certificate (optional)
            <input
              ref={certInputRef}
              type="file"
              accept=".pdf,image/*"
              onChange={() => setPendingCertGaugeId('new')}
            />
          </label>
          <div className="test-gauge-admin-actions">
            <button type="button" className="button-primary" disabled={saving} onClick={() => void saveGauge()}>
              {saving ? 'Saving…' : 'Add gauge'}
            </button>
            <button type="button" className="button-secondary" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="tool-cal-filters">
        <label>
          Search
          <input
            type="search"
            value={search}
            placeholder="Gauge #, manufacturer, type, department, notes…"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <span className="tool-cal-count">
          {sortedRows.length} of {rows.length}
          {sortKey ? ` · sorted by ${sortKey.replace(/_/g, ' ')} (${sortDir})` : ''}
        </span>
      </div>

      {activeColumnFilterCount > 0 || dueFocus ? (
        <div className="test-log-column-filter-bar">
          <span>
            {dueFocus
              ? `Showing active gauges ${dueFocusLabel(dueFocus)}`
              : `${activeColumnFilterCount} column filter${activeColumnFilterCount === 1 ? '' : 's'} active`}
            {' · '}
            {sortedRows.length} row{sortedRows.length === 1 ? '' : 's'} shown
          </span>
          <button type="button" className="button-secondary" onClick={clearTableFilters}>
            Reset to active gauges
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="placeholder-copy">Loading gauges…</p>
      ) : rows.length === 0 ? (
        <p className="placeholder-copy">No test gauges registered yet.</p>
      ) : sortedRows.length === 0 ? (
        <p className="placeholder-copy">No gauges match this search or filter.</p>
      ) : (
        <div className="dashboard-table-wrap manager-dashboard-scroll manager-dashboard-scroll--tall tool-cal-scroll">
          <table className="dashboard-table test-gauge-admin-table tool-cal-sortable-table">
            <thead>
              <tr>
                <th>{header('gauge_number', 'Gauge #')}</th>
                <th>{header('manufacturer', 'Manufacturer')}</th>
                <th>{header('gauge_type', 'Type', 'gauge_type')}</th>
                <th>{header('department', 'Dept', 'department')}</th>
                <th>{header('last_calibration_date', 'Calibrated')}</th>
                <th>{header('calibration_frequency', 'Frequency')}</th>
                <th>{header('next_calibration_date', 'Expires')}</th>
                <th>Certificate</th>
                <th>Notes</th>
                <th>{header('active', 'Status', 'status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const certUrl = testGaugeCertificateUrl(row.certificate_storage_path)
                const calStatus = getGaugeCalibrationStatus(row)
                const isEditingRow = formOpen && editingId === row.id
                return (
                  <Fragment key={row.id}>
                    <tr className={calStatus !== 'ok' ? `test-gauge-row--${calStatus}` : undefined}>
                      <td>{row.gauge_number}</td>
                      <td>{row.manufacturer ?? '—'}</td>
                      <td>
                        <InlineTypeCell
                          row={row}
                          disabled={typeSavingId != null && typeSavingId !== row.id}
                          onSave={(gaugeType) => saveTypeInline(row, gaugeType)}
                        />
                      </td>
                      <td>
                        <InlineDepartmentCell
                          row={row}
                          disabled={departmentSavingId != null && departmentSavingId !== row.id}
                          onSave={(department) => saveDepartmentInline(row, department)}
                        />
                      </td>
                      <td>{row.last_calibration_date ?? '—'}</td>
                      <td>
                        <InlineFrequencyCell
                          row={row}
                          disabled={frequencySavingId != null && frequencySavingId !== row.id}
                          onSave={(frequency, nextDue) => saveFrequencyInline(row, frequency, nextDue)}
                        />
                      </td>
                      <td className={calStatus !== 'ok' ? `test-gauge-cal-cell--${calStatus}` : undefined}>
                        {row.next_calibration_date ?? '—'}
                        {calStatus === 'critical' || calStatus === 'due' ? (
                          <span className="test-gauge-expired-badge">Expired</span>
                        ) : calStatus === 'expiring' ? (
                          <span className={`test-gauge-cal-badge test-gauge-cal-badge--${calStatus}`}>
                            {formatGaugeCalibrationAlert(row)}
                          </span>
                        ) : null}
                      </td>
                      <td className="test-gauge-cert-cell">
                        {row.certificate_number?.trim() ? (
                          <div className="tool-cal-cert-number">#{row.certificate_number.trim()}</div>
                        ) : null}
                        {certUrl ? (
                          <a href={certUrl} target="_blank" rel="noreferrer">
                            {row.certificate_file_name ?? 'View'}
                          </a>
                        ) : row.certificate_number?.trim() ? null : (
                          '—'
                        )}
                        {certUrl ? (
                          <div className="test-gauge-cert-actions">
                            <button type="button" className="link-button" onClick={() => void clearCert(row)}>
                              Remove
                            </button>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <InlineNotesCell
                          row={row}
                          disabled={notesSavingId != null && notesSavingId !== row.id}
                          onSave={(notes) => saveNotesInline(row, notes)}
                        />
                      </td>
                      <td>{row.active ? 'Active' : 'Inactive'}</td>
                      <td className="test-gauge-row-actions">
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => openExternalCert(row, 'new')}
                        >
                          Upload cert
                        </button>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => openExternalCert(row, 'history')}
                        >
                          History
                        </button>
                        <button type="button" className="link-button" onClick={() => startEdit(row)}>
                          {isEditingRow ? 'Close' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => void moveGaugeToToolLog(row)}
                        >
                          To tool log
                        </button>
                        <button
                          type="button"
                          className="link-button link-button-danger"
                          onClick={() => void removeGauge(row)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    {isEditingRow ? (
                      <tr className="tool-cal-inline-edit-row">
                        <td colSpan={11}>
                          <div className="test-gauge-admin-form tool-cal-inline-edit-form">
                            <h4>Edit gauge — {row.gauge_number}</h4>
                            <p className="placeholder-copy resources-hint">
                              Changing calibration dates or certificate number archives the prior record. Prefer{' '}
                              <strong>Upload cert</strong> when recording a new outside-lab certificate.
                            </p>
                            {gaugeFormFields}
                            <div className="test-gauge-admin-actions">
                              <button
                                type="button"
                                className="button-primary"
                                disabled={saving}
                                onClick={() => void saveGauge()}
                              >
                                {saving ? 'Saving…' : 'Save changes'}
                              </button>
                              <button type="button" className="button-secondary" onClick={resetForm}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {externalCertGauge ? (
        <TestGaugeExternalCertModal
          key={`${externalCertGauge.id}-${externalCertTab}`}
          gauge={externalCertGauge}
          initialTab={externalCertTab}
          onClose={() => setExternalCertGauge(null)}
          onSaved={() => void reload()}
          showToast={showToast}
        />
      ) : null}
    </section>
  )
}
