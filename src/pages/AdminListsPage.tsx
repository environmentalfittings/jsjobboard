import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { ValveTypeProceduresPanel } from '../components/ValveTypeProceduresPanel'
import { JOB_TYPES, normalizeJobType } from '../constants/jobTypes'
import { LOOKUP_CATEGORY_DEFS, type LookupCategory } from '../constants/lookupCategories'
import { useEmployees } from '../hooks/useEmployees'
import {
  loadCustomersWithSalesRep,
  updateCustomerSalesRep,
  type CustomerSalesRepRow,
} from '../lib/customers'
import {
  normalizeNps,
  normalizePressureClass,
  parseFlangeThicknessWorkbook,
  type FlangeThicknessReferenceRow,
} from '../lib/flangeThicknessRefs'
import {
  B1610_DEFAULT_ROWS,
  normalizeEndConnection,
  normalizeValveType,
  parseB1610Workbook,
  type B1610FaceToFaceReferenceRow,
} from '../lib/b1610FaceToFace'
import {
  B1634_DEFAULT_ROWS,
  parseB1634Workbook,
  type B1634WallThicknessReferenceRow,
} from '../lib/b1634WallThickness'
import type { LookupValueRow } from '../lib/lookupValues'
import { supabase } from '../lib/supabase'

type Tab = 'lookups' | 'customers' | 'itpTemplates' | 'valveTypes' | 'flangeThickness' | 'b1610' | 'b1634'

type CustomerRow = CustomerSalesRepRow
type ItpTemplateRow = {
  id: number
  job_type: string
  valve_type: string | null
  step_order: number
  step_name: string
  required: boolean
}
type FlangeRefForm = {
  nps: string
  pressureClass: string
  minThickness: string
  notes: string
}
type B1610RefForm = {
  valveType: string
  nps: string
  pressureClass: string
  endConnection: string
  standardDimension: string
  tolerance: string
  notes: string
}
type B1634RefForm = {
  valveType: string
  nps: string
  pressureClass: string
  minWallThickness: string
  notes: string
}

const MANAGE_LISTS_PIN = '1582'

export function AdminListsPage() {
  const { showToast } = useToast()
  const { employees } = useEmployees()
  const [unlocked, setUnlocked] = useState(false)
  const [pinDraft, setPinDraft] = useState('')
  const [pinError, setPinError] = useState(false)

  const tryUnlock = () => {
    if (pinDraft === MANAGE_LISTS_PIN) {
      setUnlocked(true)
      setPinDraft('')
      setPinError(false)
    } else {
      setPinError(true)
      setPinDraft('')
    }
  }

  const [tab, setTab] = useState<Tab>('lookups')
  const [lookupRows, setLookupRows] = useState<LookupValueRow[]>([])
  const [lookupLoading, setLookupLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<LookupCategory>('test_type')
  const [newLookupValue, setNewLookupValue] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [savingLookup, setSavingLookup] = useState(false)

  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [customersLoading, setCustomersLoading] = useState(true)
  const [salesRepColumnMissing, setSalesRepColumnMissing] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [editingCustomerId, setEditingCustomerId] = useState<number | null>(null)
  const [customerDraft, setCustomerDraft] = useState('')
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [savingSalesRepId, setSavingSalesRepId] = useState<number | null>(null)
  const [itpRows, setItpRows] = useState<ItpTemplateRow[]>([])
  const [itpLoading, setItpLoading] = useState(true)

  // ── Valve types ──────────────────────────────────────────────────────────
  const [valveTypes, setValveTypes] = useState<string[]>([])
  const [valveTypesLoading, setValveTypesLoading] = useState(false)
  const [newValveType, setNewValveType] = useState('')
  const [addingValveType, setAddingValveType] = useState(false)
  const [valveTypeReloadTick, setValveTypeReloadTick] = useState(0)
  const [itpJobType, setItpJobType] = useState<string>('Valve Repair')
  const [itpValveType, setItpValveType] = useState<string>('')
  const [itpNewStep, setItpNewStep] = useState('')
  const [itpNewRequired, setItpNewRequired] = useState(true)
  const [itpEditingId, setItpEditingId] = useState<number | null>(null)
  const [itpEditDraft, setItpEditDraft] = useState('')
  const [itpEditRequired, setItpEditRequired] = useState(true)
  const [itpSaving, setItpSaving] = useState(false)
  const [flangeRefs, setFlangeRefs] = useState<FlangeThicknessReferenceRow[]>([])
  const [flangeRefsLoading, setFlangeRefsLoading] = useState(false)
  const [flangeRefSaving, setFlangeRefSaving] = useState(false)
  const [uploadingFlangeWorkbook, setUploadingFlangeWorkbook] = useState(false)
  const [flangeDraft, setFlangeDraft] = useState<FlangeRefForm>({
    nps: '',
    pressureClass: '',
    minThickness: '',
    notes: '',
  })
  const [b1610Refs, setB1610Refs] = useState<B1610FaceToFaceReferenceRow[]>([])
  const [b1610Loading, setB1610Loading] = useState(false)
  const [b1610Saving, setB1610Saving] = useState(false)
  const [uploadingB1610Workbook, setUploadingB1610Workbook] = useState(false)
  const [seedingB1610Defaults, setSeedingB1610Defaults] = useState(false)
  const [b1610Draft, setB1610Draft] = useState<B1610RefForm>({
    valveType: 'Plug',
    nps: '',
    pressureClass: '',
    endConnection: 'ANY',
    standardDimension: '',
    tolerance: '0.0625',
    notes: '',
  })
  const [b1634Refs, setB1634Refs] = useState<B1634WallThicknessReferenceRow[]>([])
  const [b1634Loading, setB1634Loading] = useState(false)
  const [b1634Saving, setB1634Saving] = useState(false)
  const [uploadingB1634Workbook, setUploadingB1634Workbook] = useState(false)
  const [seedingB1634Defaults, setSeedingB1634Defaults] = useState(false)
  const [b1634Draft, setB1634Draft] = useState<B1634RefForm>({
    valveType: 'Plug',
    nps: '',
    pressureClass: '',
    minWallThickness: '',
    notes: '',
  })

  const loadLookups = useCallback(async () => {
    setLookupLoading(true)
    const { data, error } = await supabase
      .from('lookup_values')
      .select('id,category,value,sort_order')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
    setLookupLoading(false)
    if (error) {
      showToast('Could not load dropdown lists')
      return
    }
    setLookupRows((data ?? []) as LookupValueRow[])
  }, [showToast])

  const loadValveTypes = useCallback(async () => {
    setValveTypesLoading(true)
    const { data, error } = await supabase
      .from('lookup_values')
      .select('value')
      .eq('category', 'valve_type')
      .order('sort_order', { ascending: true })
    setValveTypesLoading(false)
    if (error) { showToast('Could not load valve types'); return }
    setValveTypes((data ?? []).map((r: { value: string }) => r.value))
  }, [showToast])

  const addValveType = async () => {
    const value = newValveType.trim()
    if (!value) { showToast('Enter a valve type name'); return }
    if (valveTypes.some((t) => t.toLowerCase() === value.toLowerCase())) {
      showToast('Valve type already exists'); return
    }
    setAddingValveType(true)
    const { error } = await supabase.from('lookup_values').insert({
      category: 'valve_type', value, sort_order: valveTypes.length + 1,
    })
    setAddingValveType(false)
    if (error) { showToast(`Could not add valve type: ${error.message}`); return }
    setNewValveType('')
    setValveTypeReloadTick((n) => n + 1)
    showToast('Valve type added')
    void loadValveTypes()
  }

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true)
    const { data, error, salesRepColumnMissing: missing } = await loadCustomersWithSalesRep()
    setCustomersLoading(false)
    setSalesRepColumnMissing(missing)
    if (error) {
      showToast('Could not load customers')
      setCustomers([])
      return
    }
    setCustomers(data)
  }, [showToast])

  const salesmanOptions = useMemo(
    () =>
      employees
        .filter((employee) => employee.is_active)
        .slice()
        .sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })),
    [employees],
  )

  const saveCustomerSalesRep = async (customerId: number, salesRepEmployeeId: string) => {
    setSavingSalesRepId(customerId)
    const { error } = await updateCustomerSalesRep(customerId, salesRepEmployeeId || null)
    setSavingSalesRepId(null)
    if (error) {
      showToast(error)
      return
    }
    setCustomers((prev) =>
      prev.map((row) =>
        row.id === customerId ? { ...row, sales_rep_employee_id: salesRepEmployeeId || null } : row,
      ),
    )
    showToast(salesRepEmployeeId ? 'Salesman saved' : 'Salesman cleared')
  }

  useEffect(() => {
    loadLookups()
    loadCustomers()
    void loadValveTypes()
  }, [loadLookups, loadCustomers, loadValveTypes])

  const loadItpTemplates = useCallback(async () => {
    setItpLoading(true)
    const { data, error } = await supabase
      .from('itp_templates')
      .select('id,job_type,valve_type,step_order,step_name,required')
      .order('step_order', { ascending: true })
      .order('id', { ascending: true })
    setItpLoading(false)
    if (error) {
      showToast('Could not load ITP templates')
      return
    }
    setItpRows((data ?? []) as ItpTemplateRow[])
  }, [showToast])

  const loadFlangeRefs = useCallback(async () => {
    setFlangeRefsLoading(true)
    const { data, error } = await supabase
      .from('flange_thickness_refs')
      .select('id,nps,pressure_class,min_thickness,notes,source,created_at,updated_at')
      .order('nps', { ascending: true })
      .order('pressure_class', { ascending: true })
    setFlangeRefsLoading(false)
    if (error) {
      showToast(`Could not load flange thickness refs: ${error.message}`)
      return
    }
    setFlangeRefs((data ?? []) as FlangeThicknessReferenceRow[])
  }, [showToast])

  const loadB1610Refs = useCallback(async () => {
    setB1610Loading(true)
    const { data, error } = await supabase
      .from('b1610_face_to_face_refs')
      .select('id,valve_type,nps,pressure_class,end_connection,standard_dimension,tolerance,notes,source,created_at,updated_at')
      .order('valve_type', { ascending: true })
      .order('nps', { ascending: true })
      .order('pressure_class', { ascending: true })
      .order('end_connection', { ascending: true })
    setB1610Loading(false)
    if (error) {
      showToast(`Could not load B16.10 refs: ${error.message}`)
      return
    }
    setB1610Refs((data ?? []) as B1610FaceToFaceReferenceRow[])
  }, [showToast])

  const loadB1634Refs = useCallback(async () => {
    setB1634Loading(true)
    const { data, error } = await supabase
      .from('b1634_wall_thickness_refs')
      .select('id,valve_type,nps,pressure_class,min_wall_thickness,notes,source,created_at,updated_at')
      .order('valve_type', { ascending: true })
      .order('nps', { ascending: true })
      .order('pressure_class', { ascending: true })
    setB1634Loading(false)
    if (error) {
      showToast(`Could not load B16.34 refs: ${error.message}`)
      return
    }
    setB1634Refs((data ?? []) as B1634WallThicknessReferenceRow[])
  }, [showToast])

  useEffect(() => {
    loadItpTemplates()
  }, [loadItpTemplates])

  useEffect(() => {
    void loadFlangeRefs()
  }, [loadFlangeRefs])

  useEffect(() => {
    void loadB1610Refs()
  }, [loadB1610Refs])

  useEffect(() => {
    void loadB1634Refs()
  }, [loadB1634Refs])

  const categoryItems = useMemo(() => {
    const items = lookupRows.filter((r) => r.category === activeCategory)
    if (activeCategory === 'manufacturer') {
      return [...items].sort((a, b) => a.value.localeCompare(b.value, undefined, { sensitivity: 'base' }))
    }
    return items
  }, [lookupRows, activeCategory])

  const activeLabel = LOOKUP_CATEGORY_DEFS.find((d) => d.key === activeCategory)?.label ?? activeCategory
  const valveTypeOptions = useMemo(
    () => lookupRows.filter((r) => r.category === 'valve_type').map((r) => r.value),
    [lookupRows],
  )
  const filteredItpRows = useMemo(() => {
    return itpRows.filter((row) => {
      if (normalizeJobType(row.job_type) !== normalizeJobType(itpJobType)) return false
      const targetValve = itpValveType.trim()
      return targetValve ? (row.valve_type ?? '') === targetValve : row.valve_type === null
    })
  }, [itpRows, itpJobType, itpValveType])

  const addLookup = async () => {
    const v = newLookupValue.trim()
    if (!v) {
      showToast('Enter a value')
      return
    }
    const maxOrder = categoryItems.reduce((m, r) => Math.max(m, r.sort_order), -1)
    setSavingLookup(true)
    const { error } = await supabase
      .from('lookup_values')
      .insert({ category: activeCategory, value: v, sort_order: maxOrder + 1 })
    setSavingLookup(false)
    if (error) {
      if (error.code === '23505' || error.message.includes('duplicate')) {
        showToast('That value already exists in this list')
      } else {
        showToast('Could not add value')
      }
      return
    }
    showToast('Added')
    setNewLookupValue('')
    loadLookups()
  }

  const saveLookupEdit = async (id: number) => {
    const v = editDraft.trim()
    if (!v) {
      showToast('Value cannot be empty')
      return
    }
    setSavingLookup(true)
    const { error } = await supabase.from('lookup_values').update({ value: v }).eq('id', id)
    setSavingLookup(false)
    if (error) {
      if (error.code === '23505' || error.message.includes('duplicate')) {
        showToast('Another row already uses that value')
      } else {
        showToast('Could not save')
      }
      return
    }
    setEditingId(null)
    showToast('Saved')
    loadLookups()
  }

  const deleteLookup = async (id: number) => {
    if (!window.confirm('Remove this option from the list?')) return
    const { error } = await supabase.from('lookup_values').delete().eq('id', id)
    if (error) {
      showToast('Could not delete')
      return
    }
    showToast('Removed')
    loadLookups()
  }

  const moveLookup = async (row: LookupValueRow, direction: -1 | 1) => {
    const sorted = [...categoryItems].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    const i = sorted.findIndex((r) => r.id === row.id)
    const j = i + direction
    if (i < 0 || j < 0 || j >= sorted.length) return
    const a = sorted[i]
    const b = sorted[j]
    const soA = a.sort_order
    const soB = b.sort_order
    setSavingLookup(true)
    const e1 = await supabase.from('lookup_values').update({ sort_order: soB }).eq('id', a.id)
    const e2 = await supabase.from('lookup_values').update({ sort_order: soA }).eq('id', b.id)
    setSavingLookup(false)
    if (e1.error || e2.error) {
      showToast('Could not reorder')
      return
    }
    loadLookups()
  }

  const addCustomer = async () => {
    const n = newCustomerName.trim()
    if (!n) {
      showToast('Enter a customer name')
      return
    }
    setSavingCustomer(true)
    const { error } = await supabase.from('customers').insert({ name: n })
    setSavingCustomer(false)
    if (error) {
      if (error.code === '23505' || error.message.includes('duplicate')) {
        showToast('That customer already exists')
      } else {
        showToast('Could not add customer')
      }
      return
    }
    showToast('Customer added')
    setNewCustomerName('')
    loadCustomers()
  }

  const saveCustomerEdit = async (id: number) => {
    const n = customerDraft.trim()
    if (!n) {
      showToast('Name cannot be empty')
      return
    }
    setSavingCustomer(true)
    const { error } = await supabase.from('customers').update({ name: n }).eq('id', id)
    setSavingCustomer(false)
    if (error) {
      if (error.code === '23505' || error.message.includes('duplicate')) {
        showToast('That name is already used')
      } else {
        showToast('Could not save')
      }
      return
    }
    setEditingCustomerId(null)
    showToast('Saved')
    loadCustomers()
  }

  const deleteCustomer = async (id: number) => {
    if (!window.confirm('Remove this customer from the list? Existing jobs keep their stored name.')) return
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) {
      showToast('Could not delete')
      return
    }
    showToast('Removed')
    loadCustomers()
  }

  const addItpStep = async () => {
    const stepName = itpNewStep.trim()
    if (!stepName) {
      showToast('Enter a step name')
      return
    }
    const maxOrder = filteredItpRows.reduce((m, row) => Math.max(m, row.step_order), -1)
    setItpSaving(true)
    const { error } = await supabase.from('itp_templates').insert({
      job_type: normalizeJobType(itpJobType),
      valve_type: itpValveType.trim() || null,
      step_order: maxOrder + 1,
      step_name: stepName,
      required: itpNewRequired,
    })
    setItpSaving(false)
    if (error) {
      showToast('Could not add ITP step')
      return
    }
    setItpNewStep('')
    setItpNewRequired(true)
    showToast('ITP step added')
    loadItpTemplates()
  }

  const saveItpEdit = async (id: number) => {
    const stepName = itpEditDraft.trim()
    if (!stepName) {
      showToast('Step name cannot be empty')
      return
    }
    setItpSaving(true)
    const { error } = await supabase
      .from('itp_templates')
      .update({ step_name: stepName, required: itpEditRequired })
      .eq('id', id)
    setItpSaving(false)
    if (error) {
      showToast('Could not save step')
      return
    }
    setItpEditingId(null)
    showToast('ITP step saved')
    loadItpTemplates()
  }

  const deleteItpStep = async (id: number) => {
    if (!window.confirm('Delete this ITP step?')) return
    const { error } = await supabase.from('itp_templates').delete().eq('id', id)
    if (error) {
      showToast('Could not delete step')
      return
    }
    showToast('ITP step deleted')
    loadItpTemplates()
  }

  const moveItpStep = async (row: ItpTemplateRow, direction: -1 | 1) => {
    const sorted = [...filteredItpRows].sort((a, b) => a.step_order - b.step_order || a.id - b.id)
    const i = sorted.findIndex((r) => r.id === row.id)
    const j = i + direction
    if (i < 0 || j < 0 || j >= sorted.length) return
    const current = sorted[i]
    const neighbor = sorted[j]
    setItpSaving(true)
    const e1 = await supabase.from('itp_templates').update({ step_order: neighbor.step_order }).eq('id', current.id)
    const e2 = await supabase.from('itp_templates').update({ step_order: current.step_order }).eq('id', neighbor.id)
    setItpSaving(false)
    if (e1.error || e2.error) {
      showToast('Could not reorder steps')
      return
    }
    loadItpTemplates()
  }

  const addFlangeRef = async () => {
    const nps = normalizeNps(flangeDraft.nps)
    const pressureClass = normalizePressureClass(flangeDraft.pressureClass)
    const minThickness = Number.parseFloat(flangeDraft.minThickness)
    if (!nps || !pressureClass) {
      showToast('Enter size and pressure class')
      return
    }
    if (!Number.isFinite(minThickness) || minThickness <= 0) {
      showToast('Enter a valid minimum thickness')
      return
    }
    setFlangeRefSaving(true)
    const { error } = await supabase.from('flange_thickness_refs').upsert(
      {
        nps,
        pressure_class: pressureClass,
        min_thickness: minThickness,
        notes: flangeDraft.notes.trim() || null,
        source: 'Admin manual entry',
      },
      { onConflict: 'nps,pressure_class' },
    )
    setFlangeRefSaving(false)
    if (error) {
      showToast(`Could not save row: ${error.message}`)
      return
    }
    setFlangeDraft({ nps: '', pressureClass: '', minThickness: '', notes: '' })
    showToast('Flange thickness reference saved')
    void loadFlangeRefs()
  }

  const deleteFlangeRef = async (id: number) => {
    if (!window.confirm('Delete this flange thickness reference row?')) return
    const { error } = await supabase.from('flange_thickness_refs').delete().eq('id', id)
    if (error) {
      showToast(`Could not delete row: ${error.message}`)
      return
    }
    showToast('Row deleted')
    void loadFlangeRefs()
  }

  const uploadFlangeWorkbook = async (file: File | null) => {
    if (!file) return
    setUploadingFlangeWorkbook(true)
    try {
      const parsed = await parseFlangeThicknessWorkbook(file)
      if (!parsed.length) {
        showToast('No valid rows found in workbook. Expected size/class/min thickness columns.')
        setUploadingFlangeWorkbook(false)
        return
      }
      const rows = parsed.map((r) => ({
        nps: r.nps,
        pressure_class: r.pressure_class,
        min_thickness: r.min_thickness,
        notes: r.notes ?? null,
        source: `Workbook import: ${file.name}`,
      }))
      const { error } = await supabase.from('flange_thickness_refs').upsert(rows, {
        onConflict: 'nps,pressure_class',
      })
      setUploadingFlangeWorkbook(false)
      if (error) {
        showToast(`Could not import workbook: ${error.message}`)
        return
      }
      showToast(`Imported ${rows.length} flange thickness reference row(s)`)
      void loadFlangeRefs()
    } catch (e) {
      setUploadingFlangeWorkbook(false)
      showToast(`Could not parse workbook: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  const addB1610Ref = async () => {
    const valveType = normalizeValveType(b1610Draft.valveType)
    const nps = normalizeNps(b1610Draft.nps)
    const pressureClass = normalizePressureClass(b1610Draft.pressureClass)
    const endConnection = normalizeEndConnection(b1610Draft.endConnection)
    const standardDimension = Number.parseFloat(b1610Draft.standardDimension)
    const tolerance = Number.parseFloat(b1610Draft.tolerance)
    if (!valveType || !nps || !pressureClass) {
      showToast('Enter valve type, size, and pressure class')
      return
    }
    if (!Number.isFinite(standardDimension) || standardDimension <= 0) {
      showToast('Enter a valid standard dimension')
      return
    }
    if (!Number.isFinite(tolerance) || tolerance <= 0) {
      showToast('Enter a valid tolerance')
      return
    }
    setB1610Saving(true)
    const { error } = await supabase.from('b1610_face_to_face_refs').upsert(
      {
        valve_type: valveType,
        nps,
        pressure_class: pressureClass,
        end_connection: endConnection ?? 'ANY',
        standard_dimension: standardDimension,
        tolerance,
        notes: b1610Draft.notes.trim() || null,
        source: 'Admin manual entry',
      },
      { onConflict: 'valve_type,nps,pressure_class,end_connection' },
    )
    setB1610Saving(false)
    if (error) {
      showToast(`Could not save B16.10 row: ${error.message}`)
      return
    }
    setB1610Draft({
      valveType: 'Plug',
      nps: '',
      pressureClass: '',
      endConnection: 'ANY',
      standardDimension: '',
      tolerance: '0.0625',
      notes: '',
    })
    showToast('B16.10 reference saved')
    void loadB1610Refs()
  }

  const deleteB1610Ref = async (id: number) => {
    if (!window.confirm('Delete this B16.10 reference row?')) return
    const { error } = await supabase.from('b1610_face_to_face_refs').delete().eq('id', id)
    if (error) {
      showToast(`Could not delete row: ${error.message}`)
      return
    }
    showToast('Row deleted')
    void loadB1610Refs()
  }

  const uploadB1610Workbook = async (file: File | null) => {
    if (!file) return
    setUploadingB1610Workbook(true)
    try {
      const parsed = await parseB1610Workbook(file)
      if (!parsed.length) {
        showToast('No valid rows found in workbook. Expected valve type/size/class/face-to-face columns.')
        setUploadingB1610Workbook(false)
        return
      }
      const rows = parsed.map((r) => ({
        ...r,
        source: `Workbook import: ${file.name}`,
      }))
      const { error } = await supabase.from('b1610_face_to_face_refs').upsert(rows, {
        onConflict: 'valve_type,nps,pressure_class,end_connection',
      })
      setUploadingB1610Workbook(false)
      if (error) {
        showToast(`Could not import workbook: ${error.message}`)
        return
      }
      showToast(`Imported ${rows.length} B16.10 row(s)`)
      void loadB1610Refs()
    } catch (e) {
      setUploadingB1610Workbook(false)
      showToast(`Could not parse workbook: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  const seedB1610Criteria = async () => {
    if (
      !window.confirm(
        'Load starter B16.10 criteria from bundled defaults? Existing matching rows will be updated. Safe to run more than once.',
      )
    )
      return
    setSeedingB1610Defaults(true)
    const { error } = await supabase.from('b1610_face_to_face_refs').upsert(B1610_DEFAULT_ROWS, {
      onConflict: 'valve_type,nps,pressure_class,end_connection',
    })
    setSeedingB1610Defaults(false)
    if (error) {
      showToast(`Could not seed B16.10 criteria: ${error.message}`)
      return
    }
    showToast(`Loaded ${B1610_DEFAULT_ROWS.length} starter B16.10 row(s)`)
    void loadB1610Refs()
  }

  const addB1634Ref = async () => {
    const valveType = normalizeValveType(b1634Draft.valveType)
    const nps = normalizeNps(b1634Draft.nps)
    const pressureClass = normalizePressureClass(b1634Draft.pressureClass)
    const minWallThickness = Number.parseFloat(b1634Draft.minWallThickness)
    if (!valveType || !nps || !pressureClass) {
      showToast('Enter valve type, size, and pressure class')
      return
    }
    if (!Number.isFinite(minWallThickness) || minWallThickness <= 0) {
      showToast('Enter a valid minimum wall thickness')
      return
    }
    setB1634Saving(true)
    const { error } = await supabase.from('b1634_wall_thickness_refs').upsert(
      {
        valve_type: valveType,
        nps,
        pressure_class: pressureClass,
        min_wall_thickness: minWallThickness,
        notes: b1634Draft.notes.trim() || null,
        source: 'Admin manual entry',
      },
      { onConflict: 'valve_type,nps,pressure_class' },
    )
    setB1634Saving(false)
    if (error) {
      showToast(`Could not save B16.34 row: ${error.message}`)
      return
    }
    setB1634Draft({
      valveType: 'Plug',
      nps: '',
      pressureClass: '',
      minWallThickness: '',
      notes: '',
    })
    showToast('B16.34 reference saved')
    void loadB1634Refs()
  }

  const deleteB1634Ref = async (id: number) => {
    if (!window.confirm('Delete this B16.34 reference row?')) return
    const { error } = await supabase.from('b1634_wall_thickness_refs').delete().eq('id', id)
    if (error) {
      showToast(`Could not delete row: ${error.message}`)
      return
    }
    showToast('Row deleted')
    void loadB1634Refs()
  }

  const uploadB1634Workbook = async (file: File | null) => {
    if (!file) return
    setUploadingB1634Workbook(true)
    try {
      const parsed = await parseB1634Workbook(file)
      if (!parsed.length) {
        showToast('No valid rows found in workbook. Expected valve type/size/class/min wall columns.')
        setUploadingB1634Workbook(false)
        return
      }
      const rows = parsed.map((r) => ({
        ...r,
        source: `Workbook import: ${file.name}`,
      }))
      const { error } = await supabase.from('b1634_wall_thickness_refs').upsert(rows, {
        onConflict: 'valve_type,nps,pressure_class',
      })
      setUploadingB1634Workbook(false)
      if (error) {
        showToast(`Could not import workbook: ${error.message}`)
        return
      }
      showToast(`Imported ${rows.length} B16.34 row(s)`)
      void loadB1634Refs()
    } catch (e) {
      setUploadingB1634Workbook(false)
      showToast(`Could not parse workbook: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  const seedB1634Criteria = async () => {
    if (!B1634_DEFAULT_ROWS.length) {
      showToast('No bundled B16.34 starter rows yet. Import a workbook to populate this list.')
      return
    }
    if (
      !window.confirm(
        'Load starter B16.34 criteria from bundled defaults? Existing matching rows will be updated. Safe to run more than once.',
      )
    )
      return
    setSeedingB1634Defaults(true)
    const { error } = await supabase.from('b1634_wall_thickness_refs').upsert(B1634_DEFAULT_ROWS, {
      onConflict: 'valve_type,nps,pressure_class',
    })
    setSeedingB1634Defaults(false)
    if (error) {
      showToast(`Could not seed B16.34 criteria: ${error.message}`)
      return
    }
    showToast(`Loaded ${B1634_DEFAULT_ROWS.length} starter B16.34 row(s)`)
    void loadB1634Refs()
  }

  if (!unlocked) {
    return (
      <section className="dashboard-page">
        <div className="dashboard-title-row admin-page-heading">
          <h2 className="dashboard-title">Manage lists</h2>
          <Link to="/dashboard" className="button-secondary">Back</Link>
        </div>
        <div className="manage-lists-pin-gate">
          <div className="manage-lists-pin-card">
            <div className="manage-lists-pin-icon">🔒</div>
            <h3 className="manage-lists-pin-title">Admin access required</h3>
            <p className="manage-lists-pin-desc">Enter the Manage Lists PIN to continue.</p>
            <input
              type="password"
              inputMode="numeric"
              className="manage-lists-pin-input"
              value={pinDraft}
              onChange={(e) => { setPinDraft(e.target.value); setPinError(false) }}
              onKeyDown={(e) => e.key === 'Enter' && tryUnlock()}
              placeholder="PIN"
              autoFocus
              autoComplete="off"
            />
            {pinError ? <p className="manage-lists-pin-error">Incorrect PIN. Try again.</p> : null}
            <button type="button" className="button-primary manage-lists-pin-btn" onClick={tryUnlock}>
              Unlock
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="dashboard-page">
      <div className="dashboard-title-row admin-page-heading">
        <h2 className="dashboard-title">Manage lists</h2>
        <Link to="/dashboard" className="button-secondary">
          Back
        </Link>
      </div>

      <p className="placeholder-copy admin-lists-intro">
        Admin only. Changes apply to New job dropdowns for everyone. Edit each list tab below to add, rename, or
        remove options.
      </p>

      <div className="admin-lists-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'lookups'}
          className={`admin-lists-tab ${tab === 'lookups' ? 'active' : ''}`}
          onClick={() => setTab('lookups')}
        >
          Job field lists
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'itpTemplates'}
          className={`admin-lists-tab ${tab === 'itpTemplates' ? 'active' : ''}`}
          onClick={() => setTab('itpTemplates')}
        >
          ITP Templates
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'customers'}
          className={`admin-lists-tab ${tab === 'customers' ? 'active' : ''}`}
          onClick={() => setTab('customers')}
        >
          Customers
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'valveTypes'}
          className={`admin-lists-tab ${tab === 'valveTypes' ? 'active' : ''}`}
          onClick={() => setTab('valveTypes')}
        >
          Valve Types
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'flangeThickness'}
          className={`admin-lists-tab ${tab === 'flangeThickness' ? 'active' : ''}`}
          onClick={() => setTab('flangeThickness')}
        >
          Flange Thickness
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'b1610'}
          className={`admin-lists-tab ${tab === 'b1610' ? 'active' : ''}`}
          onClick={() => setTab('b1610')}
        >
          B16.10 F2F
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'b1634'}
          className={`admin-lists-tab ${tab === 'b1634' ? 'active' : ''}`}
          onClick={() => setTab('b1634')}
        >
          B16.34 Wall
        </button>
      </div>

      {tab === 'lookups' && (
        <section className="dashboard-panel admin-lists-panel">
          <h3>Dropdown options</h3>
          <div className="admin-category-tabs">
            {LOOKUP_CATEGORY_DEFS.map((d) => (
              <button
                key={d.key}
                type="button"
                className={`admin-category-tab ${activeCategory === d.key ? 'active' : ''}`}
                onClick={() => {
                  setActiveCategory(d.key)
                  setEditingId(null)
                  setNewLookupValue('')
                }}
              >
                {d.label}
              </button>
            ))}
          </div>

          {lookupLoading ? (
            <p className="placeholder-copy">Loading…</p>
          ) : (
            <>
              <ul className="admin-list-rows">
                {categoryItems.map((row) => (
                  <li key={row.id} className="admin-list-row">
                    {editingId === row.id ? (
                      <>
                        <input
                          className="admin-list-input"
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          aria-label="Edit value"
                        />
                        <button
                          type="button"
                          className="button-primary admin-list-btn"
                          disabled={savingLookup}
                          onClick={() => saveLookupEdit(row.id)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="button-secondary admin-list-btn"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="admin-list-value">{row.value}</span>
                        <div className="admin-list-actions">
                          <button
                            type="button"
                            className="button-secondary admin-list-btn"
                            title="Move up"
                            disabled={savingLookup}
                            onClick={() => moveLookup(row, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="button-secondary admin-list-btn"
                            title="Move down"
                            disabled={savingLookup}
                            onClick={() => moveLookup(row, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="button-secondary admin-list-btn"
                            onClick={() => {
                              setEditingId(row.id)
                              setEditDraft(row.value)
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="button-secondary admin-list-btn danger"
                            onClick={() => deleteLookup(row.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>

              <div className="admin-add-row">
                <span className="admin-add-label">Add to {activeLabel}</span>
                <div className="admin-add-controls">
                  <input
                    type="text"
                    value={newLookupValue}
                    onChange={(e) => setNewLookupValue(e.target.value)}
                    placeholder="New option"
                    aria-label={`New ${activeLabel} option`}
                  />
                  <button type="button" className="button-primary" disabled={savingLookup} onClick={addLookup}>
                    Add
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'itpTemplates' && (
        <section className="dashboard-panel admin-lists-panel">
          <h3>ITP Templates</h3>
          <div className="itp-admin-filters">
            <label>
              Job type
              <select value={itpJobType} onChange={(e) => setItpJobType(e.target.value)}>
                {JOB_TYPES.map((jt) => (
                  <option key={jt} value={jt}>
                    {jt}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Valve type (optional)
              <select
                value={itpValveType}
                onChange={(e) => setItpValveType(e.target.value)}
                disabled={normalizeJobType(itpJobType) !== 'Valve Repair'}
              >
                <option value="">Generic for this job type</option>
                {valveTypeOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {itpLoading ? (
            <p className="placeholder-copy">Loading…</p>
          ) : (
            <>
              <ul className="admin-list-rows">
                {filteredItpRows.map((row) => (
                  <li key={row.id} className="admin-list-row">
                    {itpEditingId === row.id ? (
                      <>
                        <input
                          className="admin-list-input"
                          value={itpEditDraft}
                          onChange={(e) => setItpEditDraft(e.target.value)}
                          aria-label="Edit ITP step"
                        />
                        <label className="itp-admin-required-toggle">
                          <input
                            type="checkbox"
                            checked={itpEditRequired}
                            onChange={(e) => setItpEditRequired(e.target.checked)}
                          />
                          Required
                        </label>
                        <button
                          type="button"
                          className="button-primary admin-list-btn"
                          disabled={itpSaving}
                          onClick={() => saveItpEdit(row.id)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="button-secondary admin-list-btn"
                          onClick={() => setItpEditingId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="admin-list-value">
                          {row.step_name} {row.required ? <em className="itp-required-chip">Required</em> : null}
                        </span>
                        <div className="admin-list-actions">
                          <button
                            type="button"
                            className="button-secondary admin-list-btn"
                            title="Move up"
                            disabled={itpSaving}
                            onClick={() => moveItpStep(row, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="button-secondary admin-list-btn"
                            title="Move down"
                            disabled={itpSaving}
                            onClick={() => moveItpStep(row, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="button-secondary admin-list-btn"
                            onClick={() => {
                              setItpEditingId(row.id)
                              setItpEditDraft(row.step_name)
                              setItpEditRequired(row.required)
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="button-secondary admin-list-btn danger"
                            onClick={() => deleteItpStep(row.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <div className="admin-add-row">
                <span className="admin-add-label">Add ITP step</span>
                <div className="admin-add-controls itp-admin-add-controls">
                  <input
                    type="text"
                    value={itpNewStep}
                    onChange={(e) => setItpNewStep(e.target.value)}
                    placeholder="Step name"
                    aria-label="New ITP step"
                  />
                  <label className="itp-admin-required-toggle">
                    <input
                      type="checkbox"
                      checked={itpNewRequired}
                      onChange={(e) => setItpNewRequired(e.target.checked)}
                    />
                    Required
                  </label>
                  <button type="button" className="button-primary" disabled={itpSaving} onClick={addItpStep}>
                    Add
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'customers' && (
        <section className="dashboard-panel admin-lists-panel">
          <h3>Customers</h3>
          <p className="placeholder-copy resources-hint">
            Assign a salesman to each customer so monthly Customer Inventory reports can be sent in Messages.
            {salesRepColumnMissing
              ? ' Run migration-customers-sales-rep.sql in Supabase to enable salesman assignment.'
              : null}
          </p>
          {customersLoading ? (
            <p className="placeholder-copy">Loading…</p>
          ) : (
            <>
              <ul className="admin-list-rows">
                {customers.map((c) => (
                  <li key={c.id} className="admin-list-row admin-list-row-customer">
                    {editingCustomerId === c.id ? (
                      <>
                        <input
                          className="admin-list-input"
                          value={customerDraft}
                          onChange={(e) => setCustomerDraft(e.target.value)}
                          aria-label="Edit customer name"
                        />
                        <button
                          type="button"
                          className="button-primary admin-list-btn"
                          disabled={savingCustomer}
                          onClick={() => saveCustomerEdit(c.id)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="button-secondary admin-list-btn"
                          onClick={() => setEditingCustomerId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="admin-list-value">{c.name}</span>
                        <label className="admin-customer-salesman">
                          <span className="admin-customer-salesman-label">Salesman</span>
                          <select
                            value={c.sales_rep_employee_id ?? ''}
                            disabled={salesRepColumnMissing || savingSalesRepId === c.id}
                            onChange={(e) => void saveCustomerSalesRep(c.id, e.target.value)}
                            aria-label={`Salesman for ${c.name}`}
                          >
                            <option value="">— Unassigned —</option>
                            {salesmanOptions.map((employee) => (
                              <option key={employee.id} value={employee.id}>
                                {employee.full_name}
                                {employee.auth_user_id ? '' : ' (no login)'}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="admin-list-actions">
                          <button
                            type="button"
                            className="button-secondary admin-list-btn"
                            onClick={() => {
                              setEditingCustomerId(c.id)
                              setCustomerDraft(c.name)
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="button-secondary admin-list-btn danger"
                            onClick={() => deleteCustomer(c.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <div className="admin-add-row">
                <span className="admin-add-label">Add customer</span>
                <div className="admin-add-controls">
                  <input
                    type="text"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="Customer name"
                    aria-label="New customer name"
                  />
                  <button type="button" className="button-primary" disabled={savingCustomer} onClick={addCustomer}>
                    Add
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'valveTypes' && (
        <section className="dashboard-panel admin-lists-panel">
          <h3>Valve Types</h3>
          <p className="placeholder-copy resources-hint">
            Add new valve types here. They appear in job dropdowns and procedure panels.
          </p>

          <div className="admin-add-row" style={{ marginBottom: '16px' }}>
            <span className="admin-add-label">New valve type</span>
            <div className="admin-add-controls">
              <input
                type="text"
                value={newValveType}
                onChange={(e) => setNewValveType(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void addValveType()}
                placeholder="e.g. Triple Offset Butterfly"
                disabled={addingValveType}
              />
              <button
                type="button"
                className="button-primary"
                disabled={addingValveType || valveTypesLoading}
                onClick={() => void addValveType()}
              >
                {addingValveType ? 'Adding…' : 'Add valve type'}
              </button>
            </div>
          </div>

          {valveTypesLoading ? (
            <p className="placeholder-copy">Loading…</p>
          ) : valveTypes.length === 0 ? (
            <p className="placeholder-copy">No valve types yet.</p>
          ) : (
            <ul className="admin-list">
              {valveTypes.map((t) => (
                <li key={t} className="admin-list-item">
                  <span className="admin-list-value">{t}</span>
                </li>
              ))}
            </ul>
          )}

          <ValveTypeProceduresPanel key={valveTypeReloadTick} variant="page" />
        </section>
      )}

      {tab === 'flangeThickness' && (
        <section className="dashboard-panel admin-lists-panel">
          <h3>ASME B16.5 Flange Thickness References</h3>
          <p className="placeholder-copy resources-hint">
            Stores minimum flange thickness by valve size and pressure class. ITP uses these values to flag too-thin
            flanges and calculate removable material.
          </p>

          <div className="admin-add-row">
            <span className="admin-add-label">Import workbook</span>
            <div className="admin-add-controls">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                disabled={uploadingFlangeWorkbook}
                onChange={(e) => {
                  void uploadFlangeWorkbook(e.target.files?.[0] ?? null)
                  e.currentTarget.value = ''
                }}
              />
            </div>
          </div>

          <div className="admin-add-row">
            <span className="admin-add-label">Add / update row</span>
            <div className="admin-add-controls flange-ref-add-controls">
              <input
                type="text"
                placeholder='Size (e.g. 4 or 4")'
                value={flangeDraft.nps}
                onChange={(e) => setFlangeDraft((d) => ({ ...d, nps: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Class (e.g. 150)"
                value={flangeDraft.pressureClass}
                onChange={(e) => setFlangeDraft((d) => ({ ...d, pressureClass: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Min thickness"
                value={flangeDraft.minThickness}
                onChange={(e) => setFlangeDraft((d) => ({ ...d, minThickness: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Notes (optional)"
                value={flangeDraft.notes}
                onChange={(e) => setFlangeDraft((d) => ({ ...d, notes: e.target.value }))}
              />
              <button type="button" className="button-primary" disabled={flangeRefSaving} onClick={() => void addFlangeRef()}>
                {flangeRefSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          {flangeRefsLoading ? (
            <p className="placeholder-copy">Loading…</p>
          ) : flangeRefs.length === 0 ? (
            <p className="placeholder-copy">No flange thickness references yet.</p>
          ) : (
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Size (NPS)</th>
                    <th>Pressure Class</th>
                    <th>Minimum Thickness</th>
                    <th>Notes</th>
                    <th>Source</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {flangeRefs.map((row) => (
                    <tr key={row.id}>
                      <td>{row.nps}</td>
                      <td>{row.pressure_class}</td>
                      <td>{row.min_thickness}</td>
                      <td className="table-cell-clamp">{row.notes ?? '-'}</td>
                      <td className="table-cell-clamp">{row.source ?? '-'}</td>
                      <td>
                        <button
                          type="button"
                          className="button-secondary admin-list-btn danger"
                          onClick={() => void deleteFlangeRef(row.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'b1610' && (
        <section className="dashboard-panel admin-lists-panel">
          <h3>ASME B16.10 Face-to-Face References</h3>
          <p className="placeholder-copy resources-hint">
            Stores standard face-to-face dimensions by valve type, size, class, and end connection (RF/RTJ). ITP uses
            these values to validate body end-to-end measurements.
          </p>

          <div className="admin-add-row">
            <span className="admin-add-label">Starter criteria</span>
            <div className="admin-add-controls">
              <button
                type="button"
                className="button-secondary"
                disabled={seedingB1610Defaults}
                onClick={() => void seedB1610Criteria()}
              >
                {seedingB1610Defaults ? 'Loading…' : 'Load starter B16.10 criteria'}
              </button>
            </div>
          </div>

          <div className="admin-add-row">
            <span className="admin-add-label">Import workbook</span>
            <div className="admin-add-controls">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                disabled={uploadingB1610Workbook}
                onChange={(e) => {
                  void uploadB1610Workbook(e.target.files?.[0] ?? null)
                  e.currentTarget.value = ''
                }}
              />
            </div>
          </div>

          <div className="admin-add-row">
            <span className="admin-add-label">Add / update row</span>
            <div className="admin-add-controls flange-ref-add-controls">
              <select
                value={b1610Draft.valveType}
                onChange={(e) => setB1610Draft((d) => ({ ...d, valveType: e.target.value }))}
              >
                {(['Gate', 'Globe', 'Check', 'Plug'] as const).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder='Size (e.g. 4 or 4")'
                value={b1610Draft.nps}
                onChange={(e) => setB1610Draft((d) => ({ ...d, nps: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Class (e.g. 150)"
                value={b1610Draft.pressureClass}
                onChange={(e) => setB1610Draft((d) => ({ ...d, pressureClass: e.target.value }))}
              />
              <select
                value={b1610Draft.endConnection}
                onChange={(e) => setB1610Draft((d) => ({ ...d, endConnection: e.target.value }))}
              >
                <option value="ANY">Any (generic)</option>
                <option value="RF">RF</option>
                <option value="RTJ">RTJ</option>
              </select>
              <input
                type="text"
                placeholder="Standard dimension"
                value={b1610Draft.standardDimension}
                onChange={(e) => setB1610Draft((d) => ({ ...d, standardDimension: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Tolerance (default 0.0625)"
                value={b1610Draft.tolerance}
                onChange={(e) => setB1610Draft((d) => ({ ...d, tolerance: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Notes (optional)"
                value={b1610Draft.notes}
                onChange={(e) => setB1610Draft((d) => ({ ...d, notes: e.target.value }))}
              />
              <button type="button" className="button-primary" disabled={b1610Saving} onClick={() => void addB1610Ref()}>
                {b1610Saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          {b1610Loading ? (
            <p className="placeholder-copy">Loading…</p>
          ) : b1610Refs.length === 0 ? (
            <p className="placeholder-copy">No B16.10 references yet.</p>
          ) : (
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Valve Type</th>
                    <th>Size (NPS)</th>
                    <th>Pressure Class</th>
                    <th>End Connection</th>
                    <th>Standard Dimension</th>
                    <th>Tolerance</th>
                    <th>Notes</th>
                    <th>Source</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {b1610Refs.map((row) => (
                    <tr key={row.id}>
                      <td>{row.valve_type}</td>
                      <td>{row.nps}</td>
                      <td>{row.pressure_class}</td>
                      <td>{row.end_connection === 'ANY' ? 'Any' : row.end_connection}</td>
                      <td>{row.standard_dimension}</td>
                      <td>{row.tolerance}</td>
                      <td className="table-cell-clamp">{row.notes ?? '-'}</td>
                      <td className="table-cell-clamp">{row.source ?? '-'}</td>
                      <td>
                        <button
                          type="button"
                          className="button-secondary admin-list-btn danger"
                          onClick={() => void deleteB1610Ref(row.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'b1634' && (
        <section className="dashboard-panel admin-lists-panel">
          <h3>ASME B16.34 Wall Thickness References</h3>
          <p className="placeholder-copy resources-hint">
            Stores minimum wall thickness by valve type, size, and class. ITP Wall Thickness uses these values for
            automatic minimum checks and removable-material calculations.
          </p>

          <div className="admin-add-row">
            <span className="admin-add-label">Starter criteria</span>
            <div className="admin-add-controls">
              <button
                type="button"
                className="button-secondary"
                disabled={seedingB1634Defaults || !B1634_DEFAULT_ROWS.length}
                onClick={() => void seedB1634Criteria()}
              >
                {seedingB1634Defaults
                  ? 'Loading…'
                  : B1634_DEFAULT_ROWS.length
                    ? 'Load starter B16.34 criteria'
                    : 'No bundled starter rows'}
              </button>
            </div>
          </div>

          <div className="admin-add-row">
            <span className="admin-add-label">Import workbook</span>
            <div className="admin-add-controls">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                disabled={uploadingB1634Workbook}
                onChange={(e) => {
                  void uploadB1634Workbook(e.target.files?.[0] ?? null)
                  e.currentTarget.value = ''
                }}
              />
            </div>
          </div>

          <div className="admin-add-row">
            <span className="admin-add-label">Add / update row</span>
            <div className="admin-add-controls flange-ref-add-controls">
              <select
                value={b1634Draft.valveType}
                onChange={(e) => setB1634Draft((d) => ({ ...d, valveType: e.target.value }))}
              >
                {(['Gate', 'Globe', 'Check', 'Plug'] as const).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder='Size (e.g. 4 or 4")'
                value={b1634Draft.nps}
                onChange={(e) => setB1634Draft((d) => ({ ...d, nps: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Class (e.g. 150)"
                value={b1634Draft.pressureClass}
                onChange={(e) => setB1634Draft((d) => ({ ...d, pressureClass: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Minimum wall thickness"
                value={b1634Draft.minWallThickness}
                onChange={(e) => setB1634Draft((d) => ({ ...d, minWallThickness: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Notes (optional)"
                value={b1634Draft.notes}
                onChange={(e) => setB1634Draft((d) => ({ ...d, notes: e.target.value }))}
              />
              <button type="button" className="button-primary" disabled={b1634Saving} onClick={() => void addB1634Ref()}>
                {b1634Saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          {b1634Loading ? (
            <p className="placeholder-copy">Loading…</p>
          ) : b1634Refs.length === 0 ? (
            <p className="placeholder-copy">No B16.34 references yet.</p>
          ) : (
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Valve Type</th>
                    <th>Size (NPS)</th>
                    <th>Pressure Class</th>
                    <th>Min Wall Thickness</th>
                    <th>Notes</th>
                    <th>Source</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {b1634Refs.map((row) => (
                    <tr key={row.id}>
                      <td>{row.valve_type}</td>
                      <td>{row.nps}</td>
                      <td>{row.pressure_class}</td>
                      <td>{row.min_wall_thickness}</td>
                      <td className="table-cell-clamp">{row.notes ?? '-'}</td>
                      <td className="table-cell-clamp">{row.source ?? '-'}</td>
                      <td>
                        <button
                          type="button"
                          className="button-secondary admin-list-btn danger"
                          onClick={() => void deleteB1634Ref(row.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </section>
  )
}
