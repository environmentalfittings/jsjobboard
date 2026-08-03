import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from './ToastNotification'
import { TestLogColumnHeader } from './testLog/TestLogColumnHeader'
import { ToolCalibrationHistoryModal } from './ToolCalibrationHistoryModal'
import { ToolExternalCertModal } from './ToolExternalCertModal'
import { ToolRecalibrateModal } from './ToolRecalibrateModal'
import {
  createToolCalibration,
  daysUntilToolExpiration,
  deleteToolCalibration,
  formatToolDueAlert,
  getToolCalibrationDueStatus,
  loadToolCalibrations,
  removeToolCalibrationCertificate,
  toolCalibrationCertificateUrl,
  updateToolCalibration,
  updateToolCalibrationCategory,
  updateToolCalibrationFrequency,
} from '../lib/toolCalibrationRegistry'
import {
  formatGaugeFrequencyLabel,
  GAUGE_CALIBRATION_FREQUENCY_OPTIONS,
  GAUGE_FREQUENCY_OTHER,
  nextDueFromGaugeFrequency,
  parseGaugeFrequency,
  resolveGaugeFrequencyValue,
  type GaugeFrequencySelect,
} from '../lib/toolCalibrationSopPoints'
import { openToolCalibrationsReportPrint } from '../lib/toolCalibrationsReportPrint'
import { belongsOnTestGaugesList } from '../lib/moveToolGaugesToTestGauges'
import {
  emptyToolCalibrationForm,
  isExternalCalibrationCategory,
  isPresetToolCategory,
  toolCalibrationToForm,
  TOOL_CATEGORY_OPTIONS,
  TOOL_CATEGORY_OTHER,
  type ToolCalibration,
  type ToolCalibrationFormState,
  type ToolCalibrationStatus,
} from '../types/toolCalibration'

const BLANK_FILTER = '(Blank)'
const STATUS_FILTER_OPTIONS = ['Active', 'Out of service'] as const
/** Client-side gate for tool deletes — same shop PIN as other admin unlocks. */
const TOOL_DELETE_PIN = '1582'

type DueFocus = 'due-90' | 'due-60' | 'due-30' | 'overdue'

type SortKey =
  | 'js_id'
  | 'model'
  | 'tool_type'
  | 'category'
  | 'serial_number'
  | 'department'
  | 'calibration_date'
  | 'calibration_frequency'
  | 'expiration_date'
  | 'status'

type SortDir = 'asc' | 'desc'

type ColumnFilters = {
  category: string[]
  department: string[]
  status: string[]
}

const DEFAULT_COLUMN_FILTERS: ColumnFilters = {
  category: [],
  department: [],
  status: ['Active'],
}

function uniqueSortedValues(
  rows: ToolCalibration[],
  getValue: (row: ToolCalibration) => string | null | undefined,
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

function statusFilterLabel(status: ToolCalibrationStatus): string {
  return status === 'out_of_service' ? 'Out of service' : 'Active'
}

function matchesMultiFilter(selected: string[], value: string): boolean {
  if (selected.length === 0) return true
  return selected.includes(value)
}

function matchesDueFocus(row: ToolCalibration, focus: DueFocus | null): boolean {
  if (!focus) return true
  const days = daysUntilToolExpiration(row)
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
  js_id: 'js id',
  model: 'model',
  tool_type: 'type',
  category: 'category',
  serial_number: 'serial',
  department: 'department',
  calibration_date: 'calibrated date',
  calibration_frequency: 'frequency',
  expiration_date: 'expires date',
  status: 'status',
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
  if (options.columnFilters.category.length > 0) {
    parts.push(`category: ${options.columnFilters.category.join(', ')}`)
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

function InlineFrequencyCell({
  row,
  disabled,
  onSave,
}: {
  row: ToolCalibration
  disabled: boolean
  onSave: (frequency: string, expirationDate: string | null) => Promise<boolean>
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
    const expirationDate = row.calibration_date
      ? nextDueFromGaugeFrequency(row.calibration_date, frequency)
      : row.expiration_date
    setSaving(true)
    const ok = await onSave(frequency, expirationDate)
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
        aria-label={`Calibration frequency for ${row.js_id ?? row.id}`}
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
          aria-label={`Other frequency months for ${row.js_id ?? row.id}`}
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

function categorySelectValue(category: string | null | undefined): string {
  const value = (category ?? '').trim()
  if (!value) return ''
  return isPresetToolCategory(value) ? value : TOOL_CATEGORY_OTHER
}

function InlineCategoryCell({
  row,
  disabled,
  onSave,
}: {
  row: ToolCalibration
  disabled: boolean
  onSave: (category: string | null) => Promise<boolean>
}) {
  const [selectValue, setSelectValue] = useState(() => categorySelectValue(row.category))
  const [otherText, setOtherText] = useState(() => {
    const value = (row.category ?? '').trim()
    return isPresetToolCategory(value) ? '' : value
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelectValue(categorySelectValue(row.category))
    const value = (row.category ?? '').trim()
    setOtherText(isPresetToolCategory(value) ? '' : value)
  }, [row.id, row.category])

  const persist = async (category: string | null) => {
    setSaving(true)
    const ok = await onSave(category)
    setSaving(false)
    if (!ok) {
      setSelectValue(categorySelectValue(row.category))
      const value = (row.category ?? '').trim()
      setOtherText(isPresetToolCategory(value) ? '' : value)
    }
  }

  return (
    <div className="tool-cal-inline-category">
      <select
        className="tool-cal-inline-category-select"
        value={selectValue}
        disabled={disabled || saving}
        aria-label={`Category for ${row.js_id ?? row.id}`}
        onChange={(e) => {
          const next = e.target.value
          setSelectValue(next)
          if (next === TOOL_CATEGORY_OTHER) {
            if (otherText.trim()) void persist(otherText.trim())
            return
          }
          void persist(next || null)
        }}
      >
        <option value="">—</option>
        {TOOL_CATEGORY_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value={TOOL_CATEGORY_OTHER}>{TOOL_CATEGORY_OTHER}</option>
      </select>
      {selectValue === TOOL_CATEGORY_OTHER ? (
        <input
          type="text"
          className="tool-cal-inline-category-other"
          value={otherText}
          disabled={disabled || saving}
          placeholder="Type category…"
          aria-label={`Other category for ${row.js_id ?? row.id}`}
          onChange={(e) => setOtherText(e.target.value)}
          onBlur={() => {
            const next = otherText.trim()
            const current = (row.category ?? '').trim()
            if (next === current) return
            void persist(next || null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur()
            }
          }}
        />
      ) : null}
    </div>
  )
}

function compareSortValues(a: string | null | undefined, b: string | null | undefined, key: SortKey): number {
  const left = (a ?? '').trim()
  const right = (b ?? '').trim()
  if (key === 'js_id') {
    const ln = Number.parseInt(left.replace(/\D/g, ''), 10)
    const rn = Number.parseInt(right.replace(/\D/g, ''), 10)
    if (Number.isFinite(ln) && Number.isFinite(rn) && ln !== rn) return ln - rn
  }
  if (key === 'calibration_date' || key === 'expiration_date') {
    if (!left && !right) return 0
    if (!left) return 1
    if (!right) return -1
    return left.localeCompare(right)
  }
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}

function sortValue(row: ToolCalibration, key: SortKey): string | null {
  if (key === 'status') return row.status
  return row[key]
}

export function ToolCalibrationsPanel() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<ToolCalibration[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<ToolCalibrationFormState>(emptyToolCalibrationForm())
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('js_id')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(DEFAULT_COLUMN_FILTERS)
  const [dueFocus, setDueFocus] = useState<DueFocus | null>(null)
  const [categorySavingId, setCategorySavingId] = useState<number | null>(null)
  const [frequencySavingId, setFrequencySavingId] = useState<number | null>(null)
  const [recalibrateTool, setRecalibrateTool] = useState<ToolCalibration | null>(null)
  const [externalCertTool, setExternalCertTool] = useState<ToolCalibration | null>(null)
  const [historyTool, setHistoryTool] = useState<ToolCalibration | null>(null)
  const [certBusyId, setCertBusyId] = useState<number | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setRows((await loadToolCalibrations(true)).filter((row) => !belongsOnTestGaugesList(row)))
    } catch (error) {
      showToast(
        error instanceof Error && error.message.includes('tool_calibrations')
          ? 'Run migration-tool-calibrations.sql in Supabase first'
          : error instanceof Error
            ? error.message
            : 'Could not load tool calibrations',
      )
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
    setForm(emptyToolCalibrationForm())
    setFormOpen(false)
  }

  const openAddForm = () => {
    setEditingId(null)
    setForm(emptyToolCalibrationForm())
    setFormOpen(true)
  }

  const startEdit = (row: ToolCalibration) => {
    if (editingId === row.id && formOpen) {
      resetForm()
      return
    }
    setEditingId(row.id)
    setForm(toolCalibrationToForm(row))
    setFormOpen(true)
  }

  const saveRow = async () => {
    setSaving(true)
    if (editingId != null) {
      const previous = rows.find((row) => row.id === editingId) ?? null
      const { error } = await updateToolCalibration(editingId, form, previous)
      setSaving(false)
      if (error) {
        showToast(error)
        return
      }
      showToast('Tool updated')
    } else {
      const { error } = await createToolCalibration(form)
      setSaving(false)
      if (error) {
        showToast(error)
        return
      }
      showToast('Tool added')
    }
    resetForm()
    await reload()
  }

  const removeRow = async (row: ToolCalibration) => {
    const entered = window.prompt(`Enter password to delete tool JS ${row.js_id ?? row.id}`)
    if (entered === null) return
    if (entered.trim() !== TOOL_DELETE_PIN) {
      showToast('Incorrect password')
      return
    }
    const { error } = await deleteToolCalibration(row)
    if (error) {
      showToast(error)
      return
    }
    showToast('Tool deleted')
    if (editingId === row.id) resetForm()
    await reload()
  }

  const saveCategoryInline = async (row: ToolCalibration, category: string | null) => {
    setCategorySavingId(row.id)
    const { error } = await updateToolCalibrationCategory(row.id, category)
    setCategorySavingId(null)
    if (error) {
      showToast(
        error.includes('category') || error.includes('schema cache')
          ? 'Run migration-tool-calibrations-category.sql in Supabase first'
          : error,
      )
      return false
    }
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, category } : item)))
    return true
  }

  const saveFrequencyInline = async (
    row: ToolCalibration,
    frequency: string,
    expirationDate: string | null,
  ) => {
    setFrequencySavingId(row.id)
    const { error } = await updateToolCalibrationFrequency(row.id, frequency, expirationDate)
    setFrequencySavingId(null)
    if (error) {
      showToast(
        error.includes('calibration_frequency') || error.includes('schema cache')
          ? 'Run migration-tool-calibrations-frequency.sql in Supabase first'
          : error,
      )
      return false
    }
    setRows((prev) =>
      prev.map((item) =>
        item.id === row.id
          ? { ...item, calibration_frequency: frequency, expiration_date: expirationDate }
          : item,
      ),
    )
    return true
  }

  const clearCertificate = async (row: ToolCalibration) => {
    if (!window.confirm(`Remove certificate for ${row.js_id ?? row.id}?`)) return
    setCertBusyId(row.id)
    const { error } = await removeToolCalibrationCertificate(row)
    setCertBusyId(null)
    if (error) {
      showToast(error)
      return
    }
    showToast('Certificate removed')
    await reload()
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
    if (focus) {
      setColumnFilters((prev) => ({ ...prev, status: ['Active'] }))
    }
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
      if (row.status !== 'active') continue
      active += 1
      const days = daysUntilToolExpiration(row)
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
      category: uniqueSortedValues(rows, (row) => row.category),
      department: uniqueSortedValues(rows, (row) => row.department),
      status: [...STATUS_FILTER_OPTIONS],
    }),
    [rows],
  )

  const sortedRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = rows.filter((row) => {
      if (
        !matchesMultiFilter(
          columnFilters.category,
          (row.category ?? '').trim() || BLANK_FILTER,
        )
      ) {
        return false
      }
      if (
        !matchesMultiFilter(
          columnFilters.department,
          (row.department ?? '').trim() || BLANK_FILTER,
        )
      ) {
        return false
      }
      if (!matchesMultiFilter(columnFilters.status, statusFilterLabel(row.status))) {
        return false
      }
      if (!matchesDueFocus(row, dueFocus)) return false
      if (!q) return true
      const hay = [
        row.js_id,
        row.manufacturer,
        row.model,
        row.tool_type,
        row.category,
        row.serial_number,
        row.department,
        row.status,
        row.notes,
        formatGaugeFrequencyLabel(row.calibration_frequency),
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
    columnFilters.category.length +
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
    columnFilters.category.length === 0 &&
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

  const toolFormFields = (
    <div className="test-gauge-admin-grid tool-cal-admin-grid">
      <label>
        JS ID
        <input
          type="text"
          value={form.js_id}
          onChange={(e) => setForm((f) => ({ ...f, js_id: e.target.value }))}
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
        Model / description
        <input
          type="text"
          value={form.model}
          onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
        />
      </label>
      <label>
        Tool type
        <input
          type="text"
          value={form.tool_type}
          onChange={(e) => setForm((f) => ({ ...f, tool_type: e.target.value }))}
        />
      </label>
      <label>
        Category
        <select
          value={form.categorySelect}
          onChange={(e) => {
            const categorySelect = e.target.value as ToolCalibrationFormState['categorySelect']
            setForm((f) => ({
              ...f,
              categorySelect,
              categoryOther: categorySelect === TOOL_CATEGORY_OTHER ? f.categoryOther : '',
            }))
          }}
        >
          <option value="">Select category…</option>
          {TOOL_CATEGORY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
          <option value={TOOL_CATEGORY_OTHER}>{TOOL_CATEGORY_OTHER}</option>
        </select>
      </label>
      {form.categorySelect === TOOL_CATEGORY_OTHER ? (
        <label>
          Other category
          <input
            type="text"
            value={form.categoryOther}
            placeholder="Type category…"
            onChange={(e) => setForm((f) => ({ ...f, categoryOther: e.target.value }))}
          />
        </label>
      ) : null}
      <label>
        Serial number
        <input
          type="text"
          value={form.serial_number}
          onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))}
        />
      </label>
      <label>
        Department
        <input
          type="text"
          value={form.department}
          onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
        />
      </label>
      <label>
        Calibration date
        <input
          type="date"
          value={form.calibration_date}
          onChange={(e) => {
            const calibration_date = e.target.value
            setForm((f) => ({
              ...f,
              calibration_date,
              expiration_date: calibration_date
                ? nextDueFromGaugeFrequency(calibration_date, f.calibration_frequency)
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
            const otherMonths =
              select === GAUGE_FREQUENCY_OTHER ? current.otherMonths || 18 : current.otherMonths
            const calibration_frequency = resolveGaugeFrequencyValue(select, otherMonths)
            setForm((f) => ({
              ...f,
              calibration_frequency,
              expiration_date: f.calibration_date
                ? nextDueFromGaugeFrequency(f.calibration_date, calibration_frequency)
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
                expiration_date: f.calibration_date
                  ? nextDueFromGaugeFrequency(f.calibration_date, calibration_frequency)
                  : '',
              }))
            }}
          />
        </label>
      ) : null}
      <label>
        Expires (calculated)
        <input
          type="date"
          value={form.expiration_date}
          readOnly
          title="Calculated from calibrated date + frequency"
        />
      </label>
      <label>
        Status
        <select
          value={form.status}
          onChange={(e) => {
            const status = e.target.value as ToolCalibrationStatus
            setForm((f) => ({
              ...f,
              status,
              active: status === 'active',
            }))
          }}
        >
          <option value="active">Active</option>
          <option value="out_of_service">Out of service</option>
        </select>
      </label>
      <label>
        Notes
        <input
          type="text"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
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
    </div>
  )

  return (
    <section className="dashboard-panel admin-lists-panel">
      <h3>Tool calibration log</h3>
      <p className="placeholder-copy resources-hint">
        Shop MTE tools (micrometers, calipers, etc.). Dead weight testers, pressure gauges, load cells, and
        chart recorders belong on <strong>Test gauges</strong>. Use <strong>Upload cert</strong> for outside-lab
        certificates on any tool. Use <strong>Recalibrate</strong> for in-house SOP 2010 checks (torque wrenches
        and gauge block standards stay cert-upload only). Prior calibrations are archived for every tool — use{' '}
        <strong>History</strong> to review them. Active tools are shown by default — click a summary card to focus
        due windows. Use column filters for Category, Department, or Status.
      </p>

      <div className="dashboard-kpis tool-cal-kpis" aria-label="Tool calibration summary">
        <button
          type="button"
          className={`kpi-card tool-cal-kpi-btn${isDefaultActiveOnly ? ' is-active' : ''}`}
          onClick={showAllActive}
        >
          <span className="kpi-label">Active tools</span>
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
            Add tool
          </button>
        ) : null}
        <button
          type="button"
          className="button-secondary"
          disabled={loading}
          onClick={() =>
            openToolCalibrationsReportPrint(sortedRows, {
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
          <h4>Add tool</h4>
          {toolFormFields}
          <div className="test-gauge-admin-actions">
            <button type="button" className="button-primary" disabled={saving} onClick={() => void saveRow()}>
              {saving ? 'Saving…' : 'Add tool'}
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
            placeholder="JS ID, type, department…"
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
              ? `Showing active tools ${dueFocusLabel(dueFocus)}`
              : `${activeColumnFilterCount} column filter${activeColumnFilterCount === 1 ? '' : 's'} active`}
            {' · '}
            {sortedRows.length} row{sortedRows.length === 1 ? '' : 's'} shown
          </span>
          <button type="button" className="button-secondary" onClick={clearTableFilters}>
            Reset to active tools
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="placeholder-copy">Loading tools…</p>
      ) : rows.length === 0 ? (
        <p className="placeholder-copy">
          No tools yet — add a tool above, or run seed-tool-calibrations.sql in Supabase.
        </p>
      ) : sortedRows.length === 0 ? (
        <p className="placeholder-copy">No tools match this search or filter.</p>
      ) : (
        <div className="dashboard-table-wrap manager-dashboard-scroll manager-dashboard-scroll--tall tool-cal-scroll">
          <table className="dashboard-table test-gauge-admin-table tool-cal-sortable-table">
            <thead>
              <tr>
                <th>{header('js_id', 'JS ID')}</th>
                <th>{header('model', 'Model')}</th>
                <th>{header('category', 'Category', 'category')}</th>
                <th>{header('tool_type', 'Type')}</th>
                <th>{header('serial_number', 'Serial')}</th>
                <th>{header('department', 'Dept', 'department')}</th>
                <th>{header('calibration_date', 'Calibrated')}</th>
                <th>{header('calibration_frequency', 'Frequency')}</th>
                <th>{header('expiration_date', 'Expires')}</th>
                <th>Certificate</th>
                <th>Notes</th>
                <th>{header('status', 'Status', 'status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const due = getToolCalibrationDueStatus(row)
                const certUrl = toolCalibrationCertificateUrl(row.certificate_storage_path)
                const external = isExternalCalibrationCategory(row.category)
                const isEditingRow = formOpen && editingId === row.id
                return (
                  <Fragment key={row.id}>
                    <tr className={due !== 'ok' ? `test-gauge-row--${due}` : undefined}>
                      <td>{row.js_id ?? '—'}</td>
                      <td>{row.model ?? '—'}</td>
                      <td>
                        <InlineCategoryCell
                          row={row}
                          disabled={categorySavingId != null && categorySavingId !== row.id}
                          onSave={(category) => saveCategoryInline(row, category)}
                        />
                      </td>
                      <td>{row.tool_type ?? '—'}</td>
                      <td>{row.serial_number ?? '—'}</td>
                      <td>{row.department ?? '—'}</td>
                      <td>{row.calibration_date ?? '—'}</td>
                      <td>
                        <InlineFrequencyCell
                          row={row}
                          disabled={frequencySavingId != null && frequencySavingId !== row.id}
                          onSave={(frequency, expirationDate) =>
                            saveFrequencyInline(row, frequency, expirationDate)
                          }
                        />
                      </td>
                      <td className={due !== 'ok' ? `test-gauge-cal-cell--${due}` : undefined}>
                        {row.expiration_date ?? '—'}
                        {due === 'critical' || due === 'due' ? (
                          <span className="test-gauge-expired-badge">Expired</span>
                        ) : due === 'expiring' ? (
                          <span className={`test-gauge-cal-badge test-gauge-cal-badge--${due}`}>
                            {formatToolDueAlert(row)}
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
                            <button
                              type="button"
                              className="link-button"
                              disabled={certBusyId === row.id}
                              onClick={() => void clearCertificate(row)}
                            >
                              Remove
                            </button>
                          </div>
                        ) : null}
                      </td>
                      <td className="table-cell-clamp" title={row.notes ?? undefined}>
                        {row.notes?.trim() || '—'}
                      </td>
                      <td>{row.status === 'out_of_service' ? 'Out of service' : 'Active'}</td>
                      <td className="test-gauge-row-actions">
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => setExternalCertTool(row)}
                        >
                          Upload cert
                        </button>
                        {!external ? (
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => setRecalibrateTool(row)}
                          >
                            Recalibrate
                          </button>
                        ) : null}
                        <button type="button" className="link-button" onClick={() => setHistoryTool(row)}>
                          History
                        </button>
                        <button type="button" className="link-button" onClick={() => startEdit(row)}>
                          {isEditingRow ? 'Close' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="link-button link-button-danger"
                          onClick={() => void removeRow(row)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    {isEditingRow ? (
                      <tr className="tool-cal-inline-edit-row">
                        <td colSpan={13}>
                          <div className="test-gauge-admin-form tool-cal-inline-edit-form">
                            <h4>Edit tool — {row.js_id ?? row.serial_number ?? row.id}</h4>
                            {toolFormFields}
                            <div className="test-gauge-admin-actions">
                              <button
                                type="button"
                                className="button-primary"
                                disabled={saving}
                                onClick={() => void saveRow()}
                              >
                                {saving ? 'Saving…' : 'Save changes'}
                              </button>
                              <button type="button" className="button-secondary" onClick={resetForm}>
                                Cancel edit
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

      {recalibrateTool ? (
        <ToolRecalibrateModal
          tool={recalibrateTool}
          showToast={showToast}
          onClose={() => setRecalibrateTool(null)}
          onSaved={() => {
            void reload()
          }}
        />
      ) : null}

      {externalCertTool ? (
        <ToolExternalCertModal
          tool={externalCertTool}
          showToast={showToast}
          onClose={() => setExternalCertTool(null)}
          onSaved={() => {
            void reload()
          }}
        />
      ) : null}

      {historyTool ? (
        <ToolCalibrationHistoryModal
          tool={historyTool}
          showToast={showToast}
          onClose={() => setHistoryTool(null)}
        />
      ) : null}
    </section>
  )
}
