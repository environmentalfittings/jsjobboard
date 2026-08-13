import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ReceivedValveEditModal } from '../components/ReceivedValveEditModal'
import { ReceivedValveRfqBadge } from '../components/ReceivedValveRfqBadge'
import { TestLogColumnHeader } from '../components/testLog/TestLogColumnHeader'
import { useToast } from '../components/ToastNotification'
import {
  deleteReceivedValve,
  emptyReceivedValveForm,
  insertReceivedValve,
  isArchivedReceivedValveStatus,
  isReceivedValveStatus,
  loadReceivedValveRowsShared,
  prepareReceivedValveImage,
  RECEIVED_VALVE_STATUSES,
  RECEIVED_VALVE_STATUS_LABELS,
  receivedValveStatusLabel,
  sortReceivedValveRowsBy,
  todayIsoDate,
  updateReceivedValve,
  uploadReceivedValveImage,
  type ReceivedValveFormState,
  type ReceivedValveRecord,
  type ReceivedValveSortKey,
  type ReceivedValveStatus,
} from '../lib/receivedValves'
import { composeRfqEmail, getRfqEmail } from '../lib/rfqEmail'
import { supabase } from '../lib/supabase'

type CustomerRow = { id: number; name: string }

const BLANK_FILTER = '(Blank)'

type ReceivedValveColumnFilters = {
  receivedDate: string[]
  customer: string[]
  description: string[]
  teardownInspectionDate: string[]
  warehouseCheckInDate: string[]
  estimateNumber: string[]
  salesOrderNumber: string[]
  workOrderPrinted: string[]
  status: string[]
  rfq: string[]
  notes: string[]
}

const EMPTY_COLUMN_FILTERS: ReceivedValveColumnFilters = {
  receivedDate: [],
  customer: [],
  description: [],
  teardownInspectionDate: [],
  warehouseCheckInDate: [],
  estimateNumber: [],
  salesOrderNumber: [],
  workOrderPrinted: [],
  status: [],
  rfq: [],
  notes: [],
}

function displayOrBlank(value: string) {
  return value.trim() ? value : BLANK_FILTER
}

function uniqueSortedValues(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

function matchesColumnFilter(selected: string[], value: string) {
  if (!selected.length) return true
  return selected.includes(value)
}

function detailsFromRow(row: Pick<
  ReceivedValveRecord,
  | 'receivedDate'
  | 'customer'
  | 'description'
  | 'teardownInspectionDate'
  | 'warehouseCheckInDate'
  | 'estimateNumber'
  | 'salesOrderNumber'
  | 'workOrderPrinted'
  | 'status'
  | 'notes'
  | 'imageName'
  | 'imageDataUrl'
>) {
  return {
    receivedDate: row.receivedDate,
    customer: row.customer,
    description: row.description,
    teardownInspectionDate: row.teardownInspectionDate,
    warehouseCheckInDate: row.warehouseCheckInDate,
    estimateNumber: row.estimateNumber,
    salesOrderNumber: row.salesOrderNumber,
    workOrderPrinted: row.workOrderPrinted,
    status: receivedValveStatusLabel(row.status),
    notes: row.notes,
    imageName: row.imageName,
    imageUrl: row.imageDataUrl,
  }
}

export function ReceivedValvesPage() {
  const { showToast } = useToast()
  const [form, setForm] = useState<ReceivedValveFormState>(() => emptyReceivedValveForm())
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [rows, setRows] = useState<ReceivedValveRecord[]>([])
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingCustomers, setLoadingCustomers] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendingRfqId, setSendingRfqId] = useState<string | null>(null)
  const [missingTable, setMissingTable] = useState(false)
  const [lastSavedId, setLastSavedId] = useState<string | null>(null)
  const [columnFilters, setColumnFilters] = useState<ReceivedValveColumnFilters>(EMPTY_COLUMN_FILTERS)
  const [sortKey, setSortKey] = useState<ReceivedValveSortKey>('receivedDate')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({})
  const [editingRow, setEditingRow] = useState<ReceivedValveRecord | null>(null)
  const rfqEmail = getRfqEmail()

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true)
    const { data, error } = await supabase.from('customers').select('id,name').order('name')
    setLoadingCustomers(false)
    if (error) {
      showToast('Could not load customers')
      return
    }
    setCustomers((data ?? []) as CustomerRow[])
  }, [showToast])

  const reloadRows = useCallback(async () => {
    setLoading(true)
    const result = await loadReceivedValveRowsShared()
    setLoading(false)
    if (!result.ok) {
      setMissingTable(Boolean(result.missingTable))
      showToast(
        result.missingTable
          ? 'Received valves table is missing — run supabase/migration-received-valves.sql in Supabase'
          : `Could not load received valves: ${result.error}`,
      )
      return
    }
    setMissingTable(false)
    setRows(result.rows)
    if (result.migrated > 0) {
      showToast(`Moved ${result.migrated} local received-valve entr${result.migrated === 1 ? 'y' : 'ies'} to shared storage`)
    }
  }, [showToast])

  useEffect(() => {
    void reloadRows()
    void loadCustomers()
  }, [loadCustomers, reloadRows])

  const filterOptions = useMemo(() => {
    return {
      receivedDate: uniqueSortedValues(rows.map((row) => displayOrBlank(row.receivedDate))),
      customer: uniqueSortedValues(rows.map((row) => displayOrBlank(row.customer))),
      description: uniqueSortedValues(rows.map((row) => displayOrBlank(row.description))),
      teardownInspectionDate: uniqueSortedValues(rows.map((row) => displayOrBlank(row.teardownInspectionDate))),
      warehouseCheckInDate: uniqueSortedValues(rows.map((row) => displayOrBlank(row.warehouseCheckInDate))),
      estimateNumber: uniqueSortedValues(rows.map((row) => displayOrBlank(row.estimateNumber))),
      salesOrderNumber: uniqueSortedValues(rows.map((row) => displayOrBlank(row.salesOrderNumber))),
      workOrderPrinted: uniqueSortedValues(rows.map((row) => (row.workOrderPrinted ? 'Yes' : 'No'))),
      status: uniqueSortedValues(rows.map((row) => receivedValveStatusLabel(row.status))),
      rfq: uniqueSortedValues(rows.map((row) => (row.sentToRfqAt ? 'Sent' : 'Not sent'))),
      notes: uniqueSortedValues(rows.map((row) => displayOrBlank(row.notes))),
    }
  }, [rows])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!matchesColumnFilter(columnFilters.receivedDate, displayOrBlank(row.receivedDate))) return false
      if (!matchesColumnFilter(columnFilters.customer, displayOrBlank(row.customer))) return false
      if (!matchesColumnFilter(columnFilters.description, displayOrBlank(row.description))) return false
      if (!matchesColumnFilter(columnFilters.teardownInspectionDate, displayOrBlank(row.teardownInspectionDate))) return false
      if (!matchesColumnFilter(columnFilters.warehouseCheckInDate, displayOrBlank(row.warehouseCheckInDate))) return false
      if (!matchesColumnFilter(columnFilters.estimateNumber, displayOrBlank(row.estimateNumber))) return false
      if (!matchesColumnFilter(columnFilters.salesOrderNumber, displayOrBlank(row.salesOrderNumber))) return false
      if (!matchesColumnFilter(columnFilters.workOrderPrinted, row.workOrderPrinted ? 'Yes' : 'No')) return false
      if (!matchesColumnFilter(columnFilters.status, receivedValveStatusLabel(row.status))) return false
      if (!matchesColumnFilter(columnFilters.rfq, row.sentToRfqAt ? 'Sent' : 'Not sent')) return false
      if (!matchesColumnFilter(columnFilters.notes, displayOrBlank(row.notes))) return false
      return true
    })
  }, [rows, columnFilters])

  const sortedRows = useMemo(
    () => sortReceivedValveRowsBy(filteredRows, sortKey, sortDirection),
    [filteredRows, sortKey, sortDirection],
  )

  const activeFilterCount = useMemo(
    () => Object.values(columnFilters).reduce((count, selected) => count + (selected.length ? 1 : 0), 0),
    [columnFilters],
  )

  const setColumnFilter = (key: keyof ReceivedValveColumnFilters, selected: string[]) => {
    setColumnFilters((prev) => ({ ...prev, [key]: selected }))
  }

  const toggleSort = (key: ReceivedValveSortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection(key === 'receivedDate' ? 'desc' : 'asc')
  }

  const onImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const prepared = await prepareReceivedValveImage(file)
      if (!prepared.ok) {
        showToast(prepared.error)
        return
      }
      setImageFile(prepared.file)
      setForm((prev) => ({
        ...prev,
        imageDataUrl: prepared.dataUrl,
        imageName: prepared.file.name,
      }))
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown upload error'
      showToast(msg)
    } finally {
      event.target.value = ''
    }
  }

  const clearImage = () => {
    setImageFile(null)
    setForm((prev) => ({
      ...prev,
      imageDataUrl: null,
      imageName: null,
    }))
  }

  const markSentToRfq = async (id: string) => {
    const sentToRfqAt = new Date().toISOString()
    const result = await updateReceivedValve(id, { sentToRfqAt })
    if (!result.ok) {
      showToast(result.error)
      return
    }
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, sentToRfqAt } : row)))
  }

  const sendRowToRfq = async (row: ReceivedValveRecord, file?: File | null) => {
    setSendingRfqId(row.id)
    try {
      const result = await composeRfqEmail({
        details: detailsFromRow(row),
        imageFile: file ?? null,
        imageDataUrl: row.imageDataUrl,
      })
      if (result.ok) {
        await markSentToRfq(row.id)
        showToast(result.message)
      } else {
        showToast(result.message)
      }
    } finally {
      setSendingRfqId(null)
    }
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.customer.trim()) {
      showToast('Customer is required')
      return
    }
    if (!form.description.trim()) {
      showToast('Description is required')
      return
    }
    if (missingTable) {
      showToast('Run supabase/migration-received-valves.sql in Supabase before saving')
      return
    }

    setSaving(true)
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()

    let imageDataUrl: string | null = null
    let imageStoragePath: string | null = null
    let imageName: string | null = form.imageName

    if (imageFile) {
      const uploaded = await uploadReceivedValveImage(id, imageFile)
      if (!uploaded.ok) {
        setSaving(false)
        showToast(uploaded.error)
        return
      }
      imageDataUrl = uploaded.url
      imageStoragePath = uploaded.storagePath
    }

    const nextRow: ReceivedValveRecord = {
      id,
      receivedDate: form.receivedDate || todayIsoDate(),
      customer: form.customer.trim(),
      description: form.description.trim(),
      teardownInspectionDate: form.teardownInspectionDate || '',
      warehouseCheckInDate: form.warehouseCheckInDate || '',
      estimateNumber: form.estimateNumber.trim(),
      salesOrderNumber: form.salesOrderNumber.trim(),
      workOrderPrinted: form.workOrderPrinted === 'yes',
      status: form.status,
      notes: form.notes.trim(),
      imageDataUrl,
      imageStoragePath,
      imageName,
      sentToRfqAt: null,
      createdAt,
    }

    const insertResult = await insertReceivedValve(nextRow)
    if (!insertResult.ok) {
      setSaving(false)
      showToast(insertResult.error)
      return
    }

    setForm(emptyReceivedValveForm())
    setImageFile(null)
    setRows((prev) => [nextRow, ...prev])
    setLastSavedId(nextRow.id)
    setSaving(false)
    showToast('Saved. Use Send to RFQ on that entry below when you are ready.')
  }

  const changeStatus = async (row: ReceivedValveRecord, status: ReceivedValveStatus) => {
    if (row.status === status) return
    const result = await updateReceivedValve(row.id, { status })
    if (!result.ok) {
      showToast(
        result.error.includes('received_valves_status_check') || /check constraint/i.test(result.error)
          ? `Could not save status — run the status SQL migration in Supabase (${result.error})`
          : `Could not save status: ${result.error}`,
      )
      return
    }
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, status } : item)))
    showToast(
      isArchivedReceivedValveStatus(status)
        ? `Marked ${receivedValveStatusLabel(status)} — moved to bottom of list (still in Reports; leaves Dashboard)`
        : `Status updated to ${receivedValveStatusLabel(status)}`,
    )
  }

  const saveNotes = async (row: ReceivedValveRecord, notes: string) => {
    const nextNotes = notes.trim()
    if (nextNotes === row.notes.trim()) {
      setNotesDrafts((prev) => {
        const copy = { ...prev }
        delete copy[row.id]
        return copy
      })
      return
    }
    const result = await updateReceivedValve(row.id, { notes: nextNotes })
    if (!result.ok) {
      showToast(result.error)
      return
    }
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, notes: nextNotes } : item)))
    setNotesDrafts((prev) => {
      const copy = { ...prev }
      delete copy[row.id]
      return copy
    })
    showToast('Notes saved')
  }

  const removeRow = async (row: ReceivedValveRecord) => {
    const result = await deleteReceivedValve(row)
    if (!result.ok) {
      showToast(result.error)
      return
    }
    setRows((prev) => prev.filter((item) => item.id !== row.id))
    showToast('Entry removed')
  }

  return (
    <section className="dashboard-page">
      <div className="dashboard-title-row">
        <h2 className="dashboard-title">Received Valves</h2>
        <Link to="/dashboard" className="button-secondary">
          Back to dashboard
        </Link>
      </div>

      <section className="dashboard-panel">
        <h3>Log received valve</h3>
        <p className="placeholder-copy">
          Track incoming valves with key dates, order references, and an optional photo. Entries are shared for all
          users. Open statuses stay on the Dashboard; Converted and Lost drop off the Dashboard but stay in Reports.
          Save first, then use <strong>Send to RFQ</strong> on the saved entry to email {rfqEmail}.
        </p>
        {missingTable ? (
          <p className="status-breakdown-note">
            Shared storage is not set up yet. Run <code>supabase/migration-received-valves.sql</code> in the Supabase
            SQL Editor, then refresh this page.
          </p>
        ) : null}
        <form className="received-valves-form" onSubmit={onSubmit}>
          <label>
            Date received
            <input
              type="date"
              value={form.receivedDate}
              onChange={(e) => setForm((prev) => ({ ...prev, receivedDate: e.target.value }))}
            />
          </label>
          <label>
            Customer
            <select
              value={form.customer}
              onChange={(e) => setForm((prev) => ({ ...prev, customer: e.target.value }))}
              disabled={loadingCustomers}
              required
            >
              <option value="">— Select customer —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            {loadingCustomers ? <span className="status-breakdown-note">Loading customer list…</span> : null}
          </label>
          <label className="received-valves-span-full">
            Description
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Valve details / notes"
              rows={3}
              required
            />
          </label>
          <label>
            Teardown inspection date
            <input
              type="date"
              value={form.teardownInspectionDate}
              onChange={(e) => setForm((prev) => ({ ...prev, teardownInspectionDate: e.target.value }))}
            />
          </label>
          <label>
            Warehouse check in date
            <input
              type="date"
              value={form.warehouseCheckInDate}
              onChange={(e) => setForm((prev) => ({ ...prev, warehouseCheckInDate: e.target.value }))}
            />
          </label>
          <label>
            Estimate number
            <input
              type="text"
              value={form.estimateNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, estimateNumber: e.target.value }))}
              placeholder="Estimate #"
            />
          </label>
          <label>
            Sales order number
            <input
              type="text"
              value={form.salesOrderNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, salesOrderNumber: e.target.value }))}
              placeholder="Sales order #"
            />
          </label>
          <label>
            Work order printed out
            <select
              value={form.workOrderPrinted}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  workOrderPrinted: e.target.value === 'yes' ? 'yes' : 'no',
                }))
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
          <div className="received-valves-image-wrap received-valves-span-full">
            <label>
              Picture
              <input type="file" accept="image/*" onChange={onImageChange} />
            </label>
            <p className="status-breakdown-note">
              On iPad, choose Take Photo or Photo Library. Large photos are compressed automatically (up to 20 MB
              original).
            </p>
            {form.imageDataUrl ? (
              <div className="received-valves-image-preview">
                <img src={form.imageDataUrl} alt={form.imageName ?? 'Valve upload preview'} />
                <div className="received-valves-image-meta">
                  <span>{form.imageName ?? 'Image attached'}</span>
                  <button type="button" className="button-secondary" onClick={clearImage}>
                    Remove image
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <label className="received-valves-span-full">
            Status
            <select
              value={form.status}
              onChange={(e) => {
                const value = e.target.value
                if (!isReceivedValveStatus(value)) return
                setForm((prev) => ({ ...prev, status: value }))
              }}
            >
              {RECEIVED_VALVE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {RECEIVED_VALVE_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <span className="status-breakdown-note">
              Waiting on Salesman / Waiting on Customer / Quoted stay on the Dashboard. Converted and Lost drop off the
              Dashboard, sort to the bottom of this log, and remain in Reports.
            </span>
          </label>

          <label className="received-valves-span-full">
            Notes
            <textarea
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Follow-up notes, quote details, customer feedback…"
              rows={3}
            />
          </label>

          <div className="received-valves-actions received-valves-span-full">
            <button type="submit" className="button-primary" disabled={saving || sendingRfqId !== null || missingTable}>
              {saving ? 'Saving…' : 'Save received valve'}
            </button>
          </div>
        </form>
        {lastSavedId ? (
          <div className="received-valves-rfq-next">
            <p className="status-breakdown-note">
              Entry saved. Send it to {rfqEmail} when ready (picture link is included; Outlook may download the file to
              attach).
            </p>
            <button
              type="button"
              className="button-primary"
              disabled={sendingRfqId === lastSavedId}
              onClick={() => {
                const row = rows.find((item) => item.id === lastSavedId)
                if (!row) {
                  showToast('Saved entry not found — use Send to RFQ in the log below.')
                  return
                }
                void sendRowToRfq(row)
              }}
            >
              {sendingRfqId === lastSavedId ? 'Opening…' : 'Send to RFQ'}
            </button>
          </div>
        ) : (
          <p className="status-breakdown-note" style={{ marginTop: 12 }}>
            Save an entry first, then Send to RFQ becomes available.
          </p>
        )}
      </section>

      <section className="dashboard-panel">
        <h3>Received valve log</h3>
        <p className="status-breakdown-note">
          {loading
            ? 'Loading…'
            : `Showing ${sortedRows.length} of ${rows.length} entries. Click a column name to sort, or the filter icon (☰ lines) next to it to filter like Excel. Converted and Lost stay at the bottom.`}
        </p>
        {activeFilterCount > 0 ? (
          <div className="received-valves-filter-bar">
            <span>
              {activeFilterCount} column filter{activeFilterCount === 1 ? '' : 's'} active
            </span>
            <button type="button" className="button-secondary" onClick={() => setColumnFilters(EMPTY_COLUMN_FILTERS)}>
              Clear filters
            </button>
          </div>
        ) : null}
        <div className="dashboard-table-wrap">
          <table className="dashboard-table received-valves-log-table">
            <thead>
              <tr>
                <th>Picture</th>
                <th>
                  <TestLogColumnHeader
                    label="Date"
                    sortActive={sortKey === 'receivedDate'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('receivedDate')}
                    filterOptions={filterOptions.receivedDate}
                    selectedFilters={columnFilters.receivedDate}
                    onFilterChange={(selected) => setColumnFilter('receivedDate', selected)}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Customer"
                    sortActive={sortKey === 'customer'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('customer')}
                    filterOptions={filterOptions.customer}
                    selectedFilters={columnFilters.customer}
                    onFilterChange={(selected) => setColumnFilter('customer', selected)}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Description"
                    sortActive={sortKey === 'description'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('description')}
                    filterOptions={filterOptions.description}
                    selectedFilters={columnFilters.description}
                    onFilterChange={(selected) => setColumnFilter('description', selected)}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Teardown inspection"
                    sortActive={sortKey === 'teardownInspectionDate'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('teardownInspectionDate')}
                    filterOptions={filterOptions.teardownInspectionDate}
                    selectedFilters={columnFilters.teardownInspectionDate}
                    onFilterChange={(selected) => setColumnFilter('teardownInspectionDate', selected)}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Warehouse check in"
                    sortActive={sortKey === 'warehouseCheckInDate'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('warehouseCheckInDate')}
                    filterOptions={filterOptions.warehouseCheckInDate}
                    selectedFilters={columnFilters.warehouseCheckInDate}
                    onFilterChange={(selected) => setColumnFilter('warehouseCheckInDate', selected)}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Estimate #"
                    sortActive={sortKey === 'estimateNumber'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('estimateNumber')}
                    filterOptions={filterOptions.estimateNumber}
                    selectedFilters={columnFilters.estimateNumber}
                    onFilterChange={(selected) => setColumnFilter('estimateNumber', selected)}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Sales order #"
                    sortActive={sortKey === 'salesOrderNumber'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('salesOrderNumber')}
                    filterOptions={filterOptions.salesOrderNumber}
                    selectedFilters={columnFilters.salesOrderNumber}
                    onFilterChange={(selected) => setColumnFilter('salesOrderNumber', selected)}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="WO printed"
                    sortActive={sortKey === 'workOrderPrinted'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('workOrderPrinted')}
                    filterOptions={filterOptions.workOrderPrinted}
                    selectedFilters={columnFilters.workOrderPrinted}
                    onFilterChange={(selected) => setColumnFilter('workOrderPrinted', selected)}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Status"
                    sortActive={sortKey === 'status'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('status')}
                    filterOptions={filterOptions.status}
                    selectedFilters={columnFilters.status}
                    onFilterChange={(selected) => setColumnFilter('status', selected)}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Notes"
                    sortActive={sortKey === 'notes'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('notes')}
                    filterOptions={filterOptions.notes}
                    selectedFilters={columnFilters.notes}
                    onFilterChange={(selected) => setColumnFilter('notes', selected)}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="RFQ"
                    sortActive={sortKey === 'rfq'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('rfq')}
                    filterOptions={filterOptions.rfq}
                    selectedFilters={columnFilters.rfq}
                    onFilterChange={(selected) => setColumnFilter('rfq', selected)}
                  />
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length ? (
                sortedRows.map((row) => (
                  <tr
                    key={row.id}
                    className={[
                      row.id === lastSavedId ? 'received-valves-row-highlight' : '',
                      isArchivedReceivedValveStatus(row.status) ? 'received-valves-row-archived' : '',
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined}
                  >
                    <td>
                      {row.imageDataUrl ? (
                        <a
                          href={row.imageDataUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="received-valves-image-link"
                        >
                          <img src={row.imageDataUrl} alt={row.imageName ?? 'Received valve'} />
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>{row.receivedDate || '-'}</td>
                    <td>{row.customer}</td>
                    <td className="table-cell-clamp">{row.description}</td>
                    <td>{row.teardownInspectionDate || '-'}</td>
                    <td>{row.warehouseCheckInDate || '-'}</td>
                    <td>{row.estimateNumber || '-'}</td>
                    <td>{row.salesOrderNumber || '-'}</td>
                    <td>{row.workOrderPrinted ? 'Yes' : 'No'}</td>
                    <td>
                      <select
                        className="received-valves-status-select"
                        value={row.status}
                        aria-label={`Status for ${row.customer}`}
                        onChange={(e) => {
                          const value = e.target.value
                          if (!isReceivedValveStatus(value)) return
                          void changeStatus(row, value)
                        }}
                      >
                        {RECEIVED_VALVE_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {RECEIVED_VALVE_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <textarea
                        className="received-valves-notes-input"
                        rows={2}
                        value={notesDrafts[row.id] ?? row.notes}
                        placeholder="Add notes…"
                        aria-label={`Notes for ${row.customer}`}
                        onChange={(e) =>
                          setNotesDrafts((prev) => ({
                            ...prev,
                            [row.id]: e.target.value,
                          }))
                        }
                        onBlur={(e) => void saveNotes(row, e.target.value)}
                      />
                    </td>
                    <td>
                      <ReceivedValveRfqBadge sentToRfqAt={row.sentToRfqAt} />
                    </td>
                    <td>
                      <div className="received-valves-row-actions">
                        <button type="button" className="button-secondary" onClick={() => setEditingRow(row)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className={row.id === lastSavedId && !row.sentToRfqAt ? 'button-primary' : 'button-secondary'}
                          disabled={sendingRfqId === row.id}
                          title={
                            sendingRfqId === row.id
                              ? 'Opening email…'
                              : row.sentToRfqAt
                                ? 'Resend RFQ email'
                                : 'Send to RFQ'
                          }
                          onClick={() => void sendRowToRfq(row)}
                        >
                          {sendingRfqId === row.id ? '…' : 'RFQ'}
                        </button>
                        <button type="button" className="button-secondary" onClick={() => void removeRow(row)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={13} className="table-empty-cell">
                    {loading
                      ? 'Loading received valves…'
                      : activeFilterCount > 0
                        ? 'No entries match the current filters.'
                        : 'No received valves logged yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editingRow ? (
        <ReceivedValveEditModal
          row={editingRow}
          onClose={() => setEditingRow(null)}
          onSaved={(next) => {
            setEditingRow(null)
            setRows((prev) => prev.map((item) => (item.id === next.id ? next : item)))
          }}
          onError={(message) => showToast(message)}
          onMessage={(message) => showToast(message)}
        />
      ) : null}
    </section>
  )
}
