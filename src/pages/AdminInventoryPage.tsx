import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import { TestLogColumnHeader } from '../components/testLog/TestLogColumnHeader'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import { useEmployees } from '../hooks/useEmployees'
import {
  findCustomerByName,
  loadCustomersWithSalesRep,
  updateCustomerSalesRep,
  type CustomerSalesRepRow,
} from '../lib/customers'
import {
  buildInventoryItemUrl,
  allocateNextJsInventoryId,
  createInventoryRecord,
  customerIdNosForCustomer,
  emptyDocumentDraft,
  emptyInventoryForm,
  emptyPhotoDraft,
  getInventoryRecordById,
  INVENTORY_CONDITIONS,
  INVENTORY_OPERATORS,
  INVENTORY_ORIGINS,
  formatInventoryLocationLabel,
  inventoryConditionLabel,
  inventoryEventLabel,
  inventoryMatchesSearch,
  inventoryToForm,
  isInventoryRemoved,
  loadInventoryEvents,
  loadInventoryFormOptions,
  loadInventoryRecords,
  loadRemovedInventoryRecords,
  normalizeTravelerLink,
  removeInventoryRecord,
  restoreInventoryRecord,
  updateInventoryRecord,
  validateInventoryDocument,
  validateInventoryPhoto,
  assertInventoryFileReadable,
  type InventoryCondition,
  type InventoryDocumentDraft,
  type InventoryEvent,
  type InventoryFormState,
  type InventoryPhotoDraft,
  type InventoryRecord,
} from '../lib/inventory'
import {
  buildInventoryCustomerReportStats,
  currentInventoryReportPeriod,
  formatInventoryCustomerReportMessage,
  groupInventoryByCustomer,
  printInventoryCustomerReport,
} from '../lib/inventoryCustomerReport'
import { clearInventoryMonthlyReportAlert } from '../lib/inventoryMonthlyAlert'
import { printInventoryLabelSheet } from '../lib/inventoryLabelPrint'
import {
  notifySalesRepCustomerInventoryReport,
  resolveEmployeeAuthUserId,
} from '../lib/messages'

type ModalMode = 'create' | 'edit' | 'duplicate'
type ListScope = 'active' | 'removed' | 'activity'

function Field({
  label,
  required,
  children,
  className = '',
}: {
  label: string
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`inventory-field ${className}`.trim()}>
      <span className="inventory-field-label">
        {label}
        {required ? <span className="inventory-required"> *</span> : null}
      </span>
      {children}
    </div>
  )
}

/** Portal dropdown — native <select> often fails inside overflow scroll + modal overlays. */
function ModalSelect({
  value,
  onChange,
  options,
  placeholder = '— Select —',
  disabled,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  disabled?: boolean
  'aria-label'?: string
}) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 })

  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? (value.trim() ? value : placeholder)

  const updateMenuPos = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const maxHeight = 260
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const openUp = spaceBelow < Math.min(maxHeight, 160) && rect.top > spaceBelow
    setMenuPos({
      top: openUp ? Math.max(8, rect.top - Math.min(maxHeight, spaceBelow > 80 ? spaceBelow : maxHeight) - 4) : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    updateMenuPos()
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (rootRef.current?.contains(target as Node)) return
      if (target?.closest(`[data-inventory-select-menu="${listId}"]`)) return
      setOpen(false)
    }
    const onReposition = () => updateMenuPos()
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, listId, updateMenuPos])

  const pick = (next: string) => {
    onChange(next)
    setOpen(false)
  }

  return (
    <div className="inventory-modal-select" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="inventory-modal-select-trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          setOpen((prev) => !prev)
        }}
      >
        <span className={value.trim() ? undefined : 'inventory-modal-select-placeholder'}>{selectedLabel}</span>
        <span className="inventory-modal-select-chevron" aria-hidden>
          ▾
        </span>
      </button>
      {open && !disabled
        ? createPortal(
            <ul
              className="inventory-modal-select-menu"
              id={listId}
              role="listbox"
              data-inventory-select-menu={listId}
              style={{
                position: 'fixed',
                top: menuPos.top,
                left: menuPos.left,
                width: menuPos.width,
                zIndex: 220,
              }}
            >
              <li role="none">
                <button
                  type="button"
                  role="option"
                  className={`inventory-modal-select-option${!value ? ' is-selected' : ''}`}
                  aria-selected={!value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick('')}
                >
                  {placeholder}
                </button>
              </li>
              {options.map((option) => (
                <li key={option.value} role="none">
                  <button
                    type="button"
                    role="option"
                    className={`inventory-modal-select-option${option.value === value ? ' is-selected' : ''}`}
                    aria-selected={option.value === value}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(option.value)}
                  >
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}

/** Type freely; pick from suggestions filtered by the current list. */
function FreeTextCombobox({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  emptyHint,
  /** When open and the input still matches the committed value, list every option (not only matches). */
  showAllUntilTyped = false,
  maxSuggestions = 40,
  clearAriaLabel = 'Clear customer ID',
}: {
  options: string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  emptyHint?: string
  showAllUntilTyped?: boolean
  maxSuggestions?: number
  clearAriaLabel?: string
}) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 })
  const [typedAway, setTypedAway] = useState(false)

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase()
    const listAll = showAllUntilTyped && open && !typedAway
    const list = listAll || !q
      ? options
      : options.filter((option) => option.toLowerCase().includes(q))
    return list.slice(0, maxSuggestions)
  }, [options, value, showAllUntilTyped, open, typedAway, maxSuggestions])

  const updateMenuPos = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
  }, [])

  useEffect(() => {
    if (!open) return
    updateMenuPos()
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      const target = event.target as HTMLElement | null
      if (target?.closest(`[data-inventory-id-menu="${listId}"]`)) return
      setOpen(false)
      setTypedAway(false)
    }
    const onReposition = () => updateMenuPos()
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, listId, updateMenuPos])

  const pick = (next: string) => {
    onChange(next)
    setTypedAway(false)
    setOpen(false)
  }

  const showMenu = open && !disabled && (suggestions.length > 0 || Boolean(emptyHint))

  return (
    <div className="job-board-wo-combobox inventory-customer-id-combobox" ref={rootRef}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          setTypedAway(true)
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          setTypedAway(false)
          setOpen(true)
          queueMicrotask(() => inputRef.current?.select())
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            setTypedAway(false)
            return
          }
          if (e.key === 'Enter' && open && suggestions[0]) {
            e.preventDefault()
            pick(suggestions[0])
          }
        }}
      />
      {value ? (
        <button
          type="button"
          className="job-board-wo-clear"
          onClick={() => {
            onChange('')
            setTypedAway(true)
            setOpen(true)
            inputRef.current?.focus()
          }}
          aria-label={clearAriaLabel}
        >
          ×
        </button>
      ) : null}
      {showMenu
        ? createPortal(
            <ul
              className="job-board-wo-suggestions inventory-customer-id-menu"
              id={listId}
              role="listbox"
              data-inventory-id-menu={listId}
              style={{
                position: 'fixed',
                top: menuPos.top,
                left: menuPos.left,
                width: menuPos.width,
                right: 'auto',
                zIndex: 220,
              }}
            >
              {suggestions.length > 0 ? (
                suggestions.map((option) => (
                  <li key={option} role="none">
                    <button
                      type="button"
                      role="option"
                      className="job-board-wo-suggestion"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pick(option)}
                    >
                      <strong>{option}</strong>
                    </button>
                  </li>
                ))
              ) : (
                <li className="job-board-wo-suggestion-empty" role="option" aria-disabled>
                  {emptyHint}
                </li>
              )}
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}

function PhotoCard({
  title,
  hint,
  draft,
  required,
  inputId,
  onPick,
  onClear,
}: {
  title: string
  hint: string
  draft: InventoryPhotoDraft
  required?: boolean
  inputId: string
  onPick: (file: File) => void | Promise<void>
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const preview = draft.previewUrl || draft.existingUrl

  return (
    <div className={`inventory-photo-card${preview ? ' has-preview' : ''}`}>
      <div className="inventory-photo-card-head">
        <h4>
          {title}
          {required ? <span className="inventory-required"> *</span> : null}
        </h4>
        <p>{hint}</p>
      </div>
      {preview ? (
        <div className="inventory-photo-preview">
          <img src={preview} alt={title} />
        </div>
      ) : (
        <button
          type="button"
          className="inventory-photo-drop"
          onClick={() => inputRef.current?.click()}
        >
          <span className="inventory-photo-drop-title">Add photo</span>
          <span className="inventory-photo-drop-sub">Click to upload or use camera</span>
        </button>
      )}
      <div className="inventory-photo-actions">
        <button type="button" className="button-secondary" onClick={() => inputRef.current?.click()}>
          {preview ? 'Replace' : 'Upload'}
        </button>
        <button type="button" className="button-secondary" onClick={() => cameraRef.current?.click()}>
          Camera
        </button>
        {preview ? (
          <button type="button" className="button-secondary" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/*"
        className="inventory-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onPick(file)
          e.target.value = ''
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="inventory-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onPick(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function DocumentCard({
  draft,
  onPick,
  onClear,
}: {
  draft: InventoryDocumentDraft
  onPick: (file: File) => void | Promise<void>
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const label = draft.file?.name || draft.existingName || 'MTR / traveler PDF'
  const hasFile = Boolean(draft.file || draft.existingUrl)

  return (
    <div className={`inventory-document-card${hasFile ? ' has-file' : ''}`}>
      <div className="inventory-photo-card-head">
        <h4>MTR / traveler PDF</h4>
        <p>Optional — upload the manufacturer test report or traveler as a PDF.</p>
      </div>
      {hasFile ? (
        <div className="inventory-document-preview">
          <strong>{label}</strong>
          {draft.existingUrl && !draft.file ? (
            <a href={draft.existingUrl} target="_blank" rel="noreferrer">
              Open PDF
            </a>
          ) : (
            <span>Ready to upload on save</span>
          )}
        </div>
      ) : (
        <button type="button" className="inventory-photo-drop" onClick={() => inputRef.current?.click()}>
          <span className="inventory-photo-drop-title">Upload PDF</span>
          <span className="inventory-photo-drop-sub">MTR or traveler · max 20 MB</span>
        </button>
      )}
      <div className="inventory-photo-actions">
        <button type="button" className="button-secondary" onClick={() => inputRef.current?.click()}>
          {hasFile ? 'Replace PDF' : 'Choose PDF'}
        </button>
        {hasFile ? (
          <button type="button" className="button-secondary" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="inventory-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onPick(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

const INVENTORY_BLANK_FILTER = '(Blank)'

type InventorySortKey =
  | 'jsInventoryId'
  | 'customer'
  | 'customerValveId'
  | 'manufacturer'
  | 'type'
  | 'size'
  | 'pressure'
  | 'location'

type InventoryColumnFilters = {
  jsInventoryId: string[]
  customer: string[]
  customerValveId: string[]
  manufacturer: string[]
  type: string[]
  size: string[]
  pressure: string[]
  location: string[]
}

const EMPTY_INVENTORY_COLUMN_FILTERS: InventoryColumnFilters = {
  jsInventoryId: [],
  customer: [],
  customerValveId: [],
  manufacturer: [],
  type: [],
  size: [],
  pressure: [],
  location: [],
}

function inventoryDisplayOrBlank(value: string | null | undefined) {
  return value?.trim() ? value.trim() : INVENTORY_BLANK_FILTER
}

function inventoryUniqueSortedValues(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))
}

function matchesInventoryColumnFilter(selected: string[], value: string) {
  if (!selected.length) return true
  return selected.includes(value)
}

function inventorySortValue(row: InventoryRecord, key: InventorySortKey): string {
  switch (key) {
    case 'jsInventoryId':
      return row.js_inventory_id ?? ''
    case 'customer':
      return row.customer ?? ''
    case 'customerValveId':
      return row.customer_id_no ?? ''
    case 'manufacturer':
      return row.manufacturer_name ?? ''
    case 'type':
      return row.valve_type_label ?? ''
    case 'size':
      return row.size ?? ''
    case 'pressure':
      return row.pressure ?? ''
    case 'location':
      return formatInventoryLocationLabel(row.origin)
  }
}

function sortInventoryRows(
  rows: InventoryRecord[],
  key: InventorySortKey,
  direction: 'asc' | 'desc',
): InventoryRecord[] {
  return [...rows].sort((a, b) => {
    const cmp = inventorySortValue(a, key).localeCompare(inventorySortValue(b, key), undefined, {
      sensitivity: 'base',
      numeric: true,
    })
    return direction === 'asc' ? cmp : -cmp
  })
}

export function AdminInventoryPage() {
  const { showToast } = useToast()
  const { user, username } = useAuth()
  const { employees } = useEmployees()
  const [searchParams, setSearchParams] = useSearchParams()
  const [rows, setRows] = useState<InventoryRecord[]>([])
  const [removedRows, setRemovedRows] = useState<InventoryRecord[]>([])
  const [events, setEvents] = useState<InventoryEvent[]>([])
  const [listScope, setListScope] = useState<ListScope>('active')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [customerRows, setCustomerRows] = useState<CustomerSalesRepRow[]>([])
  const [salesRepColumnMissing, setSalesRepColumnMissing] = useState(false)
  const [savingSalesRep, setSavingSalesRep] = useState(false)
  const [customers, setCustomers] = useState<string[]>([])
  const [manufacturers, setManufacturers] = useState<string[]>([])
  const [valveTypes, setValveTypes] = useState<string[]>([])
  const [bodyMaterials, setBodyMaterials] = useState<string[]>([])
  const [apiTrims, setApiTrims] = useState<string[]>([])
  const [sizes, setSizes] = useState<string[]>([])
  const [pressureClasses, setPressureClasses] = useState<string[]>([])
  const [partTypes, setPartTypes] = useState<string[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<InventoryFormState>(() => emptyInventoryForm())
  const [valvePhoto, setValvePhoto] = useState<InventoryPhotoDraft>(() => emptyPhotoDraft())
  const [tagPhoto, setTagPhoto] = useState<InventoryPhotoDraft>(() => emptyPhotoDraft())
  const [documentDraft, setDocumentDraft] = useState<InventoryDocumentDraft>(() => emptyDocumentDraft())
  const [saving, setSaving] = useState(false)
  const saveGenerationRef = useRef(0)
  const [qrItem, setQrItem] = useState<InventoryRecord | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const [sendingReport, setSendingReport] = useState(false)
  const [sendingMonthly, setSendingMonthly] = useState(false)
  const [removeReason, setRemoveReason] = useState('')
  const [removePoNumber, setRemovePoNumber] = useState('')
  const [removeDestinationValveId, setRemoveDestinationValveId] = useState('')
  const [removing, setRemoving] = useState(false)
  const [showRemoveForm, setShowRemoveForm] = useState(false)
  const [showRestoreForm, setShowRestoreForm] = useState(false)
  const [restoreReason, setRestoreReason] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [columnFilters, setColumnFilters] = useState<InventoryColumnFilters>(EMPTY_INVENTORY_COLUMN_FILTERS)
  const [sortKey, setSortKey] = useState<InventorySortKey>('jsInventoryId')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const reload = useCallback(async () => {
    setLoading(true)
    const [{ data, error }, options, customerResult, removedResult, eventsResult] = await Promise.all([
      loadInventoryRecords(),
      loadInventoryFormOptions(),
      loadCustomersWithSalesRep(),
      loadRemovedInventoryRecords(),
      loadInventoryEvents(),
    ])
    setLoading(false)
    if (error) {
      showToast(
        error.includes('inventory') || error.includes('relation')
          ? 'Customer inventory table missing — run the traveler / inventory migrations in Supabase'
          : `Could not load customer inventory: ${error}`,
      )
      setRows([])
    } else {
      setRows(data)
    }
    if (removedResult.error) {
      setRemovedRows([])
    } else {
      setRemovedRows(removedResult.data)
    }
    if (eventsResult.error) {
      showToast(`Could not load inventory activity: ${eventsResult.error}`)
      setEvents([])
    } else {
      setEvents(eventsResult.data)
    }
    setCustomers(options.customers)
    setManufacturers(options.manufacturers)
    setValveTypes(options.valveTypes)
    setBodyMaterials(options.bodyMaterials)
    setApiTrims(options.apiTrims)
    setSizes(options.sizes)
    setPressureClasses(options.pressureClasses)
    setPartTypes(options.partTypes)
    if (customerResult.error) {
      setCustomerRows([])
      setSalesRepColumnMissing(false)
    } else {
      setCustomerRows(customerResult.data)
      setSalesRepColumnMissing(customerResult.salesRepColumnMissing)
    }
  }, [showToast])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const fromQuery = searchParams.get('customer')?.trim()
    if (fromQuery) setCustomerFilter(fromQuery)
  }, [searchParams])

  useEffect(() => {
    const itemId = searchParams.get('item')?.trim()
    if (!itemId || loading) return

    const match =
      rows.find((row) => row.id === itemId) || removedRows.find((row) => row.id === itemId)
    if (match) {
      setQrItem(match)
      setShowRemoveForm(false)
      setShowRestoreForm(false)
      setRemoveReason('')
      setRemovePoNumber('')
      setRemoveDestinationValveId('')
      setRestoreReason('')
      return
    }

    let cancelled = false
    void (async () => {
      const { data, error } = await getInventoryRecordById(itemId)
      if (cancelled) return
      if (error) {
        showToast(`Could not load scanned inventory item: ${error}`)
        return
      }
      if (!data) {
        showToast('Inventory item not found')
        return
      }
      setQrItem(data)
      setShowRemoveForm(false)
      setShowRestoreForm(false)
      setRemoveReason('')
      setRemovePoNumber('')
      setRemoveDestinationValveId('')
      setRestoreReason('')
    })()

    return () => {
      cancelled = true
    }
  }, [searchParams, rows, removedRows, loading, showToast])

  useEffect(() => {
    setColumnFilters(EMPTY_INVENTORY_COLUMN_FILTERS)
  }, [listScope])

  const periodLabel = useMemo(() => currentInventoryReportPeriod(), [])

  const inventoryCustomers = useMemo(() => {
    const names = new Set<string>()
    for (const row of [...rows, ...removedRows]) {
      const name = row.customer?.trim()
      if (name) names.add(name)
    }
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [rows, removedRows])

  const customerIdOptions = useMemo(
    () => customerIdNosForCustomer([...rows, ...removedRows], form.customer),
    [rows, removedRows, form.customer],
  )

  const sourceRows = listScope === 'removed' ? removedRows : rows

  const searchFiltered = useMemo(() => {
    return sourceRows.filter((row) => {
      if (customerFilter.trim()) {
        const needle = customerFilter.trim().toLowerCase()
        if ((row.customer ?? '').trim().toLowerCase() !== needle) return false
      }
      return inventoryMatchesSearch(row, search)
    })
  }, [sourceRows, search, customerFilter])

  const filterOptions = useMemo(
    () => ({
      jsInventoryId: inventoryUniqueSortedValues(
        searchFiltered.map((row) => inventoryDisplayOrBlank(row.js_inventory_id)),
      ),
      customer: inventoryUniqueSortedValues(
        searchFiltered.map((row) => inventoryDisplayOrBlank(row.customer)),
      ),
      customerValveId: inventoryUniqueSortedValues(
        searchFiltered.map((row) => inventoryDisplayOrBlank(row.customer_id_no)),
      ),
      manufacturer: inventoryUniqueSortedValues(
        searchFiltered.map((row) => inventoryDisplayOrBlank(row.manufacturer_name)),
      ),
      type: inventoryUniqueSortedValues(
        searchFiltered.map((row) => inventoryDisplayOrBlank(row.valve_type_label)),
      ),
      size: inventoryUniqueSortedValues(searchFiltered.map((row) => inventoryDisplayOrBlank(row.size))),
      pressure: inventoryUniqueSortedValues(
        searchFiltered.map((row) => inventoryDisplayOrBlank(row.pressure)),
      ),
      location: inventoryUniqueSortedValues(
        searchFiltered.map((row) => inventoryDisplayOrBlank(formatInventoryLocationLabel(row.origin))),
      ),
    }),
    [searchFiltered],
  )

  const filtered = useMemo(() => {
    return searchFiltered.filter((row) => {
      if (
        !matchesInventoryColumnFilter(
          columnFilters.jsInventoryId,
          inventoryDisplayOrBlank(row.js_inventory_id),
        )
      ) {
        return false
      }
      if (
        !matchesInventoryColumnFilter(columnFilters.customer, inventoryDisplayOrBlank(row.customer))
      ) {
        return false
      }
      if (
        !matchesInventoryColumnFilter(
          columnFilters.customerValveId,
          inventoryDisplayOrBlank(row.customer_id_no),
        )
      ) {
        return false
      }
      if (
        !matchesInventoryColumnFilter(
          columnFilters.manufacturer,
          inventoryDisplayOrBlank(row.manufacturer_name),
        )
      ) {
        return false
      }
      if (
        !matchesInventoryColumnFilter(columnFilters.type, inventoryDisplayOrBlank(row.valve_type_label))
      ) {
        return false
      }
      if (!matchesInventoryColumnFilter(columnFilters.size, inventoryDisplayOrBlank(row.size))) {
        return false
      }
      if (
        !matchesInventoryColumnFilter(columnFilters.pressure, inventoryDisplayOrBlank(row.pressure))
      ) {
        return false
      }
      if (
        !matchesInventoryColumnFilter(
          columnFilters.location,
          inventoryDisplayOrBlank(formatInventoryLocationLabel(row.origin)),
        )
      ) {
        return false
      }
      return true
    })
  }, [searchFiltered, columnFilters])

  const sortedRows = useMemo(
    () => sortInventoryRows(filtered, sortKey, sortDirection),
    [filtered, sortKey, sortDirection],
  )

  const activeColumnFilterCount = useMemo(
    () => Object.values(columnFilters).reduce((count, selected) => count + (selected.length ? 1 : 0), 0),
    [columnFilters],
  )

  const setColumnFilter = (key: keyof InventoryColumnFilters, selected: string[]) => {
    setColumnFilters((prev) => ({ ...prev, [key]: selected }))
  }

  const toggleSort = (key: InventorySortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection('asc')
  }

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (customerFilter.trim()) {
        const needle = customerFilter.trim().toLowerCase()
        if ((event.customer ?? '').trim().toLowerCase() !== needle) return false
      }
      if (!search.trim()) return true
      const q = search.trim().toLowerCase()
      return [
        event.js_inventory_id,
        event.customer,
        event.customer_id_no,
        event.reason,
        event.po_number,
        inventoryEventLabel(event.event_type),
        event.created_by_name,
      ]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ')
        .includes(q)
    })
  }, [events, customerFilter, search])

  const customerGroups = useMemo(
    () => groupInventoryByCustomer(rows, customerRows),
    [rows, customerRows],
  )

  const selectedCustomerGroup = useMemo(() => {
    if (!customerFilter.trim()) return null
    return (
      customerGroups.find(
        (group) => group.customer.trim().toLowerCase() === customerFilter.trim().toLowerCase(),
      ) ?? null
    )
  }, [customerGroups, customerFilter])

  const selectedCustomerRow = useMemo(
    () => (customerFilter.trim() ? findCustomerByName(customerRows, customerFilter) : null),
    [customerRows, customerFilter],
  )

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const employee of employees) {
      map.set(employee.id, employee.full_name.trim() || employee.username)
    }
    return map
  }, [employees])

  const selectedSalesRepId =
    selectedCustomerRow?.sales_rep_employee_id ?? selectedCustomerGroup?.salesRepEmployeeId ?? ''

  const salesmanOptions = useMemo(
    () =>
      employees
        .filter(
          (employee) =>
            employee.is_active &&
            (employee.is_salesman || employee.id === selectedSalesRepId),
        )
        .slice()
        .sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })),
    [employees, selectedSalesRepId],
  )

  const selectedSalesmanName = selectedSalesRepId
    ? employeeNameById.get(selectedSalesRepId) ?? null
    : null

  const saveSelectedCustomerSalesman = async (salesRepEmployeeId: string) => {
    if (!selectedCustomerRow) {
      showToast('Add this customer under Admin → Lists → Customers first, then assign a salesman')
      return
    }
    if (salesRepColumnMissing) {
      showToast('Run migration-customers-sales-rep.sql in Supabase to enable salesman assignment')
      return
    }
    setSavingSalesRep(true)
    const { error } = await updateCustomerSalesRep(selectedCustomerRow.id, salesRepEmployeeId || null)
    setSavingSalesRep(false)
    if (error) {
      showToast(error)
      return
    }
    setCustomerRows((prev) =>
      prev.map((row) =>
        row.id === selectedCustomerRow.id
          ? { ...row, sales_rep_employee_id: salesRepEmployeeId || null }
          : row,
      ),
    )
    showToast(salesRepEmployeeId ? 'Salesman saved' : 'Salesman cleared')
  }

  const printableFiltered = useMemo(
    () => filtered.filter((row) => Boolean(row.qr_code_data_url?.trim())),
    [filtered],
  )

  const selectedPrintable = useMemo(
    () => printableFiltered.filter((row) => selectedIds.has(row.id)),
    [printableFiltered, selectedIds],
  )

  const allFilteredSelected =
    printableFiltered.length > 0 && printableFiltered.every((row) => selectedIds.has(row.id))

  const someFilteredSelected = printableFiltered.some((row) => selectedIds.has(row.id))

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleSelectAllFiltered = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const row of printableFiltered) {
        if (checked) next.add(row.id)
        else next.delete(row.id)
      }
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const patchForm = (partial: Partial<InventoryFormState>) => {
    setForm((prev) => ({ ...prev, ...partial }))
  }

  const revokePreview = (draft: InventoryPhotoDraft) => {
    if (draft.previewUrl && draft.previewUrl.startsWith('blob:')) URL.revokeObjectURL(draft.previewUrl)
  }

  const pickPhoto = async (kind: 'valve' | 'tag', file: File) => {
    const error = validateInventoryPhoto(file)
    if (error) {
      showToast(error)
      return
    }
    const readable = await assertInventoryFileReadable(file)
    if (readable) {
      showToast(readable)
      return
    }
    const previewUrl = URL.createObjectURL(file)
    if (kind === 'valve') {
      setValvePhoto((prev) => {
        revokePreview(prev)
        return { file, previewUrl, existingUrl: prev.existingUrl }
      })
    } else {
      setTagPhoto((prev) => {
        revokePreview(prev)
        return { file, previewUrl, existingUrl: prev.existingUrl }
      })
    }
  }

  const clearPhoto = (kind: 'valve' | 'tag') => {
    if (kind === 'valve') {
      setValvePhoto((prev) => {
        revokePreview(prev)
        return emptyPhotoDraft(null)
      })
    } else {
      setTagPhoto((prev) => {
        revokePreview(prev)
        return emptyPhotoDraft(null)
      })
    }
  }

  const pickDocument = async (file: File) => {
    const error = validateInventoryDocument(file)
    if (error) {
      showToast(error)
      return
    }
    const readable = await assertInventoryFileReadable(file)
    if (readable) {
      showToast(readable)
      return
    }
    setDocumentDraft((prev) => ({
      ...prev,
      file,
    }))
  }

  const clearDocument = () => {
    setDocumentDraft(emptyDocumentDraft())
  }

  const openCreate = async () => {
    setModalMode('create')
    setEditingId(null)
    setForm(emptyInventoryForm())
    setValvePhoto((prev) => {
      revokePreview(prev)
      return emptyPhotoDraft()
    })
    setTagPhoto((prev) => {
      revokePreview(prev)
      return emptyPhotoDraft()
    })
    setDocumentDraft(emptyDocumentDraft())
    setModalOpen(true)
    const allocated = await allocateNextJsInventoryId()
    if (allocated.error) {
      showToast(`Could not preview next ID — will assign on save (${allocated.error})`)
    }
    setForm((prev) => ({ ...prev, jsInventoryId: allocated.id }))
  }

  const openDuplicate = async (row: InventoryRecord) => {
    setModalMode('duplicate')
    setEditingId(null)
    const copied = inventoryToForm(row)
    setForm({ ...copied, jsInventoryId: '' })
    setValvePhoto((prev) => {
      revokePreview(prev)
      return emptyPhotoDraft(null)
    })
    setTagPhoto((prev) => {
      revokePreview(prev)
      return emptyPhotoDraft(null)
    })
    setDocumentDraft(emptyDocumentDraft())
    setModalOpen(true)
    const allocated = await allocateNextJsInventoryId()
    if (allocated.error) {
      showToast(`Could not preview next ID — will assign on save (${allocated.error})`)
    }
    setForm((prev) => ({ ...prev, jsInventoryId: allocated.id }))
  }

  const openEdit = (row: InventoryRecord) => {
    setModalMode('edit')
    setEditingId(row.id)
    setForm(inventoryToForm(row))
    setValvePhoto((prev) => {
      revokePreview(prev)
      return emptyPhotoDraft(row.valve_image_url)
    })
    setTagPhoto((prev) => {
      revokePreview(prev)
      return emptyPhotoDraft(row.tag_image_url)
    })
    setDocumentDraft(emptyDocumentDraft(row))
    setModalOpen(true)
  }

  const resetModalState = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyInventoryForm())
    setValvePhoto((prev) => {
      revokePreview(prev)
      return emptyPhotoDraft()
    })
    setTagPhoto((prev) => {
      revokePreview(prev)
      return emptyPhotoDraft()
    })
    setDocumentDraft(emptyDocumentDraft())
  }

  const closeModal = () => {
    // Allow force-close even while saving so a hung upload cannot trap the UI.
    if (saving) {
      saveGenerationRef.current += 1
      setSaving(false)
      showToast('Save cancelled — you can try again')
    }
    resetModalState()
  }

  const save = async () => {
    if (!form.customer.trim()) {
      showToast('Customer is required')
      return
    }
    if (modalMode === 'edit' && !form.jsInventoryId.trim()) {
      showToast('JS inventory ID is required')
      return
    }
    if (form.origin === 'other' && !form.originOther.trim()) {
      showToast('Enter the other location')
      return
    }
    if (!form.condition) {
      showToast('Select New or Reconditioned')
      return
    }
    if (form.condition === 'new' && !form.manufacturerSerialNo.trim()) {
      showToast('Enter the new manufacturer serial number')
      return
    }
    if (form.condition === 'reconditioned' && !form.repairTagNumber.trim()) {
      showToast('Enter the repair tag number')
      return
    }
    if ((modalMode === 'create' || modalMode === 'duplicate') && !form.changeReason.trim()) {
      showToast('Enter a reason for adding this item to inventory')
      return
    }

    const hasValve = Boolean(valvePhoto.file || valvePhoto.existingUrl)
    const hasTag = Boolean(tagPhoto.file || tagPhoto.existingUrl)
    if (!hasValve) {
      showToast(form.isValvePart ? 'A picture of the part is required' : 'A picture of the valve is required')
      return
    }
    if (!form.isValvePart && !hasTag) {
      showToast('A picture of the tag is required')
      return
    }

    const saveGen = ++saveGenerationRef.current
    setSaving(true)
    try {
      if (modalMode === 'create' || modalMode === 'duplicate') {
        if (!valvePhoto.file || (!form.isValvePart && !tagPhoto.file)) {
          showToast(
            modalMode === 'duplicate'
              ? form.isValvePart
                ? 'Add a new part photo for the duplicate — photos are not copied'
                : 'Add new valve and tag photos for the duplicate — photos are not copied'
              : form.isValvePart
                ? 'Upload a part photo'
                : 'Upload both the valve photo and the tag photo',
          )
          return
        }
        const result = await createInventoryRecord(
          form,
          { valve: valvePhoto.file, tag: tagPhoto.file },
          documentDraft,
          { userId: user?.id ?? null, name: username || null },
        )
        if (saveGen !== saveGenerationRef.current) return
        if (!result.data) {
          showToast(result.error || 'Could not create item')
          return
        }
        if (result.error) showToast(result.error)
        else {
          showToast(
            modalMode === 'duplicate'
              ? 'Duplicate inventory item created'
              : 'Customer inventory item added',
          )
        }
        resetModalState()
        setQrItem(result.data)
        await reload()
        return
      }

      if (!editingId) return
      const existing = rows.find((row) => row.id === editingId)
      if (!existing) {
        showToast('Could not find inventory item to update')
        return
      }
      const result = await updateInventoryRecord(
        editingId,
        form,
        {
          valve: valvePhoto,
          tag: tagPhoto,
          existing,
        },
        documentDraft,
      )
      if (saveGen !== saveGenerationRef.current) return
      if (!result.data) {
        showToast(result.error || 'Could not update item')
        return
      }
      if (result.error) showToast(result.error)
      else showToast('Customer inventory item updated')
      resetModalState()
      await reload()
    } catch (error) {
      if (saveGen !== saveGenerationRef.current) return
      showToast(error instanceof Error ? error.message : 'Could not save inventory item')
    } finally {
      if (saveGen === saveGenerationRef.current) setSaving(false)
    }
  }

  const openQrItem = (row: InventoryRecord) => {
    setQrItem(row)
    setShowRemoveForm(false)
    setShowRestoreForm(false)
    setRemoveReason('')
    setRemovePoNumber('')
    setRestoreReason('')
  }

  const remove = (row: InventoryRecord) => {
    openQrItem(row)
    setShowRemoveForm(true)
  }

  const confirmRemoveFromInventory = async () => {
    if (!qrItem) return
    if (isInventoryRemoved(qrItem)) {
      showToast('This item is already removed from inventory')
      return
    }
    const reason = removeReason.trim()
    const poNumber = removePoNumber.trim()
    const destinationValveId = removeDestinationValveId.trim()
    if (!reason) {
      showToast('Enter a reason for removing this item')
      return
    }
    if (!poNumber) {
      showToast('Enter the customer purchase order number')
      return
    }
    if (qrItem.is_valve_part && !destinationValveId) {
      showToast('Enter the valve ID this part is going into')
      return
    }

    setRemoving(true)
    const { data, error } = await removeInventoryRecord({
      id: qrItem.id,
      reason,
      poNumber,
      destinationValveId,
      isValvePart: Boolean(qrItem.is_valve_part),
      removedByUserId: user?.id ?? null,
      removedByName: username || null,
    })
    setRemoving(false)
    if (!data) {
      showToast(error || 'Could not remove inventory item')
      return
    }
    if (error) showToast(error)
    else showToast(`Removed ${data.js_inventory_id || 'inventory item'} from inventory`)
    setQrItem(data)
    setShowRemoveForm(false)
    setRemoveReason('')
    setRemovePoNumber('')
    setRemoveDestinationValveId('')
    if (expandedRowId === data.id) setExpandedRowId(null)
    setSelectedIds((prev) => {
      if (!prev.has(data.id)) return prev
      const next = new Set(prev)
      next.delete(data.id)
      return next
    })
    await reload()
  }

  const confirmRestoreToInventory = async () => {
    if (!qrItem) return
    if (!isInventoryRemoved(qrItem)) {
      showToast('This item is already in active inventory')
      return
    }
    const reason = restoreReason.trim()
    if (!reason) {
      showToast('Enter a reason for adding this item back')
      return
    }

    setRestoring(true)
    const { data, error } = await restoreInventoryRecord({
      id: qrItem.id,
      reason,
      restoredByUserId: user?.id ?? null,
      restoredByName: username || null,
    })
    setRestoring(false)
    if (!data) {
      showToast(error || 'Could not add item back to inventory')
      return
    }
    if (error) showToast(error)
    else showToast(`Added ${data.js_inventory_id || 'inventory item'} back to inventory`)
    setQrItem(data)
    setShowRestoreForm(false)
    setRestoreReason('')
    setListScope('active')
    await reload()
  }

  const downloadQr = () => {
    if (!qrItem?.qr_code_data_url) return
    const link = document.createElement('a')
    const name = (qrItem.js_inventory_id || qrItem.id).replace(/[^\w.-]+/g, '_')
    link.href = qrItem.qr_code_data_url
    link.download = `${name}-inventory-qr.png`
    link.click()
  }

  const printSelectedLabels = () => {
    const { error } = printInventoryLabelSheet(selectedPrintable)
    if (error) showToast(error)
  }

  const printQrLabel = () => {
    if (!qrItem) return
    const { error } = printInventoryLabelSheet([qrItem])
    if (error) showToast(error)
  }

  const editFromQr = () => {
    if (!qrItem || isInventoryRemoved(qrItem)) return
    const row = qrItem
    closeQr()
    openEdit(row)
  }

  const setCustomerFilterValue = (value: string) => {
    setCustomerFilter(value)
    const next = new URLSearchParams(searchParams)
    if (value.trim()) next.set('customer', value.trim())
    else next.delete('customer')
    setSearchParams(next, { replace: true })
  }

  const sendReportForGroup = async (group: {
    customer: string
    items: InventoryRecord[]
    salesRepEmployeeId: string | null
  }) => {
    if (!user?.id) {
      showToast('Sign in with an employee account to send Messages')
      return { ok: false as const, error: 'Not signed in' }
    }
    if (!group.items.length) {
      return { ok: false as const, error: `No inventory items for ${group.customer}` }
    }
    if (!group.salesRepEmployeeId) {
      return {
        ok: false as const,
        error: `Assign a salesman to ${group.customer} in Admin → Lists (Customers)`,
      }
    }

    const resolved = await resolveEmployeeAuthUserId(group.salesRepEmployeeId)
    if (resolved.error) return { ok: false as const, error: resolved.error }
    if (!resolved.authUserId) {
      return {
        ok: false as const,
        error: `${resolved.fullName || 'Salesman'} needs a linked login to receive Messages`,
      }
    }

    const { subject, body } = formatInventoryCustomerReportMessage({
      customer: group.customer,
      items: group.items,
      periodLabel,
      salesmanName: resolved.fullName,
      stats: buildInventoryCustomerReportStats({
        items: group.items,
        events,
        customer: group.customer,
        periodLabel,
      }),
    })

    const result = await notifySalesRepCustomerInventoryReport({
      customerName: group.customer,
      periodLabel,
      itemCount: group.items.length,
      reportBody: body,
      subject,
      recipientUserId: resolved.authUserId,
      senderUserId: user.id,
      senderName: username || 'Customer Inventory',
      inventoryIds: group.items.map((item) => item.id),
    })

    if (result.error) return { ok: false as const, error: result.error }
    if (result.notified < 1) return { ok: false as const, error: 'Could not send inventory report' }
    return { ok: true as const, salesmanName: resolved.fullName || 'salesman' }
  }

  const sendSelectedCustomerReport = async () => {
    if (!selectedCustomerGroup) {
      showToast('Choose a customer to generate the report')
      return
    }
    setSendingReport(true)
    const result = await sendReportForGroup(selectedCustomerGroup)
    setSendingReport(false)
    if (!result.ok) {
      showToast(result.error)
      return
    }
    showToast(`Monthly inventory report sent to ${result.salesmanName} in Messages`)
  }

  const printSelectedCustomerReport = async () => {
    if (!selectedCustomerGroup) {
      showToast('Choose a customer to print the report')
      return
    }
    const { error } = await printInventoryCustomerReport({
      customer: selectedCustomerGroup.customer,
      items: selectedCustomerGroup.items,
      periodLabel,
      salesmanName: selectedSalesmanName,
      events,
    })
    if (error) showToast(error)
  }

  const sendAllMonthlyReports = async () => {
    if (!user?.id) {
      showToast('Sign in with an employee account to send Messages')
      return
    }
    const groups = customerGroups.filter((group) => group.items.length > 0)
    if (!groups.length) {
      showToast('No customer inventory items to report')
      return
    }

    setSendingMonthly(true)
    let sent = 0
    const skipped: string[] = []
    for (const group of groups) {
      const result = await sendReportForGroup(group)
      if (result.ok) sent += 1
      else skipped.push(`${group.customer}: ${result.error}`)
    }
    setSendingMonthly(false)

    if (sent > 0) {
      clearInventoryMonthlyReportAlert()
      showToast(
        `Sent ${sent} monthly inventory report${sent === 1 ? '' : 's'} to salesman Messages` +
          (skipped.length ? ` (${skipped.length} skipped)` : ''),
      )
    } else {
      showToast(skipped[0] || 'No monthly inventory reports were sent')
    }
  }

  const closeQr = () => {
    setQrItem(null)
    setShowRemoveForm(false)
    setShowRestoreForm(false)
    setRemoveReason('')
    setRemovePoNumber('')
    setRemoveDestinationValveId('')
    setRestoreReason('')
    if (searchParams.get('item')) {
      const next = new URLSearchParams(searchParams)
      next.delete('item')
      setSearchParams(next, { replace: true })
    }
  }

  return (
    <section className="dashboard-page inventory-page">
      <div className="dashboard-title-row admin-page-heading">
        <div>
          <h2 className="dashboard-title">Customer Inventory</h2>
          <p className="placeholder-copy">
            Track valves held for customers outside the active job board. Each item needs a valve photo, a tag photo,
            and gets a QR code when created.
          </p>
        </div>
        <div className="admin-employees-title-actions">
          <button type="button" className="button-secondary" onClick={() => void reload()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => void sendAllMonthlyReports()}
            disabled={loading || sendingMonthly || rows.length === 0}
          >
            {sendingMonthly ? 'Sending monthly reports…' : 'Send monthly reports'}
          </button>
          <button type="button" className="button-primary" onClick={() => void openCreate()}>
            Add customer inventory item
          </button>
          <Link to="/dashboard" className="button-secondary">
            Back to dashboard
          </Link>
        </div>
      </div>

      <section className="dashboard-panel inventory-report-panel">
        <div className="inventory-report-panel-head">
          <div>
            <h3>Inventory by customer</h3>
            <p className="placeholder-copy">
              Pull one customer&apos;s inventory, print a monthly report, or send it to the assigned salesman in
              Messages. Assign the salesman below (mark salesmen on Admin → Employees first).
            </p>
          </div>
          <p className="inventory-report-period">Period: {periodLabel}</p>
        </div>
        <div className="inventory-toolbar inventory-report-toolbar">
          <label className="inventory-toolbar-field inventory-toolbar-customer">
            <span>Customer</span>
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilterValue(e.target.value)}
              aria-label="Filter inventory by customer"
            >
              <option value="">All customers</option>
              {inventoryCustomers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="inventory-toolbar-field inventory-toolbar-salesman">
            <span>Salesman</span>
            <select
              value={selectedSalesRepId}
              onChange={(e) => void saveSelectedCustomerSalesman(e.target.value)}
              aria-label="Assign salesman for selected customer"
              disabled={
                !customerFilter.trim() ||
                !selectedCustomerRow ||
                salesRepColumnMissing ||
                savingSalesRep
              }
            >
              <option value="">
                {!customerFilter.trim()
                  ? 'Select a customer first'
                  : !selectedCustomerRow
                    ? 'Customer not in Lists yet'
                    : salesRepColumnMissing
                      ? 'Salesman column missing'
                      : salesmanOptions.length === 0 && !selectedSalesRepId
                        ? 'Mark salesmen on Employees'
                        : 'No salesman assigned'}
              </option>
              {salesmanOptions.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name.trim() || employee.username}
                  {!employee.is_salesman ? ' (not marked salesman)' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="inventory-toolbar-meta">
            <span className="inventory-toolbar-count">
              {selectedCustomerGroup ? (
                <>
                  {selectedCustomerGroup.items.length} item
                  {selectedCustomerGroup.items.length === 1 ? '' : 's'} for {selectedCustomerGroup.customer}
                  {selectedSalesmanName
                    ? ` · Salesman: ${selectedSalesmanName}`
                    : ' · No salesman assigned'}
                </>
              ) : (
                'Choose a customer to preview or send their monthly report'
              )}
            </span>
            <div className="inventory-selection-actions">
              <button
                type="button"
                className="button-secondary"
                onClick={printSelectedCustomerReport}
                disabled={!selectedCustomerGroup}
              >
                Print customer report
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={() => void sendSelectedCustomerReport()}
                disabled={!selectedCustomerGroup || sendingReport}
              >
                {sendingReport ? 'Sending…' : 'Send report to salesman'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-panel">
        <div className="inventory-scope-tabs" role="tablist" aria-label="Inventory views">
          <button
            type="button"
            role="tab"
            aria-selected={listScope === 'active'}
            className={`inventory-scope-tab${listScope === 'active' ? ' is-active' : ''}`}
            onClick={() => setListScope('active')}
          >
            Active ({rows.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={listScope === 'removed'}
            className={`inventory-scope-tab${listScope === 'removed' ? ' is-active' : ''}`}
            onClick={() => setListScope('removed')}
          >
            Removed ({removedRows.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={listScope === 'activity'}
            className={`inventory-scope-tab${listScope === 'activity' ? ' is-active' : ''}`}
            onClick={() => setListScope('activity')}
          >
            Activity ({events.length})
          </button>
        </div>
        <div className="inventory-toolbar">
          <label className="inventory-toolbar-field inventory-toolbar-search">
            <span>Search</span>
            <input
              type="search"
              value={search}
              placeholder={
                listScope === 'activity'
                  ? 'JS ID, customer, reason, PO…'
                  : 'JS ID, customer, manufacturer, type…'
              }
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="inventory-toolbar-field inventory-toolbar-customer">
            <span>Customer</span>
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilterValue(e.target.value)}
              aria-label="Filter list by customer"
            >
              <option value="">All customers</option>
              {inventoryCustomers.map((name) => (
                <option key={`list-${name}`} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <div className="inventory-toolbar-meta">
            <button
              type="button"
              className="button-primary inventory-toolbar-add"
              onClick={() => void openCreate()}
            >
              Add customer inventory item
            </button>
            <div className="inventory-toolbar-meta-end">
              <span className="inventory-toolbar-count">
                {listScope === 'activity'
                  ? `${filteredEvents.length} event${filteredEvents.length === 1 ? '' : 's'}`
                  : `${sortedRows.length} item${sortedRows.length === 1 ? '' : 's'}`}
                {customerFilter.trim() || search.trim() || activeColumnFilterCount > 0 ? ' matching' : ''}
                {listScope === 'active' && selectedPrintable.length > 0
                  ? ` · ${selectedPrintable.length} selected for print`
                  : ''}
              </span>
              {listScope === 'active' && selectedPrintable.length > 0 ? (
                <div className="inventory-selection-actions">
                  <button type="button" className="button-secondary" onClick={clearSelection}>
                    Clear selection
                  </button>
                  <button type="button" className="button-primary" onClick={printSelectedLabels}>
                    Print labels
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {listScope === 'activity' ? (
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Change</th>
                  <th>JS inventory ID</th>
                  <th>Customer</th>
                  <th>Customer ID #</th>
                  <th>PO #</th>
                  <th>Reason</th>
                  <th>By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9}>Loading…</td>
                  </tr>
                ) : filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      {events.length === 0
                        ? 'No inventory activity yet — adds and removals will appear here.'
                        : 'No activity matches this search.'}
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((event) => (
                    <tr key={event.id}>
                      <td>{new Date(event.created_at).toLocaleString()}</td>
                      <td>
                        <span
                          className={`inventory-event-badge inventory-event-badge--${event.event_type}`}
                        >
                          {inventoryEventLabel(event.event_type)}
                        </span>
                      </td>
                      <td>{event.js_inventory_id || '—'}</td>
                      <td>{event.customer || '—'}</td>
                      <td>{event.customer_id_no || '—'}</td>
                      <td>{event.po_number || '—'}</td>
                      <td>{event.reason}</td>
                      <td>{event.created_by_name || '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="button-secondary report-table-open-link"
                          onClick={() => {
                            const match =
                              rows.find((row) => row.id === event.inventory_id) ||
                              removedRows.find((row) => row.id === event.inventory_id)
                            if (match) {
                              openQrItem(match)
                              return
                            }
                            void (async () => {
                              const { data, error } = await getInventoryRecordById(event.inventory_id)
                              if (error || !data) {
                                showToast(error || 'Inventory item not found')
                                return
                              }
                              openQrItem(data)
                            })()
                          }}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : modalOpen ? (
          <p className="placeholder-copy inventory-editing-placeholder">
            Editing inventory item… list is paused so the form stays responsive.
          </p>
        ) : (
        <>
        {activeColumnFilterCount > 0 ? (
          <div className="received-valves-filter-bar">
            <span>
              {activeColumnFilterCount} column filter{activeColumnFilterCount === 1 ? '' : 's'} active
            </span>
            <button
              type="button"
              className="button-secondary"
              onClick={() => setColumnFilters(EMPTY_INVENTORY_COLUMN_FILTERS)}
            >
              Clear filters
            </button>
          </div>
        ) : null}
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th className="inventory-select-col">
                  <input
                    type="checkbox"
                    aria-label="Select all QR codes in this list"
                    checked={allFilteredSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected
                    }}
                    disabled={printableFiltered.length === 0}
                    onChange={(e) => toggleSelectAllFiltered(e.target.checked)}
                  />
                </th>
                <th>Photos</th>
                <th>
                  <TestLogColumnHeader
                    label="JS inventory ID"
                    sortActive={sortKey === 'jsInventoryId'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('jsInventoryId')}
                    filterOptions={filterOptions.jsInventoryId}
                    selectedFilters={columnFilters.jsInventoryId}
                    onFilterChange={(selected) => setColumnFilter('jsInventoryId', selected)}
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
                    label="Customer valve ID"
                    sortActive={sortKey === 'customerValveId'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('customerValveId')}
                    filterOptions={filterOptions.customerValveId}
                    selectedFilters={columnFilters.customerValveId}
                    onFilterChange={(selected) => setColumnFilter('customerValveId', selected)}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Manufacturer"
                    sortActive={sortKey === 'manufacturer'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('manufacturer')}
                    filterOptions={filterOptions.manufacturer}
                    selectedFilters={columnFilters.manufacturer}
                    onFilterChange={(selected) => setColumnFilter('manufacturer', selected)}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Type"
                    sortActive={sortKey === 'type'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('type')}
                    filterOptions={filterOptions.type}
                    selectedFilters={columnFilters.type}
                    onFilterChange={(selected) => setColumnFilter('type', selected)}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Size"
                    sortActive={sortKey === 'size'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('size')}
                    filterOptions={filterOptions.size}
                    selectedFilters={columnFilters.size}
                    onFilterChange={(selected) => setColumnFilter('size', selected)}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Pressure"
                    sortActive={sortKey === 'pressure'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('pressure')}
                    filterOptions={filterOptions.pressure}
                    selectedFilters={columnFilters.pressure}
                    onFilterChange={(selected) => setColumnFilter('pressure', selected)}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Location"
                    sortActive={sortKey === 'location'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('location')}
                    filterOptions={filterOptions.location}
                    selectedFilters={columnFilters.location}
                    onFilterChange={(selected) => setColumnFilter('location', selected)}
                  />
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="table-empty-cell">
                    Loading customer inventory…
                  </td>
                </tr>
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="table-empty-cell">
                    {sourceRows.length === 0
                      ? listScope === 'removed'
                        ? 'No removed inventory items.'
                        : 'No customer inventory items yet — add the first one.'
                      : 'No customer inventory items match this search.'}
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => {
                  const isExpanded = expandedRowId === row.id
                  const display = (value: string | null | undefined) => {
                    const trimmed = value?.trim()
                    return trimmed ? trimmed : '—'
                  }
                  return (
                    <Fragment key={row.id}>
                      <tr
                        className={[
                          'inventory-row',
                          isExpanded ? 'inventory-row-expanded' : '',
                          selectedIds.has(row.id) ? 'inventory-row-selected' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => setExpandedRowId((prev) => (prev === row.id ? null : row.id))}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setExpandedRowId((prev) => (prev === row.id ? null : row.id))
                          }
                        }}
                      >
                        <td
                          className="inventory-select-col"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.js_inventory_id || 'inventory item'} for QR print`}
                            checked={selectedIds.has(row.id)}
                            disabled={!row.qr_code_data_url}
                            onChange={(e) => toggleSelected(row.id, e.target.checked)}
                          />
                        </td>
                        <td>
                          <div className="inventory-table-thumbs">
                            {row.valve_image_url ? (
                              <img src={row.valve_image_url} alt="Valve" />
                            ) : (
                              <span className="inventory-thumb-empty">Valve</span>
                            )}
                            {row.tag_image_url ? (
                              <img src={row.tag_image_url} alt="Tag" />
                            ) : (
                              <span className="inventory-thumb-empty">Tag</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="inventory-id-cell">
                            <span className="inventory-row-id-line">
                              <span className="inventory-row-toggle" aria-hidden>
                                {isExpanded ? '▼' : '▶'}
                              </span>
                              <span>{row.js_inventory_id || '—'}</span>
                            </span>
                            {row.is_valve_part ? <span className="inventory-part-badge">Part</span> : null}
                            {row.hf_acid ? <span className="inventory-hf-badge">HF Acid</span> : null}
                          </div>
                        </td>
                        <td>{display(row.customer)}</td>
                        <td>{display(row.customer_id_no)}</td>
                        <td>{display(row.manufacturer_name)}</td>
                        <td>{display(row.valve_type_label)}</td>
                        <td>{display(row.size)}</td>
                        <td>{display(row.pressure)}</td>
                        <td>{display(formatInventoryLocationLabel(row.origin))}</td>
                        <td
                          className="list-col-actions-cell"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {listScope === 'removed' ? (
                            <>
                              <button
                                type="button"
                                className="job-list-quick-action"
                                onClick={() => {
                                  openQrItem(row)
                                  setShowRestoreForm(true)
                                }}
                              >
                                Add back
                              </button>{' '}
                              <button
                                type="button"
                                className="job-list-quick-action"
                                onClick={() => openQrItem(row)}
                              >
                                Open
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="job-list-quick-action" onClick={() => openEdit(row)}>
                                Edit
                              </button>{' '}
                              <button
                                type="button"
                                className="job-list-quick-action"
                                onClick={() => void openDuplicate(row)}
                              >
                                Duplicate
                              </button>{' '}
                              <button
                                type="button"
                                className="job-list-quick-action"
                                onClick={() => openQrItem(row)}
                                disabled={!row.qr_code_data_url}
                              >
                                QR
                              </button>{' '}
                              <button type="button" className="job-list-quick-action" onClick={() => remove(row)}>
                                Remove
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="inventory-detail-row">
                          <td colSpan={11}>
                            <div className="inventory-detail-panel">
                              <div className="inventory-detail-photos">
                                <div className="inventory-detail-photo">
                                  <span>Valve</span>
                                  {row.valve_image_url ? (
                                    <img src={row.valve_image_url} alt="Valve" />
                                  ) : (
                                    <div className="inventory-detail-photo-empty">No valve photo</div>
                                  )}
                                </div>
                                <div className="inventory-detail-photo">
                                  <span>Tag</span>
                                  {row.tag_image_url ? (
                                    <img src={row.tag_image_url} alt="Tag" />
                                  ) : (
                                    <div className="inventory-detail-photo-empty">No tag photo</div>
                                  )}
                                </div>
                                {row.qr_code_data_url ? (
                                  <div className="inventory-detail-photo inventory-detail-qr">
                                    <span>QR</span>
                                    <img src={row.qr_code_data_url} alt="QR code" />
                                  </div>
                                ) : null}
                              </div>
                              <div className="inventory-detail-grid">
                                <div className="inventory-detail-item">
                                  <span className="inventory-detail-label">JS inventory ID</span>
                                  <span className="inventory-detail-value">{display(row.js_inventory_id)}</span>
                                </div>
                                <div className="inventory-detail-item">
                                  <span className="inventory-detail-label">Customer</span>
                                  <span className="inventory-detail-value">{display(row.customer)}</span>
                                </div>
                                <div className="inventory-detail-item">
                                  <span className="inventory-detail-label">Customer ID #</span>
                                  <span className="inventory-detail-value">{display(row.customer_id_no)}</span>
                                </div>
                                <div className="inventory-detail-item">
                                  <span className="inventory-detail-label">Location</span>
                                  <span className="inventory-detail-value">
                                    {display(formatInventoryLocationLabel(row.origin))}
                                  </span>
                                </div>
                                <div className="inventory-detail-item">
                                  <span className="inventory-detail-label">Condition</span>
                                  <span className="inventory-detail-value">
                                    {display(inventoryConditionLabel(row.condition))}
                                  </span>
                                </div>
                                <div className="inventory-detail-item">
                                  <span className="inventory-detail-label">
                                    {row.condition === 'reconditioned'
                                      ? 'Repair tag number'
                                      : 'Manufacturer serial number'}
                                  </span>
                                  <span className="inventory-detail-value">
                                    {display(
                                      row.condition === 'reconditioned'
                                        ? row.repair_tag_number
                                        : row.manufacturer_serial_no,
                                    )}
                                  </span>
                                </div>
                                <div className="inventory-detail-item">
                                  <span className="inventory-detail-label">MTR / traveler PDF</span>
                                  <span className="inventory-detail-value">
                                    {row.document_url ? (
                                      <a href={row.document_url} target="_blank" rel="noreferrer">
                                        {row.document_name || 'Open PDF'}
                                      </a>
                                    ) : (
                                      '—'
                                    )}
                                  </span>
                                </div>
                                <div className="inventory-detail-item">
                                  <span className="inventory-detail-label">Traveler / MTR link</span>
                                  <span className="inventory-detail-value">
                                    {row.traveler_link ? (
                                      <a href={row.traveler_link} target="_blank" rel="noreferrer">
                                        Open link
                                      </a>
                                    ) : (
                                      '—'
                                    )}
                                  </span>
                                </div>
                                <div className="inventory-detail-item">
                                  <span className="inventory-detail-label">Manufacturer</span>
                                  <span className="inventory-detail-value">{display(row.manufacturer_name)}</span>
                                </div>
                                <div className="inventory-detail-item">
                                  <span className="inventory-detail-label">
                                    {row.is_valve_part ? 'Part type' : 'Type'}
                                  </span>
                                  <span className="inventory-detail-value">
                                    {display(row.is_valve_part ? row.part_type : row.valve_type_label)}
                                  </span>
                                </div>
                                <div className="inventory-detail-item">
                                  <span className="inventory-detail-label">Size</span>
                                  <span className="inventory-detail-value">{display(row.size)}</span>
                                </div>
                                {!row.is_valve_part ? (
                                  <div className="inventory-detail-item">
                                    <span className="inventory-detail-label">Pressure</span>
                                    <span className="inventory-detail-value">{display(row.pressure)}</span>
                                  </div>
                                ) : null}
                                <div className="inventory-detail-item">
                                  <span className="inventory-detail-label">
                                    {row.is_valve_part ? 'Material' : 'Body material'}
                                  </span>
                                  <span className="inventory-detail-value">{display(row.body_material)}</span>
                                </div>
                                {!row.is_valve_part ? (
                                  <>
                                    <div className="inventory-detail-item">
                                      <span className="inventory-detail-label">API trim</span>
                                      <span className="inventory-detail-value">{display(row.api_trim)}</span>
                                    </div>
                                    <div className="inventory-detail-item">
                                      <span className="inventory-detail-label">Operator</span>
                                      <span className="inventory-detail-value">{display(row.operator)}</span>
                                    </div>
                                  </>
                                ) : null}
                                <div className="inventory-detail-item">
                                  <span className="inventory-detail-label">Item type</span>
                                  <span className="inventory-detail-value">
                                    {row.is_valve_part ? 'Valve part' : 'Valve'}
                                  </span>
                                </div>
                                <div className="inventory-detail-item">
                                  <span className="inventory-detail-label">HF Acid</span>
                                  <span className="inventory-detail-value">{row.hf_acid ? 'Yes' : 'No'}</span>
                                </div>
                                <div className="inventory-detail-item inventory-detail-item-wide">
                                  <span className="inventory-detail-label">Notes</span>
                                  <span className="inventory-detail-value">{display(row.notes)}</span>
                                </div>
                              </div>
                              <div className="inventory-detail-actions">
                                <button type="button" className="button-secondary" onClick={() => openEdit(row)}>
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="button-secondary"
                                  onClick={() => void openDuplicate(row)}
                                >
                                  Duplicate
                                </button>
                                <button
                                  type="button"
                                  className="button-primary"
                                  onClick={() => openQrItem(row)}
                                  disabled={!row.qr_code_data_url}
                                >
                                  Open QR
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        </>
        )}
      </section>

      {modalOpen ? (
        <div
          className="modal-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div
            className="modal-card modal-card-wide inventory-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="technician-modal-head">
              <div>
                <p className="inventory-modal-kicker">Customer Inventory</p>
                <h3 id="inventory-modal-title">
                  {modalMode === 'edit'
                    ? 'Edit inventory item'
                    : modalMode === 'duplicate'
                      ? 'Duplicate inventory item'
                      : 'Add inventory item'}
                </h3>
              </div>
              <button type="button" className="modal-close-btn" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </div>

            <div className="technician-modal-body inventory-modal-body">
              <section className="inventory-form-section">
                <div className="inventory-form-section-head">
                  <h4>Identity</h4>
                  <p>Who owns it and how we track it on the shelf.</p>
                </div>
                <div className="inventory-form-grid">
                  <Field label="JS inventory ID" required>
                    <input
                      type="text"
                      value={form.jsInventoryId}
                      readOnly
                      aria-readonly
                      className="inventory-id-readonly"
                      title="Assigned automatically — duplicates are blocked"
                    />
                    <span className="inventory-field-hint">
                      {modalMode === 'edit'
                        ? 'Locked after create — unique in customer inventory.'
                        : modalMode === 'duplicate'
                          ? 'New unique ID for the duplicate (photos are not copied).'
                          : 'Assigned automatically (unique). Confirmed again when you save.'}
                    </span>
                  </Field>
                  <Field label="Customer" required>
                    <FreeTextCombobox
                      options={customers}
                      value={form.customer}
                      onChange={(customer) => patchForm({ customer })}
                      placeholder="Select or type a customer"
                      showAllUntilTyped
                      maxSuggestions={500}
                      clearAriaLabel="Clear customer"
                      emptyHint="No customers found — type a new name"
                    />
                  </Field>
                  <Field label="Customer ID #">
                    <FreeTextCombobox
                      options={customerIdOptions}
                      value={form.customerIdNo}
                      onChange={(customerIdNo) => patchForm({ customerIdNo })}
                      disabled={!form.customer.trim()}
                      placeholder={
                        form.customer.trim()
                          ? customerIdOptions.length
                            ? 'Select or type a new ID'
                            : 'Type a new customer ID #'
                          : 'Select a customer first'
                      }
                      emptyHint={
                        form.customer.trim()
                          ? 'No saved IDs for this customer yet — type a new one'
                          : 'Select a customer to see their IDs'
                      }
                    />
                  </Field>
                  <Field label="Origin / location">
                    <ModalSelect
                      aria-label="Origin / location"
                      value={form.origin}
                      onChange={(origin) =>
                        patchForm({
                          origin,
                          originOther: origin === 'other' ? form.originOther : '',
                        })
                      }
                      options={INVENTORY_ORIGINS.map((option) => ({
                        value: option,
                        label: option === 'other' ? 'Other' : option,
                      }))}
                    />
                  </Field>
                  {form.origin === 'other' ? (
                    <Field label="Other location" required>
                      <input
                        type="text"
                        value={form.originOther}
                        onChange={(e) => patchForm({ originOther: e.target.value })}
                        placeholder="Describe location"
                      />
                    </Field>
                  ) : null}
                  <Field label="New or reconditioned" required>
                    <ModalSelect
                      aria-label="New or reconditioned"
                      value={form.condition}
                      onChange={(condition) =>
                        patchForm({
                          condition: condition as InventoryCondition | '',
                          manufacturerSerialNo:
                            condition === 'new' ? form.manufacturerSerialNo : '',
                          repairTagNumber:
                            condition === 'reconditioned' ? form.repairTagNumber : '',
                        })
                      }
                      options={INVENTORY_CONDITIONS.map((option) => ({
                        value: option.value,
                        label: option.label,
                      }))}
                    />
                  </Field>
                  {form.condition === 'new' ? (
                    <Field label="Manufacturer serial number" required>
                      <input
                        type="text"
                        value={form.manufacturerSerialNo}
                        onChange={(e) => patchForm({ manufacturerSerialNo: e.target.value })}
                        placeholder="New valve serial number"
                      />
                    </Field>
                  ) : null}
                  {form.condition === 'reconditioned' ? (
                    <Field label="Repair tag number" required>
                      <input
                        type="text"
                        value={form.repairTagNumber}
                        onChange={(e) => patchForm({ repairTagNumber: e.target.value })}
                        placeholder="Repair / traveler tag number"
                      />
                    </Field>
                  ) : null}
                  <label className="inventory-checkbox-field inventory-field-wide">
                    <input
                      type="checkbox"
                      checked={form.isValvePart}
                      onChange={(e) => patchForm({ isValvePart: e.target.checked })}
                    />
                    <span>
                      Valve part
                      <span className="inventory-field-hint" style={{ display: 'block', marginTop: '0.15rem' }}>
                        Leave unchecked for a complete valve (default).
                      </span>
                    </span>
                  </label>
                  {modalMode === 'create' || modalMode === 'duplicate' ? (
                    <Field label="Reason for adding" required className="inventory-field-wide">
                      <textarea
                        rows={2}
                        value={form.changeReason}
                        onChange={(e) => patchForm({ changeReason: e.target.value })}
                        placeholder={
                          form.isValvePart
                            ? 'Why is this valve part being added to customer inventory?'
                            : 'Why is this valve being added to customer inventory?'
                        }
                      />
                    </Field>
                  ) : null}
                </div>
              </section>

              <section className="inventory-form-section">
                <div className="inventory-form-section-head">
                  <h4>{form.isValvePart ? 'Photos' : 'Required photos'}</h4>
                  <p>
                    {modalMode === 'duplicate'
                      ? form.isValvePart
                        ? 'Photos are not copied — add a new part picture for this item. Tag photo is optional.'
                        : 'Photos are not copied — add new valve and tag pictures for this item.'
                      : form.isValvePart
                        ? 'A part photo is required. Tag photo is optional.'
                        : 'Both photos are required before the item can be saved.'}
                  </p>
                </div>
                <div className="inventory-photo-grid">
                  <PhotoCard
                    title={form.isValvePart ? 'Part photo' : 'Valve photo'}
                    hint={
                      form.isValvePart
                        ? 'Clear shot of the part'
                        : 'Clear shot of the valve body'
                    }
                    draft={valvePhoto}
                    required
                    inputId="inventory-valve-photo"
                    onPick={(file) => pickPhoto('valve', file)}
                    onClear={() => clearPhoto('valve')}
                  />
                  <PhotoCard
                    title="Tag photo"
                    hint={
                      form.isValvePart
                        ? 'Optional — nameplate / tag if available'
                        : 'Nameplate / tag so ID is readable'
                    }
                    draft={tagPhoto}
                    required={!form.isValvePart}
                    inputId="inventory-tag-photo"
                    onPick={(file) => pickPhoto('tag', file)}
                    onClear={() => clearPhoto('tag')}
                  />
                </div>
                {modalMode === 'create' || modalMode === 'duplicate' ? (
                  <p className="inventory-qr-note">A QR code is generated automatically when you create this item.</p>
                ) : null}
              </section>

              <section className="inventory-form-section">
                <div className="inventory-form-section-head">
                  <h4>{form.isValvePart ? 'MTR document' : 'MTR / traveler document'}</h4>
                  <p>
                    {modalMode === 'duplicate'
                      ? form.isValvePart
                        ? 'PDF is not copied — add an MTR PDF for this duplicate if needed.'
                        : 'PDF is not copied — add a PDF and/or traveler link for this duplicate if needed.'
                      : form.isValvePart
                        ? 'Optional MTR PDF upload for this part.'
                        : 'Optional PDF upload and/or link to the traveler or MTR.'}
                  </p>
                </div>
                <DocumentCard draft={documentDraft} onPick={pickDocument} onClear={clearDocument} />
                {!form.isValvePart ? (
                  <Field label="Traveler / MTR link" className="inventory-field-wide">
                    <input
                      type="url"
                      inputMode="url"
                      value={form.travelerLink}
                      onChange={(e) => patchForm({ travelerLink: e.target.value })}
                      placeholder="https://… (SharePoint, OneDrive, etc.)"
                    />
                    {normalizeTravelerLink(form.travelerLink) ? (
                      <a
                        className="inventory-traveler-link-open"
                        href={normalizeTravelerLink(form.travelerLink) ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open link
                      </a>
                    ) : null}
                  </Field>
                ) : null}
              </section>

              {form.isValvePart ? (
                <section className="inventory-form-section">
                  <div className="inventory-form-section-head">
                    <h4>Part details</h4>
                    <p>Manufacturer, type, size, and material for this part.</p>
                  </div>
                  <div className="inventory-form-grid">
                    <Field label="Manufacturer">
                      <FreeTextCombobox
                        options={manufacturers}
                        value={form.manufacturerName}
                        onChange={(manufacturerName) => patchForm({ manufacturerName })}
                        placeholder="Select or type a manufacturer"
                        showAllUntilTyped
                        maxSuggestions={500}
                        clearAriaLabel="Clear manufacturer"
                        emptyHint="No manufacturers found — type a new name"
                      />
                    </Field>
                    <Field label="Part type">
                      <FreeTextCombobox
                        options={partTypes}
                        value={form.partType}
                        onChange={(partType) => patchForm({ partType })}
                        placeholder="Select or type a part type"
                        showAllUntilTyped
                        maxSuggestions={500}
                        clearAriaLabel="Clear part type"
                        emptyHint="No part types found — type a new type (saved to the list)"
                      />
                    </Field>
                    <Field label="Size">
                      <FreeTextCombobox
                        options={sizes}
                        value={form.size}
                        onChange={(size) => patchForm({ size })}
                        placeholder="Select or type a size"
                        showAllUntilTyped
                        maxSuggestions={500}
                        clearAriaLabel="Clear size"
                        emptyHint="No sizes found — type a new size"
                      />
                    </Field>
                    <Field label="Material">
                      <FreeTextCombobox
                        options={bodyMaterials}
                        value={form.bodyMaterial}
                        onChange={(bodyMaterial) => patchForm({ bodyMaterial })}
                        placeholder="Select or type a material"
                        showAllUntilTyped
                        maxSuggestions={500}
                        clearAriaLabel="Clear material"
                        emptyHint="No materials found — type a new material"
                      />
                    </Field>
                    <label className="inventory-checkbox-field">
                      <input
                        type="checkbox"
                        checked={form.hfAcid}
                        onChange={(e) => patchForm({ hfAcid: e.target.checked })}
                      />
                      <span>HF Acid part</span>
                    </label>
                  </div>
                  <div className="inventory-notes-in-section">
                    <Field label="Notes">
                      <textarea
                        rows={3}
                        value={form.notes}
                        onChange={(e) => patchForm({ notes: e.target.value })}
                        placeholder="Condition, special instructions…"
                      />
                    </Field>
                  </div>
                </section>
              ) : (
              <section className="inventory-form-section">
                <div className="inventory-form-section-head">
                  <h4>Valve details</h4>
                  <p>Type, size, and materials for quick picking.</p>
                </div>
                <div className="inventory-form-grid">
                  <Field label="Manufacturer">
                    <FreeTextCombobox
                      options={manufacturers}
                      value={form.manufacturerName}
                      onChange={(manufacturerName) => patchForm({ manufacturerName })}
                      placeholder="Select or type a manufacturer"
                      showAllUntilTyped
                      maxSuggestions={500}
                      clearAriaLabel="Clear manufacturer"
                      emptyHint="No manufacturers found — type a new name"
                    />
                  </Field>
                  <Field label="Valve type">
                    <FreeTextCombobox
                      options={valveTypes}
                      value={form.valveType}
                      onChange={(valveType) => patchForm({ valveType })}
                      placeholder="Select or type a valve type"
                      showAllUntilTyped
                      maxSuggestions={500}
                      clearAriaLabel="Clear valve type"
                      emptyHint="No valve types found — type a new name"
                    />
                  </Field>
                  <Field label="Size">
                    <FreeTextCombobox
                      options={sizes}
                      value={form.size}
                      onChange={(size) => patchForm({ size })}
                      placeholder="Select or type a size"
                      showAllUntilTyped
                      maxSuggestions={500}
                      clearAriaLabel="Clear size"
                      emptyHint="No sizes found — type a new size"
                    />
                  </Field>
                  <Field label="Pressure">
                    <ModalSelect
                      aria-label="Pressure"
                      value={form.pressure}
                      onChange={(pressure) => patchForm({ pressure })}
                      options={[
                        ...pressureClasses.map((option) => ({ value: option, label: option })),
                        ...(form.pressure &&
                        !pressureClasses.some((option) => option.toLowerCase() === form.pressure.toLowerCase())
                          ? [{ value: form.pressure, label: form.pressure }]
                          : []),
                      ]}
                    />
                  </Field>
                  <Field label="Body material">
                    <FreeTextCombobox
                      options={bodyMaterials}
                      value={form.bodyMaterial}
                      onChange={(bodyMaterial) => patchForm({ bodyMaterial })}
                      placeholder="Select or type a body material"
                      showAllUntilTyped
                      maxSuggestions={500}
                      clearAriaLabel="Clear body material"
                      emptyHint="No materials found — type a new material"
                    />
                  </Field>
                  <Field label="API trim">
                    <ModalSelect
                      aria-label="API trim"
                      value={form.apiTrim}
                      onChange={(apiTrim) => patchForm({ apiTrim })}
                      options={[
                        ...apiTrims.map((option) => ({ value: option, label: option })),
                        ...(form.apiTrim &&
                        !apiTrims.some((option) => option.toLowerCase() === form.apiTrim.toLowerCase())
                          ? [{ value: form.apiTrim, label: form.apiTrim }]
                          : []),
                      ]}
                    />
                  </Field>
                  <Field label="Operator">
                    <ModalSelect
                      aria-label="Operator"
                      value={form.operator}
                      onChange={(operator) => patchForm({ operator })}
                      options={INVENTORY_OPERATORS.map((option) => ({ value: option, label: option }))}
                    />
                  </Field>
                  <label className="inventory-checkbox-field">
                    <input
                      type="checkbox"
                      checked={form.hfAcid}
                      onChange={(e) => patchForm({ hfAcid: e.target.checked })}
                    />
                    <span>HF Acid valve</span>
                  </label>
                </div>
                <div className="inventory-notes-in-section">
                  <Field label="Notes">
                    <textarea
                      rows={3}
                      value={form.notes}
                      onChange={(e) => patchForm({ notes: e.target.value })}
                      placeholder="Condition, pull history, special instructions…"
                    />
                  </Field>
                </div>
              </section>
              )}
            </div>

            <div className="technician-modal-footer modal-footer">
              <button type="button" className="button-secondary" onClick={closeModal}>
                {saving ? 'Cancel save' : 'Cancel'}
              </button>
              <button type="button" className="button-primary" onClick={() => void save()} disabled={saving}>
                {saving
                  ? documentDraft.file
                    ? 'Uploading PDF…'
                    : 'Saving…'
                  : modalMode === 'edit'
                    ? 'Save changes'
                    : modalMode === 'duplicate'
                      ? 'Duplicate & generate QR'
                      : 'Create & generate QR'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {qrItem ? (
        <div className="modal-overlay" role="presentation" onClick={closeQr}>
          <div
            className="modal-card inventory-qr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-qr-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="technician-modal-head">
              <div>
                <p className="inventory-modal-kicker">
                  {isInventoryRemoved(qrItem)
                    ? 'Removed from inventory'
                    : searchParams.get('item') === qrItem.id
                      ? 'Scanned inventory item'
                      : 'QR code ready'}
                </p>
                <h3 id="inventory-qr-title">{qrItem.js_inventory_id || 'Customer inventory item'}</h3>
              </div>
              <button type="button" className="modal-close-btn" onClick={closeQr} aria-label="Close">
                ×
              </button>
            </div>
            <div className="technician-modal-body inventory-qr-body">
              {qrItem.qr_code_data_url ? (
                <img src={qrItem.qr_code_data_url} alt="Inventory QR code" className="inventory-qr-image" />
              ) : null}
              <p className="inventory-qr-js-id">{qrItem.js_inventory_id || '—'}</p>
              <p className="inventory-qr-customer-id">
                Customer ID: {qrItem.customer_id_no?.trim() || '—'}
              </p>
              <p className="inventory-qr-customer">{qrItem.customer || '—'}</p>
              <p className="inventory-qr-url">{buildInventoryItemUrl(qrItem.id)}</p>
              <div className="inventory-table-thumbs inventory-qr-thumbs">
                {qrItem.valve_image_url ? <img src={qrItem.valve_image_url} alt="Valve" /> : null}
                {qrItem.tag_image_url ? <img src={qrItem.tag_image_url} alt="Tag" /> : null}
              </div>

              {isInventoryRemoved(qrItem) ? (
                <div className="inventory-removed-banner">
                  <p>
                    Removed
                    {qrItem.removed_at
                      ? ` on ${new Date(qrItem.removed_at).toLocaleString()}`
                      : ''}
                    {qrItem.removed_by_name ? ` by ${qrItem.removed_by_name}` : ''}.
                  </p>
                  <p>
                    <strong>PO:</strong> {qrItem.removed_po_number || '—'}
                  </p>
                  {qrItem.is_valve_part ? (
                    <p>
                      <strong>Installed on valve:</strong>{' '}
                      {qrItem.removed_destination_valve_id || '—'}
                    </p>
                  ) : null}
                  <p>
                    <strong>Reason:</strong> {qrItem.removed_reason || '—'}
                  </p>
                  {showRestoreForm ? (
                    <div className="inventory-remove-form inventory-restore-form">
                      <h4>Add back to inventory</h4>
                      <p>Enter a reason for returning this item to active inventory.</p>
                      <label className="inventory-remove-field">
                        <span>Reason</span>
                        <textarea
                          rows={3}
                          value={restoreReason}
                          onChange={(e) => setRestoreReason(e.target.value)}
                          placeholder="Why is this being added back?"
                          disabled={restoring}
                          autoFocus
                        />
                      </label>
                      <div className="inventory-remove-actions">
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={restoring}
                          onClick={() => {
                            setShowRestoreForm(false)
                            setRestoreReason('')
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="button-primary"
                          disabled={restoring}
                          onClick={() => void confirmRestoreToInventory()}
                        >
                          {restoring ? 'Saving…' : 'Confirm add back'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="button-primary inventory-remove-trigger"
                      onClick={() => setShowRestoreForm(true)}
                    >
                      Add back to inventory
                    </button>
                  )}
                </div>
              ) : showRemoveForm ? (
                <div className="inventory-remove-form">
                  <h4>Remove from inventory</h4>
                  <p>
                    {qrItem.is_valve_part
                      ? 'Enter the customer purchase order and the valve ID this part is going into before removing.'
                      : 'Enter the purchase order and reason before this item leaves inventory.'}
                  </p>
                  <label className="inventory-remove-field">
                    <span>Customer purchase order #</span>
                    <input
                      type="text"
                      value={removePoNumber}
                      onChange={(e) => setRemovePoNumber(e.target.value)}
                      placeholder="PO number"
                      disabled={removing}
                      autoFocus
                    />
                  </label>
                  {qrItem.is_valve_part ? (
                    <label className="inventory-remove-field">
                      <span>Valve ID (part going into)</span>
                      <input
                        type="text"
                        value={removeDestinationValveId}
                        onChange={(e) => setRemoveDestinationValveId(e.target.value)}
                        placeholder="Valve / tag ID receiving this part"
                        disabled={removing}
                      />
                    </label>
                  ) : null}
                  <label className="inventory-remove-field">
                    <span>Reason</span>
                    <textarea
                      rows={3}
                      value={removeReason}
                      onChange={(e) => setRemoveReason(e.target.value)}
                      placeholder={
                        qrItem.is_valve_part
                          ? 'Why is this part being removed from inventory?'
                          : 'Why is this being removed from inventory?'
                      }
                      disabled={removing}
                    />
                  </label>
                  <div className="inventory-remove-actions">
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={removing}
                      onClick={() => {
                        setShowRemoveForm(false)
                        setRemoveReason('')
                        setRemovePoNumber('')
                        setRemoveDestinationValveId('')
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="button-primary"
                      disabled={removing}
                      onClick={() => void confirmRemoveFromInventory()}
                    >
                      {removing ? 'Removing…' : 'Confirm remove'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="button-secondary inventory-remove-trigger"
                  onClick={() => setShowRemoveForm(true)}
                >
                  Remove from inventory
                </button>
              )}
            </div>
            <div className="technician-modal-footer modal-footer">
              <button type="button" className="button-secondary" onClick={closeQr}>
                Close
              </button>
              {!isInventoryRemoved(qrItem) ? (
                <>
                  {qrItem.qr_code_data_url ? (
                    <button type="button" className="button-secondary" onClick={downloadQr}>
                      Download QR
                    </button>
                  ) : null}
                  <button type="button" className="button-secondary" onClick={editFromQr}>
                    Edit
                  </button>
                  {qrItem.qr_code_data_url ? (
                    <button type="button" className="button-primary" onClick={printQrLabel}>
                      Print label
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
