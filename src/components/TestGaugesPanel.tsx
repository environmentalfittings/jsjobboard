import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from './ToastNotification'
import { TestLogColumnHeader } from './testLog/TestLogColumnHeader'
import {
  attachTestGaugeCertificate,
  createTestGauge,
  daysUntilGaugeCalibrationDue,
  deleteTestGauge,
  formatGaugeCalibrationAlert,
  getGaugeCalibrationStatus,
  loadTestGauges,
  removeTestGaugeCertificate,
  SUGGESTED_GAUGE_TYPES,
  testGaugeCertificateUrl,
  updateTestGauge,
  updateTestGaugeActive,
  updateTestGaugeType,
} from '../lib/testGaugeRegistry'
import { moveTestGaugeToToolLog } from '../lib/moveToolGaugesToTestGauges'
import { openTestGaugesReportPrint } from '../lib/testGaugesReportPrint'
import { emptyTestGaugeForm, testGaugeToForm, type TestGauge, type TestGaugeFormState } from '../types/testGauge'

const BLANK_FILTER = '(Blank)'
const STATUS_FILTER_OPTIONS = ['Active', 'Inactive'] as const
const TYPE_OTHER = 'Other'
const GAUGE_DELETE_PIN = '1582'

type DueFocus = 'due-90' | 'due-60' | 'due-30' | 'overdue'
type SortKey =
  | 'gauge_number'
  | 'manufacturer'
  | 'gauge_type'
  | 'last_calibration_date'
  | 'next_calibration_date'
  | 'active'
type SortDir = 'asc' | 'desc'
type ColumnFilters = {
  gauge_type: string[]
  status: string[]
}

const DEFAULT_COLUMN_FILTERS: ColumnFilters = {
  gauge_type: [],
  status: ['Active'],
}

const TYPE_OPTIONS = [...SUGGESTED_GAUGE_TYPES] as string[]

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

function typeSelectValue(gaugeType: string | null | undefined): string {
  const value = (gaugeType ?? '').trim()
  if (!value) return ''
  return TYPE_OPTIONS.includes(value) ? value : TYPE_OTHER
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
  const [otherText, setOtherText] = useState(() => {
    const value = (row.gauge_type ?? '').trim()
    return TYPE_OPTIONS.includes(value) ? '' : value
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelectValue(typeSelectValue(row.gauge_type))
    const value = (row.gauge_type ?? '').trim()
    setOtherText(TYPE_OPTIONS.includes(value) ? '' : value)
  }, [row.id, row.gauge_type])

  const persist = async (gaugeType: string | null) => {
    setSaving(true)
    const ok = await onSave(gaugeType)
    setSaving(false)
    if (!ok) {
      setSelectValue(typeSelectValue(row.gauge_type))
      const value = (row.gauge_type ?? '').trim()
      setOtherText(TYPE_OPTIONS.includes(value) ? '' : value)
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
          if (next === TYPE_OTHER) {
            if (otherText.trim()) void persist(otherText.trim())
            return
          }
          void persist(next || null)
        }}
      >
        <option value="">—</option>
        {TYPE_OPTIONS.map((opt) => (
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
          placeholder="Type…"
          aria-label={`Other type for ${row.gauge_number}`}
          onChange={(e) => setOtherText(e.target.value)}
          onBlur={() => {
            const next = otherText.trim()
            const current = (row.gauge_type ?? '').trim()
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
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<TestGaugeFormState>(emptyTestGaugeForm())
  const [pendingCertGaugeId, setPendingCertGaugeId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('gauge_number')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(DEFAULT_COLUMN_FILTERS)
  const [dueFocus, setDueFocus] = useState<DueFocus | null>(null)
  const [typeSavingId, setTypeSavingId] = useState<string | null>(null)
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await loadTestGauges(true))
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
    setEditingId(row.id)
    setForm(testGaugeToForm(row))
    setFormOpen(true)
  }

  const saveGauge = async () => {
    setSaving(true)
    if (editingId) {
      const { error } = await updateTestGauge(editingId, form)
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
        setUploadingId(row.id)
        const { error: certError } = await attachTestGaugeCertificate(row, certInputRef.current.files[0])
        setUploadingId(null)
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

  const saveStatusInline = async (row: TestGauge, active: boolean) => {
    if (row.active === active) return
    setStatusSavingId(row.id)
    const previous = row.active
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, active } : item)))
    const { error } = await updateTestGaugeActive(row.id, active)
    setStatusSavingId(null)
    if (error) {
      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, active: previous } : item)))
      showToast(error)
      return
    }
    showToast(active ? 'Gauge set to Active' : 'Gauge set to Inactive')
  }

  const uploadCert = async (row: TestGauge, file: File | undefined) => {
    if (!file) return
    setUploadingId(row.id)
    const { error } = await attachTestGaugeCertificate(row, file)
    setUploadingId(null)
    if (error) {
      showToast(error)
      return
    }
    showToast('Calibration certificate uploaded')
    await reload()
  }

  const clearCert = async (row: TestGauge) => {
    if (!window.confirm('Remove calibration certificate?')) return
    const { error } = await removeTestGaugeCertificate(row)
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
      if (!matchesMultiFilter(columnFilters.status, statusFilterLabel(row.active))) return false
      if (!matchesDueFocus(row, dueFocus)) return false
      if (!q) return true
      const hay = [row.gauge_number, row.manufacturer, row.gauge_type, row.active ? 'active' : 'inactive']
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
      <h3>Test gauges</h3>
      <p className="placeholder-copy resources-hint">
        Calibrated test gauges and chart recorders for the test log. Active gauges are shown by default — click a
        summary card to focus due windows. Use column filters for Type or Status.
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
        {!formOpen ? (
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

      {formOpen ? (
        <div className="test-gauge-admin-form">
          <h4>{editingId ? 'Edit gauge' : 'Add gauge'}</h4>
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
              <input
                type="text"
                list="test-gauge-type-suggestions"
                value={form.gauge_type}
                onChange={(e) => setForm((f) => ({ ...f, gauge_type: e.target.value }))}
                placeholder="e.g. Pressure, Helium, Chart recorder"
              />
              <datalist id="test-gauge-type-suggestions">
                {SUGGESTED_GAUGE_TYPES.map((type) => (
                  <option key={type} value={type} />
                ))}
              </datalist>
            </label>
            <label>
              Last calibration date
              <input
                type="date"
                value={form.last_calibration_date}
                onChange={(e) => setForm((f) => ({ ...f, last_calibration_date: e.target.value }))}
              />
            </label>
            <label>
              Next calibration date
              <input
                type="date"
                value={form.next_calibration_date}
                onChange={(e) => setForm((f) => ({ ...f, next_calibration_date: e.target.value }))}
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

          {!editingId ? (
            <label className="test-gauge-cert-upload">
              Calibration certificate (optional)
              <input
                ref={certInputRef}
                type="file"
                accept=".pdf,image/*"
                onChange={() => setPendingCertGaugeId('new')}
              />
            </label>
          ) : null}

          <div className="test-gauge-admin-actions">
            <button type="button" className="button-primary" disabled={saving} onClick={() => void saveGauge()}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add gauge'}
            </button>
            <button type="button" className="button-secondary" onClick={resetForm}>
              {editingId ? 'Cancel edit' : 'Cancel'}
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
            placeholder="Gauge #, manufacturer, type…"
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
                <th>{header('last_calibration_date', 'Calibrated')}</th>
                <th>{header('next_calibration_date', 'Expires')}</th>
                <th>Certificate</th>
                <th>{header('active', 'Status', 'status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const certUrl = testGaugeCertificateUrl(row.certificate_storage_path)
                const calStatus = getGaugeCalibrationStatus(row)
                return (
                  <tr key={row.id} className={calStatus !== 'ok' ? `test-gauge-row--${calStatus}` : undefined}>
                    <td>{row.gauge_number}</td>
                    <td>{row.manufacturer ?? '—'}</td>
                    <td>
                      <InlineTypeCell
                        row={row}
                        disabled={typeSavingId != null && typeSavingId !== row.id}
                        onSave={(gaugeType) => saveTypeInline(row, gaugeType)}
                      />
                    </td>
                    <td>{row.last_calibration_date ?? '—'}</td>
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
                      {certUrl ? (
                        <a href={certUrl} target="_blank" rel="noreferrer">
                          {row.certificate_file_name ?? 'View'}
                        </a>
                      ) : (
                        '—'
                      )}
                      <div className="test-gauge-cert-actions">
                        <label className="test-gauge-cert-inline-upload">
                          {uploadingId === row.id ? 'Uploading…' : 'Upload'}
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            disabled={uploadingId === row.id}
                            onChange={(e) => {
                              void uploadCert(row, e.target.files?.[0])
                              e.currentTarget.value = ''
                            }}
                          />
                        </label>
                        {certUrl ? (
                          <button type="button" className="link-button" onClick={() => void clearCert(row)}>
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <select
                        className="tool-cal-inline-category-select"
                        value={row.active ? 'Active' : 'Inactive'}
                        disabled={statusSavingId === row.id}
                        aria-label={`Status for ${row.gauge_number}`}
                        onChange={(e) => {
                          void saveStatusInline(row, e.target.value === 'Active')
                        }}
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </td>
                    <td className="test-gauge-row-actions">
                      <button type="button" className="link-button" onClick={() => startEdit(row)}>
                        Edit
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
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
