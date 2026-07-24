import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from './ToastNotification'
import { TestLogColumnHeader } from './testLog/TestLogColumnHeader'
import {
  createToolCalibration,
  daysUntilToolExpiration,
  deleteToolCalibration,
  formatToolDueAlert,
  getToolCalibrationDueStatus,
  loadToolCalibrations,
  updateToolCalibration,
  updateToolCalibrationCategory,
} from '../lib/toolCalibrationRegistry'
import {
  emptyToolCalibrationForm,
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

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await loadToolCalibrations(true))
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
    setEditingId(row.id)
    setForm(toolCalibrationToForm(row))
    setFormOpen(true)
  }

  const saveRow = async () => {
    setSaving(true)
    if (editingId != null) {
      const { error } = await updateToolCalibration(editingId, form)
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
    const { error } = await deleteToolCalibration(row.id)
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

  return (
    <section className="dashboard-panel admin-lists-panel">
      <h3>Tool calibration log</h3>
      <p className="placeholder-copy resources-hint">
        Shop MTE tools (micrometers, calipers, etc.) from the Tool Calibration Log workbook. Update dates here
        when tools are recalibrated. Active tools are shown by default — click a summary card to focus due
        windows. Use column filters for Category, Department, or Status.
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

      {!formOpen ? (
        <div className="test-gauge-admin-actions" style={{ marginBottom: 12 }}>
          <button type="button" className="button-primary" onClick={openAddForm}>
            Add tool
          </button>
        </div>
      ) : (
        <div className="test-gauge-admin-form">
          <h4>{editingId != null ? 'Edit tool' : 'Add tool'}</h4>
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
                onChange={(e) => setForm((f) => ({ ...f, calibration_date: e.target.value }))}
              />
            </label>
            <label>
              Expiration date
              <input
                type="date"
                value={form.expiration_date}
                onChange={(e) => setForm((f) => ({ ...f, expiration_date: e.target.value }))}
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
          </div>
          <div className="test-gauge-admin-actions">
            <button type="button" className="button-primary" disabled={saving} onClick={() => void saveRow()}>
              {saving ? 'Saving…' : editingId != null ? 'Save changes' : 'Add tool'}
            </button>
            <button type="button" className="button-secondary" onClick={resetForm}>
              {editingId != null ? 'Cancel edit' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

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
                <th>{header('expiration_date', 'Expires')}</th>
                <th>{header('status', 'Status', 'status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const due = getToolCalibrationDueStatus(row)
                return (
                  <tr key={row.id} className={due !== 'ok' ? `test-gauge-row--${due}` : undefined}>
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
                    <td>{row.status === 'out_of_service' ? 'Out of service' : 'Active'}</td>
                    <td className="test-gauge-row-actions">
                      <button type="button" className="link-button" onClick={() => startEdit(row)}>
                        Edit
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
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
