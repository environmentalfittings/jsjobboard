import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmployeeTrainingPanel } from '../components/EmployeeTrainingPanel'
import { LookupAddSelect } from '../components/LookupAddSelect'
import { useToast } from '../components/ToastNotification'
import { WpsNumberGuide } from '../components/WpsNumberGuide'
import { useAuth } from '../contexts/AuthContext'
import { countEmployeeTrainings } from '../lib/employeeTraining'
import { loadCurrentUserQualityTeamLevel } from '../lib/qualityTeam'
import {
  deleteResourceDocument,
  resourceDocumentPublicUrl,
  type ResourceDocumentCategory,
  type ResourceDocumentRow,
  type BaseMetalCategory,
  type MtrKind,
  type WeldMode,
  type WeldProcess,
  type WpsType,
  resourceDocumentMatchesQuery,
  uploadResourceDocument,
  allocateMtrNumber,
  buildMtrColumnPayload,
  compareMtrDocuments,
  formatMtrDetails,
  nextMtrNumber,
  normalizeMtrNumber,
  validateMtrDetails,
  BASE_METAL_CATEGORIES,
  MTR_KINDS,
  mtrKindLabel,
  WELD_MODES,
  WELD_PROCESSES,
  WPS_TYPES,
} from '../lib/resourceDocuments'
import { canWriteShop, permissionDeniedReason } from '../lib/roles'
import { loadLookupOptionsMap, addLookupValue } from '../lib/lookupValues'
import type { LookupCategory } from '../constants/lookupCategories'
import {
  SPEC_DOCUMENTS_BUCKET,
  SPEC_DOC_TYPES,
  createSpecDocumentSignedUrl,
  loadManufacturerOptions,
  uploadReliefValveSpecBook,
  type ManufacturerOption,
} from '../lib/specDocuments'
import { supabase } from '../lib/supabase'
import type { SpecDocumentType } from '../types/manufacturerSpec'
import type { QualityTeamLevel } from '../types/employees'
import { weldProcedureMatchesQuery } from '../lib/wpsNumberGuide'



const RESOURCE_DOC_SELECT =
  'id,scope,valve_type,category,title,notes,storage_path,file_name,mime_type,created_at,updated_at,wps_type,base_metal_category,weld_processes,weld_modes,filler_metal,base_metal_thickness_qualified,filler_metal_thickness_qualified,post_weld_heat_treat_required,pwht_temperature,pwht_time,hf_approved,manufacturer,product_valve_type,sop_number,revision_number,date_updated,proc_category'
const RESOURCE_DOC_SELECT_MTR =
  'id,scope,valve_type,category,title,notes,storage_path,file_name,mime_type,created_at,updated_at,wps_type,base_metal_category,weld_processes,weld_modes,filler_metal,base_metal_thickness_qualified,filler_metal_thickness_qualified,post_weld_heat_treat_required,pwht_temperature,pwht_time,hf_approved,manufacturer,product_valve_type,sop_number,revision_number,date_updated,proc_category,mtr_kind,heat_lot,mtr_number,mtr_size,mtr_pressure,mtr_body_heat,mtr_bonnet_heat,mtr_material,mtr_length,mtr_od,mtr_inside_dia'
const RESOURCE_DOC_SELECT_MTR_LEGACY =
  'id,scope,valve_type,category,title,notes,storage_path,file_name,mime_type,created_at,updated_at,wps_type,base_metal_category,weld_processes,weld_modes,filler_metal,base_metal_thickness_qualified,filler_metal_thickness_qualified,post_weld_heat_treat_required,pwht_temperature,pwht_time,hf_approved,manufacturer,product_valve_type,sop_number,revision_number,date_updated,proc_category,mtr_kind,heat_lot,mtr_number'
const RESOURCE_DOC_SELECT_MTR_BARE =
  'id,scope,valve_type,category,title,notes,storage_path,file_name,mime_type,created_at,updated_at,wps_type,base_metal_category,weld_processes,weld_modes,filler_metal,base_metal_thickness_qualified,filler_metal_thickness_qualified,post_weld_heat_treat_required,pwht_temperature,pwht_time,hf_approved,manufacturer,product_valve_type,sop_number,revision_number,date_updated,proc_category,mtr_kind,heat_lot'
const PROCEDURE_COMPANION_SELECT =
  'id,scope,valve_type,category,title,notes,storage_path,file_name,mime_type,created_at,updated_at,sop_number,revision_number,date_updated,proc_category'
const PROC_STAT_CATEGORIES = ['Valve-Specific', 'NDE', 'Other', 'Test', 'Answer Key'] as const
type ProcStatFilter = 'all' | (typeof PROC_STAT_CATEGORIES)[number] | 'uncategorized'

function mtrSchemaOrDuplicateError(message: string, assignedNumber?: string): string | null {
  if (
    /uq_resource_documents_mtr_number/i.test(message) ||
    (/mtr_number/i.test(message) && /duplicate|unique/i.test(message))
  ) {
    return assignedNumber ? `${assignedNumber} is already used.` : 'That MTR number is already used.'
  }
  if (/mtr_number/i.test(message) && /schema cache|column|does not exist/i.test(message)) {
    return 'Run supabase/migration-resource-documents-mtr-numbers.sql in Supabase SQL Editor first.'
  }
  if (/mtr_size|mtr_pressure|mtr_body_heat|mtr_bonnet_heat|mtr_material|mtr_length|mtr_od|mtr_inside_dia/i.test(message)) {
    return 'Run supabase/migration-resource-documents-mtr-details.sql in Supabase SQL Editor first.'
  }
  if (/mtr_kind|heat_lot|resource_documents_category_check/i.test(message)) {
    return 'Run supabase/migration-resource-documents-mtrs.sql in Supabase SQL Editor first.'
  }
  return null
}

function optionsWithCurrent(options: readonly string[], current: string) {
  const trimmed = current.trim()
  if (!trimmed) return [...options]
  if (options.some((value) => value.toLowerCase() === trimmed.toLowerCase())) return [...options]
  return [trimmed, ...options]
}

export function ResourcesPage() {
  const { showToast } = useToast()
  const { role, user, username } = useAuth()
  const canWrite = canWriteShop(role)
  const [qualityTeamLevel, setQualityTeamLevel] = useState<QualityTeamLevel>('none')
  const canCatalogSpecs = qualityTeamLevel === 'admin' || qualityTeamLevel === 'manager'

  // ── Lookup lists for modal dropdowns ─────────────────────────────────────
  const [manufacturers, setManufacturers] = useState<string[]>([])
  const [manufacturerOptions, setManufacturerOptions] = useState<ManufacturerOption[]>([])
  const [valveTypeOptions, setValveTypeOptions] = useState<string[]>([])
  const [lookupOptions, setLookupOptions] = useState<Partial<Record<LookupCategory, string[]>>>({})

  useEffect(() => {
    void loadCurrentUserQualityTeamLevel({ userId: user?.id, username }).then(setQualityTeamLevel)
  }, [user?.id, username])

  useEffect(() => {
    void (async () => {
      const [map, catalogMfg] = await Promise.all([loadLookupOptionsMap(), loadManufacturerOptions()])
      setLookupOptions(map)
      setManufacturers(map.manufacturer ?? [])
      setValveTypeOptions(map.valve_type ?? [])
      if (catalogMfg.error) {
        showToast(`Could not load manufacturers: ${catalogMfg.error}`)
      } else {
        setManufacturerOptions(catalogMfg.options)
      }
    })()
  }, [showToast])

  const persistMtrLookup = useCallback(
    async (category: LookupCategory, raw: string, apply: (saved: string) => void) => {
      try {
        const saved = await addLookupValue(category, raw)
        setLookupOptions((prev) => ({
          ...prev,
          [category]: optionsWithCurrent(prev[category] ?? [], saved),
        }))
        if (category === 'manufacturer') {
          setManufacturers((prev) => optionsWithCurrent(prev, saved))
        }
        apply(saved)
        showToast(`Added “${saved}”`)
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Could not add that option')
        throw error
      }
    },
    [showToast],
  )

  // ── Weld procedures section ──────────────────────────────────────────────
  const [weldRows, setWeldRows] = useState<ResourceDocumentRow[]>([])
  const [weldLoading, setWeldLoading] = useState(false)
  const [weldWpsFilter, setWeldWpsFilter] = useState<WpsType | 'all'>('all')
  const [weldProcessFilter, setWeldProcessFilter] = useState<WeldProcess | 'all'>('all')
  const [weldCategoryFilter, setWeldCategoryFilter] = useState<BaseMetalCategory | 'all'>('all')
  const [weldTitleQuery, setWeldTitleQuery] = useState('')
  const [weldSuggestOpen, setWeldSuggestOpen] = useState(false)
  const weldSearchWrapRef = useRef<HTMLDivElement>(null)

  const loadWeldProcedures = async () => {
    setWeldLoading(true)
    const { data, error } = await supabase
      .from('resource_documents')
      .select(RESOURCE_DOC_SELECT)
      .eq('category', 'weld_procedure')
      .order('title', { ascending: true })
      .limit(400)
    setWeldLoading(false)
    if (error) {
      showToast(`Could not load weld procedures: ${error.message}`)
      return
    }
    setWeldRows((data ?? []) as ResourceDocumentRow[])
  }

  const visibleWeldRows = useMemo(() => {
    return weldRows.filter((r) => {
      const matchWps = weldWpsFilter === 'all' || r.wps_type === weldWpsFilter
      const matchProcess = weldProcessFilter === 'all' || (r.weld_processes ?? []).includes(weldProcessFilter)
      const matchCategory = weldCategoryFilter === 'all' || r.base_metal_category === weldCategoryFilter
      return matchWps && matchProcess && matchCategory && weldProcedureMatchesQuery(r, weldTitleQuery)
    })
  }, [weldRows, weldWpsFilter, weldProcessFilter, weldCategoryFilter, weldTitleQuery])

  const weldTitleSuggestions = useMemo(() => {
    const q = weldTitleQuery.trim().toLowerCase()
    if (q.length < 1) return []
    return weldRows.filter((row) => weldProcedureMatchesQuery(row, weldTitleQuery)).slice(0, 10)
  }, [weldRows, weldTitleQuery])

  const fillerClassificationOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const value of [...(lookupOptions.filler_classification ?? []), ...weldRows.map((row) => row.filler_metal ?? '')]) {
      const trimmed = value.trim()
      if (!trimmed) continue
      const key = trimmed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(trimmed)
    }
    return out
  }, [lookupOptions.filler_classification, weldRows])

  useEffect(() => {
    if (!weldSuggestOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (weldSearchWrapRef.current?.contains(target)) return
      setWeldSuggestOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [weldSuggestOpen])

  useEffect(() => {
    void loadWeldProcedures()
  }, [])

  // ── Simple document modules (IOMs, Procedures, QA/QC) ────────────────────
  const SIMPLE_SECTIONS = [
    {
      key: 'iom',
      title: 'IOMs',
      description: 'Instruction, Operation & Maintenance manuals.',
      categories: ['iom', 'maintenance_manual'] as ResourceDocumentCategory[],
      addLabel: '+ Add IOM',
    },
    {
      key: 'procedures',
      title: 'Procedures',
      description: 'General and process procedures.',
      categories: ['general'] as ResourceDocumentCategory[],
      addLabel: '+ Add procedure',
    },
    {
      key: 'qaqc',
      title: 'QA/QC Documents',
      description: 'Quality assurance and quality control documents.',
      categories: ['quality_control'] as ResourceDocumentCategory[],
      addLabel: '+ Add QA/QC document',
    },
    {
      key: 'employee_training',
      title: 'Employee Training',
      description: 'Training materials, certifications, and employee learning documents.',
      categories: ['employee_training'] as ResourceDocumentCategory[],
      addLabel: '+ Add training document',
    },
    {
      key: 'mtrs',
      title: 'MTRs',
      description: 'Mill test reports for valves, filler metals, and material.',
      categories: ['mtr'] as ResourceDocumentCategory[],
      addLabel: '+ Add MTR',
    },
    {
      key: 'relief_valve_spec_books',
      title: 'Relief Valve Spec Books',
      description: 'Manufacturer relief valve specification books and reference data.',
      categories: ['relief_valve_spec_book'] as ResourceDocumentCategory[],
      addLabel: '+ Add spec book',
    },
  ] as const

  type SectionKey = (typeof SIMPLE_SECTIONS)[number]['key']

  const [sectionDocs, setSectionDocs] = useState<Record<string, ResourceDocumentRow[]>>({})
  const [sectionLoading, setSectionLoading] = useState<Record<string, boolean>>({})
  const [trainingCount, setTrainingCount] = useState(0)

  const refreshTrainingCount = useCallback(async () => {
    setTrainingCount(await countEmployeeTrainings())
  }, [])

  const loadSection = async (key: string, categories: readonly ResourceDocumentCategory[]) => {
    setSectionLoading((prev) => ({ ...prev, [key]: true }))
    let result =
      key === 'mtrs'
        ? await supabase
            .from('resource_documents')
            .select(RESOURCE_DOC_SELECT_MTR)
            .in('category', [...categories])
            .order('title', { ascending: true })
            .limit(2000)
        : await supabase
            .from('resource_documents')
            .select(RESOURCE_DOC_SELECT)
            .in('category', [...categories])
            .order('title', { ascending: true })
            .limit(400)
    if (
      key === 'mtrs' &&
      result.error &&
      /mtr_size|mtr_pressure|mtr_body_heat|mtr_bonnet_heat|mtr_material|mtr_length|mtr_od|mtr_inside_dia/i.test(result.error.message) &&
      /schema cache|column|does not exist/i.test(result.error.message)
    ) {
      showToast('Run supabase/migration-resource-documents-mtr-details.sql in Supabase SQL Editor first.')
      result = await supabase
        .from('resource_documents')
        .select(RESOURCE_DOC_SELECT_MTR_LEGACY)
        .in('category', [...categories])
        .order('title', { ascending: true })
        .limit(2000)
    }
    if (
      key === 'mtrs' &&
      result.error &&
      /mtr_number/i.test(result.error.message) &&
      /schema cache|column|does not exist/i.test(result.error.message)
    ) {
      showToast('Run supabase/migration-resource-documents-mtr-numbers.sql in Supabase SQL Editor first.')
      result = await supabase
        .from('resource_documents')
        .select(RESOURCE_DOC_SELECT_MTR_BARE)
        .in('category', [...categories])
        .order('title', { ascending: true })
        .limit(2000)
    }
    const { data, error } = result
    setSectionLoading((prev) => ({ ...prev, [key]: false }))
    if (error) {
      if (key === 'mtrs' && /mtr_kind|heat_lot|schema cache|column/i.test(error.message)) {
        showToast('Run supabase/migration-resource-documents-mtrs.sql in Supabase SQL Editor first.')
        setSectionDocs((prev) => ({ ...prev, [key]: [] }))
        return
      }
      showToast(`Could not load documents: ${error.message}`)
      return
    }
    const rows = ((data ?? []) as unknown as ResourceDocumentRow[]).map((row) => ({
      ...row,
      mtr_number: row.mtr_number ?? null,
      mtr_size: row.mtr_size ?? null,
      mtr_pressure: row.mtr_pressure ?? null,
      mtr_body_heat: row.mtr_body_heat ?? null,
      mtr_bonnet_heat: row.mtr_bonnet_heat ?? null,
      mtr_material: row.mtr_material ?? null,
      mtr_length: row.mtr_length ?? null,
      mtr_od: row.mtr_od ?? null,
      mtr_inside_dia: row.mtr_inside_dia ?? null,
    }))
    if (key === 'mtrs') rows.sort(compareMtrDocuments)
    setSectionDocs((prev) => ({ ...prev, [key]: rows }))
  }

  const loadAllSections = () => {
    SIMPLE_SECTIONS.forEach((s) => void loadSection(s.key, s.categories))
  }

  const sectionKeyForCategory = (cat: ResourceDocumentCategory): SectionKey | null => {
    const found = SIMPLE_SECTIONS.find((s) =>
      (s.categories as readonly string[]).includes(cat)
    )
    return (found?.key ?? null) as SectionKey | null
  }

  useEffect(() => {
    loadAllSections()
    void refreshTrainingCount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Upload modal (shared, but mode-aware) ────────────────────────────────
  type ModalMode = 'general' | 'weld'
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('general')
  const [editingDoc, setEditingDoc] = useState<ResourceDocumentRow | null>(null)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadNotes, setUploadNotes] = useState('')
  const [uploadCategory, setUploadCategory] = useState<ResourceDocumentCategory>('general')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Weld-specific fields
  const [manufacturer, setManufacturer] = useState('')
  const [productValveType, setProductValveType] = useState('')
  const [wpsType, setWpsType] = useState<WpsType | ''>('')
  const [baseMetalCategory, setBaseMetalCategory] = useState<BaseMetalCategory | ''>('')
  const [weldProcesses, setWeldProcesses] = useState<WeldProcess[]>([])
  const [weldModes, setWeldModes] = useState<WeldMode[]>([])
  const [fillerMetal, setFillerMetal] = useState('')
  const [baseMetalThicknessQualified, setBaseMetalThicknessQualified] = useState('')
  const [fillerMetalThicknessQualified, setFillerMetalThicknessQualified] = useState('')
  const [postWeldHeatTreatRequired, setPostWeldHeatTreatRequired] = useState(false)
  const [pwhtTemperature, setPwhtTemperature] = useState('')
  const [pwhtTime, setPwhtTime] = useState('')
  const [hfApproved, setHfApproved] = useState(false)
  // Procedure-specific fields
  const [sopNumber, setSopNumber] = useState('')
  const [revisionNumber, setRevisionNumber] = useState('')
  const [dateUpdated, setDateUpdated] = useState('')
  const [procCategory, setProcCategory] = useState<'Valve-Specific' | 'NDE' | 'Other' | 'Test' | 'Answer Key' | ''>('')
  const [mtrKind, setMtrKind] = useState<MtrKind | ''>('')
  const [heatLot, setHeatLot] = useState('')
  const [mtrNumber, setMtrNumber] = useState('')
  const [mtrSize, setMtrSize] = useState('')
  const [mtrPressure, setMtrPressure] = useState('')
  const [mtrBodyHeat, setMtrBodyHeat] = useState('')
  const [mtrBonnetHeat, setMtrBonnetHeat] = useState('')
  const [mtrMaterial, setMtrMaterial] = useState('')
  const [mtrLength, setMtrLength] = useState('')
  const [mtrOd, setMtrOd] = useState('')
  const [mtrInsideDia, setMtrInsideDia] = useState('')
  // Relief Valve Spec Books catalog fields
  const [manufacturerId, setManufacturerId] = useState('')
  const [specDocType, setSpecDocType] = useState<SpecDocumentType | ''>('')
  const [editionLabel, setEditionLabel] = useState('')
  const [revisionLabel, setRevisionLabel] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [pageCount, setPageCount] = useState('')

  const toggleWeldProcess = (p: WeldProcess) =>
    setWeldProcesses((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))

  const resolveManufacturerIdFromName = useCallback(
    (name: string | null | undefined) => {
      const wanted = (name ?? '').trim().toLowerCase()
      if (!wanted) return ''
      const exact = manufacturerOptions.find((m) => m.name.toLowerCase() === wanted)
      if (exact) return exact.id
      const byAlias = manufacturerOptions.find(
        (m) =>
          m.aliases.some((a) => a.toLowerCase() === wanted) ||
          m.label.toLowerCase().includes(wanted),
      )
      return byAlias?.id ?? ''
    },
    [manufacturerOptions],
  )

  const openSpecBookFile = useCallback(
    async (row: ResourceDocumentRow) => {
      if (row.category === 'relief_valve_spec_book') {
        const { url, error } = await createSpecDocumentSignedUrl(row.storage_path)
        if (error || !url) {
          showToast(error || 'Could not open file')
          return
        }
        window.open(url, '_blank', 'noopener,noreferrer')
        return
      }
      window.open(resourceDocumentPublicUrl(row.storage_path), '_blank', 'noopener,noreferrer')
    },
    [showToast],
  )

  const uploadModalHasUnsavedChanges = useCallback((): boolean => {
    if (uploadFile) return true

    const trimmed = (value: string) => value.trim()
    const norm = (value: string | null | undefined) => trimmed(value ?? '')
    const sortedKey = <T extends string>(items: T[]) => [...items].sort().join('\0')

    if (editingDoc) {
      if (trimmed(uploadTitle) !== editingDoc.title) return true
      if (norm(uploadNotes) !== norm(editingDoc.notes)) return true
      if (norm(manufacturer) !== norm(editingDoc.manufacturer)) return true
      if (norm(productValveType) !== norm(editingDoc.product_valve_type)) return true
      if ((wpsType || '') !== (editingDoc.wps_type ?? '')) return true
      if ((baseMetalCategory || '') !== (editingDoc.base_metal_category ?? '')) return true
      if (sortedKey(weldProcesses) !== sortedKey((editingDoc.weld_processes ?? []) as WeldProcess[])) return true
      if (sortedKey(weldModes) !== sortedKey((editingDoc.weld_modes ?? []) as WeldMode[])) return true
      if (norm(fillerMetal) !== norm(editingDoc.filler_metal)) return true
      if (norm(baseMetalThicknessQualified) !== norm(editingDoc.base_metal_thickness_qualified)) return true
      if (norm(fillerMetalThicknessQualified) !== norm(editingDoc.filler_metal_thickness_qualified)) return true
      if (postWeldHeatTreatRequired !== (editingDoc.post_weld_heat_treat_required ?? false)) return true
      if (norm(pwhtTemperature) !== norm(editingDoc.pwht_temperature)) return true
      if (norm(pwhtTime) !== norm(editingDoc.pwht_time)) return true
      if (hfApproved !== (editingDoc.hf_approved ?? false)) return true
      if (norm(sopNumber) !== norm(editingDoc.sop_number)) return true
      if (norm(revisionNumber) !== norm(editingDoc.revision_number)) return true
      if ((dateUpdated || '') !== (editingDoc.date_updated ?? '')) return true
      if ((procCategory || '') !== (editingDoc.proc_category ?? '')) return true
      if ((mtrKind || '') !== (editingDoc.mtr_kind ?? '')) return true
      if (norm(heatLot) !== norm(editingDoc.heat_lot)) return true
      if (norm(mtrNumber) !== norm(editingDoc.mtr_number)) return true
      if (norm(mtrSize) !== norm(editingDoc.mtr_size)) return true
      if (norm(mtrPressure) !== norm(editingDoc.mtr_pressure)) return true
      if (norm(mtrBodyHeat) !== norm(editingDoc.mtr_body_heat || editingDoc.heat_lot)) return true
      if (norm(mtrBonnetHeat) !== norm(editingDoc.mtr_bonnet_heat)) return true
      if (norm(mtrMaterial) !== norm(editingDoc.mtr_material || (editingDoc.mtr_kind === 'material' ? editingDoc.filler_metal : ''))) return true
      if (norm(mtrLength) !== norm(editingDoc.mtr_length)) return true
      if (norm(mtrOd) !== norm(editingDoc.mtr_od)) return true
      if (norm(mtrInsideDia) !== norm(editingDoc.mtr_inside_dia)) return true
      if (editingDoc.category === 'relief_valve_spec_book') {
        if (manufacturerId !== resolveManufacturerIdFromName(editingDoc.manufacturer)) return true
        if (specDocType || editionLabel.trim() || revisionLabel.trim() || effectiveDate || pageCount.trim()) {
          return true
        }
      }
      return false
    }

    if (trimmed(uploadTitle)) return true
    if (trimmed(uploadNotes)) return true
    if (trimmed(sopNumber) || trimmed(revisionNumber) || dateUpdated || procCategory) return true
    if (mtrKind || trimmed(heatLot) || trimmed(mtrNumber) || trimmed(fillerMetal)) return true
    if (trimmed(mtrSize) || trimmed(mtrPressure) || trimmed(mtrBodyHeat) || trimmed(mtrBonnetHeat)) return true
    if (trimmed(mtrMaterial) || trimmed(mtrLength) || trimmed(mtrOd) || trimmed(mtrInsideDia)) return true
    if (manufacturer || manufacturerId || productValveType) return true
    if (specDocType || editionLabel.trim() || revisionLabel.trim() || effectiveDate || pageCount.trim()) return true
    if (wpsType || baseMetalCategory) return true
    if (weldProcesses.length > 0 || weldModes.length > 0) return true
    if (trimmed(fillerMetal) || trimmed(baseMetalThicknessQualified) || trimmed(fillerMetalThicknessQualified)) {
      return true
    }
    if (postWeldHeatTreatRequired || hfApproved) return true
    if (trimmed(pwhtTemperature) || trimmed(pwhtTime)) return true
    return false
  }, [
    uploadFile,
    editingDoc,
    uploadTitle,
    uploadNotes,
    manufacturer,
    manufacturerId,
    productValveType,
    wpsType,
    baseMetalCategory,
    weldProcesses,
    weldModes,
    fillerMetal,
    baseMetalThicknessQualified,
    fillerMetalThicknessQualified,
    postWeldHeatTreatRequired,
    pwhtTemperature,
    pwhtTime,
    hfApproved,
    sopNumber,
    revisionNumber,
    dateUpdated,
    procCategory,
    mtrKind,
    heatLot,
    mtrNumber,
    mtrSize,
    mtrPressure,
    mtrBodyHeat,
    mtrBonnetHeat,
    mtrMaterial,
    mtrLength,
    mtrOd,
    mtrInsideDia,
    specDocType,
    editionLabel,
    revisionLabel,
    effectiveDate,
    pageCount,
    resolveManufacturerIdFromName,
  ])

  const resetModalState = () => {
    setEditingDoc(null)
    setUploadTitle('')
    setUploadNotes('')
    setUploadFile(null)
    setDragOver(false)
    setManufacturer('')
    setManufacturerId('')
    setProductValveType('')
    setWpsType('')
    setBaseMetalCategory('')
    setWeldProcesses([])
    setWeldModes([])
    setFillerMetal('')
    setBaseMetalThicknessQualified('')
    setFillerMetalThicknessQualified('')
    setPostWeldHeatTreatRequired(false)
    setPwhtTemperature('')
    setPwhtTime('')
    setHfApproved(false)
    setSopNumber('')
    setRevisionNumber('')
    setDateUpdated('')
    setProcCategory('')
    setMtrKind('')
    setHeatLot('')
    setMtrNumber('')
    setMtrSize('')
    setMtrPressure('')
    setMtrBodyHeat('')
    setMtrBonnetHeat('')
    setMtrMaterial('')
    setMtrLength('')
    setMtrOd('')
    setMtrInsideDia('')
    setSpecDocType('')
    setEditionLabel('')
    setRevisionLabel('')
    setEffectiveDate('')
    setPageCount('')
  }

  const openEditModal = (row: ResourceDocumentRow) => {
    if (row.category === 'relief_valve_spec_book' && !canCatalogSpecs) {
      showToast('Only Quality Admin or Manager can edit spec books.')
      return
    }
    setEditingDoc(row)
    setModalMode(row.category === 'weld_procedure' ? 'weld' : 'general')
    setUploadCategory(row.category)
    setUploadTitle(row.title)
    setUploadNotes(row.notes ?? '')
    setUploadFile(null)
    setDragOver(false)
    setManufacturer(row.manufacturer ?? '')
    setManufacturerId(resolveManufacturerIdFromName(row.manufacturer))
    setProductValveType(row.product_valve_type ?? '')
    setWpsType(row.wps_type ?? '')
    setBaseMetalCategory(row.base_metal_category ?? '')
    setWeldProcesses((row.weld_processes ?? []) as WeldProcess[])
    setWeldModes((row.weld_modes ?? []) as WeldMode[])
    setFillerMetal(row.mtr_kind === 'filler_metal' || row.category === 'weld_procedure' ? (row.filler_metal ?? '') : '')
    setBaseMetalThicknessQualified(row.base_metal_thickness_qualified ?? '')
    setFillerMetalThicknessQualified(row.filler_metal_thickness_qualified ?? '')
    setPostWeldHeatTreatRequired(row.post_weld_heat_treat_required ?? false)
    setPwhtTemperature(row.pwht_temperature ?? '')
    setPwhtTime(row.pwht_time ?? '')
    setHfApproved(row.hf_approved ?? false)
    setSopNumber(row.sop_number ?? '')
    setRevisionNumber(row.revision_number ?? '')
    setDateUpdated(row.date_updated ?? '')
    setProcCategory((row.proc_category as 'Valve-Specific' | 'NDE' | 'Other' | 'Test' | 'Answer Key' | '') ?? '')
    setMtrKind(row.mtr_kind ?? '')
    setHeatLot(row.heat_lot ?? '')
    setMtrNumber(row.mtr_number ?? '')
    setMtrSize(row.mtr_size ?? '')
    setMtrPressure(row.mtr_pressure ?? '')
    setMtrBodyHeat(row.mtr_body_heat || row.heat_lot || '')
    setMtrBonnetHeat(row.mtr_bonnet_heat ?? '')
    setMtrMaterial(row.mtr_material || (row.mtr_kind === 'material' ? row.filler_metal : '') || '')
    setMtrLength(row.mtr_length ?? '')
    setMtrOd(row.mtr_od ?? '')
    setMtrInsideDia(row.mtr_inside_dia ?? '')
    setSpecDocType('')
    setEditionLabel('')
    setRevisionLabel('')
    setEffectiveDate('')
    setPageCount('')
    setUploadModalOpen(true)
  }

  const openWeldUploadModal = () => {
    if (!canWrite) {
      showToast(permissionDeniedReason('shopWrite'))
      return
    }
    resetModalState()
    setModalMode('weld')
    setUploadCategory('weld_procedure')
    setUploadModalOpen(true)
  }

  const openSimpleUploadModal = (category: ResourceDocumentCategory, options?: { mtrKind?: MtrKind }) => {
    if (category === 'relief_valve_spec_book') {
      if (!canCatalogSpecs) {
        showToast('Only Quality Admin or Manager can add spec books.')
        return
      }
    } else if (!canWrite) {
      showToast(permissionDeniedReason('shopWrite'))
      return
    }
    resetModalState()
    setModalMode('general')
    setUploadCategory(category)
    if (options?.mtrKind) setMtrKind(options.mtrKind)
    setUploadModalOpen(true)
  }

  const closeUploadModal = useCallback(() => {
    if (uploading) return
    if (uploadModalHasUnsavedChanges()) {
      if (!window.confirm('You have unsaved changes. Discard them and close?')) return
    }
    setUploadModalOpen(false)
    resetModalState()
  }, [uploading, uploadModalHasUnsavedChanges])

  useEffect(() => {
    if (!uploadModalOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeUploadModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [uploadModalOpen, closeUploadModal])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) setUploadFile(file)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback(() => setDragOver(false), [])

  const handleUpload = async () => {
    const isSpecBook =
      uploadCategory === 'relief_valve_spec_book' || editingDoc?.category === 'relief_valve_spec_book'

    if (isSpecBook) {
      if (!canCatalogSpecs) {
        showToast('Only Quality Admin or Manager can manage spec books.')
        return
      }
    } else if (!canWrite) {
      showToast(permissionDeniedReason('shopWrite'))
      return
    }
    if (!uploadTitle.trim()) { showToast('Enter a document title'); return }
    const isMtrUpload = uploadCategory === 'mtr' || editingDoc?.category === 'mtr'
    const mtrFields = {
      size: mtrSize,
      pressure: mtrPressure,
      bodyHeat: mtrBodyHeat,
      bonnetHeat: mtrBonnetHeat,
      material: mtrMaterial,
      length: mtrLength,
      od: mtrOd,
      insideDia: mtrInsideDia,
      fillerClassification: fillerMetal,
      valveType: productValveType,
    }
    if (isMtrUpload) {
      const mtrError = validateMtrDetails(mtrKind, mtrFields)
      if (mtrError) {
        showToast(mtrError)
        return
      }
    }

    setUploading(true)

    // ── Edit mode: update existing row (file replacement is optional) ─────────
    if (editingDoc) {
      let resolvedMtrNumber = editingDoc.mtr_number ?? null
      if (editingDoc.category === 'mtr') {
        if (mtrNumber.trim()) {
          const allocated = await allocateMtrNumber(mtrNumber, { excludeId: editingDoc.id })
          if (allocated.error) {
            setUploading(false)
            showToast(allocated.error)
            return
          }
          resolvedMtrNumber = allocated.number
        }
      }
      // If a new file was chosen, upload it first and swap the storage path
      let newStoragePath: string | undefined
      let newFileName: string | undefined
      let newMimeType: string | undefined

      if (uploadFile) {
        const isRelief = editingDoc.category === 'relief_valve_spec_book'
        const bucket = isRelief ? SPEC_DOCUMENTS_BUCKET : 'valve-attachments'
        const { error: upErr, path } = await (async () => {
          const ext = uploadFile.name.lastIndexOf('.') >= 0
            ? uploadFile.name.slice(uploadFile.name.lastIndexOf('.')).toLowerCase()
            : ''
          const folder = isRelief ? 'spec-books/replaced' : 'resources/general'
          const p = `${folder}/${crypto.randomUUID()}${ext}`
          const { error } = await supabase.storage
            .from(bucket)
            .upload(p, uploadFile, { contentType: uploadFile.type || undefined, upsert: false })
          return { error, path: p }
        })()
        if (upErr) { setUploading(false); showToast(upErr.message || 'File upload failed'); return }
        await supabase.storage.from(bucket).remove([editingDoc.storage_path])
        newStoragePath = path
        newFileName = uploadFile.name.slice(0, 500)
        newMimeType = uploadFile.type || undefined
      }

      const selectedMfg = manufacturerOptions.find((m) => m.id === manufacturerId)
      const patch: Record<string, unknown> = {
        title: uploadTitle.trim(),
        notes: uploadNotes,
        manufacturer:
          editingDoc.category === 'relief_valve_spec_book'
            ? (selectedMfg?.name ?? manufacturer) || null
            : manufacturer || null,
        product_valve_type: productValveType || null,
        wps_type: wpsType || null,
        base_metal_category: baseMetalCategory || null,
        weld_processes: weldProcesses,
        weld_modes: weldModes,
        filler_metal: fillerMetal.trim() || null,
        base_metal_thickness_qualified: baseMetalThicknessQualified.trim() || null,
        filler_metal_thickness_qualified: fillerMetalThicknessQualified.trim() || null,
        post_weld_heat_treat_required: postWeldHeatTreatRequired,
        pwht_temperature: postWeldHeatTreatRequired ? (pwhtTemperature.trim() || null) : null,
        pwht_time: postWeldHeatTreatRequired ? (pwhtTime.trim() || null) : null,
        hf_approved: hfApproved,
        sop_number: sopNumber.trim() || null,
        revision_number: revisionNumber.trim() || null,
        date_updated: dateUpdated || null,
        proc_category: procCategory || null,
        mtr_kind: editingDoc.category === 'mtr' ? mtrKind || null : editingDoc.mtr_kind ?? null,
        heat_lot: editingDoc.category === 'mtr' ? (heatLot.trim() || null) : editingDoc.heat_lot ?? null,
        mtr_number: editingDoc.category === 'mtr' ? resolvedMtrNumber : editingDoc.mtr_number ?? null,
        ...(editingDoc.category === 'mtr' ? buildMtrColumnPayload(mtrKind, mtrFields) : {}),
      }
      if (newStoragePath) {
        patch.storage_path = newStoragePath
        patch.file_name = newFileName
        patch.mime_type = newMimeType ?? null
      }

      const { error: patchErr } = await supabase
        .from('resource_documents')
        .update(patch)
        .eq('id', editingDoc.id)

      if (patchErr) {
        setUploading(false)
        const isdup = patchErr.code === '23505' || /duplicate|unique/i.test(patchErr.message)
        showToast(
          mtrSchemaOrDuplicateError(patchErr.message, resolvedMtrNumber ?? undefined) ??
            (isdup
              ? `A document named "${uploadTitle.trim()}" already exists in this section.`
              : patchErr.message || 'Could not save changes'),
        )
        return
      }

      // Optional promote / update catalog metadata when editing a spec book with doc_type set
      if (editingDoc.category === 'relief_valve_spec_book' && specDocType && manufacturerId) {
        const pageCountNum = pageCount.trim() ? Number.parseInt(pageCount, 10) : null
        const { data: existingSpec } = await supabase
          .from('spec_documents')
          .select('id')
          .eq('resource_document_id', editingDoc.id)
          .maybeSingle()

        if (existingSpec?.id) {
          await supabase
            .from('spec_documents')
            .update({
              manufacturer_id: manufacturerId,
              title: uploadTitle.trim(),
              doc_type: specDocType,
              edition_label: editionLabel.trim() || null,
              revision_label: revisionLabel.trim() || null,
              effective_date: effectiveDate || null,
              page_count:
                pageCountNum != null && Number.isFinite(pageCountNum) && pageCountNum > 0
                  ? pageCountNum
                  : null,
            })
            .eq('id', existingSpec.id)
        } else {
          await supabase.from('spec_documents').insert({
            manufacturer_id: manufacturerId,
            resource_document_id: editingDoc.id,
            title: uploadTitle.trim(),
            doc_type: specDocType,
            edition_label: editionLabel.trim() || null,
            revision_label: revisionLabel.trim() || null,
            effective_date: effectiveDate || null,
            page_count:
              pageCountNum != null && Number.isFinite(pageCountNum) && pageCountNum > 0
                ? pageCountNum
                : null,
            status: 'active',
          })
        }
      }

      setUploading(false)
      setUploadModalOpen(false)
      resetModalState()
      showToast('Document updated')
      if (editingDoc.category === 'weld_procedure') {
        void loadWeldProcedures()
      } else {
        const key = sectionKeyForCategory(editingDoc.category)
        const section = SIMPLE_SECTIONS.find((s) => s.key === key)
        if (section) void loadSection(section.key, section.categories)
      }
      return
    }

    // ── Create mode ───────────────────────────────────────────────────────────
    if (!uploadFile) { setUploading(false); showToast('Choose a file to upload'); return }

    if (uploadCategory === 'relief_valve_spec_book') {
      if (!manufacturerId) {
        setUploading(false)
        showToast('Select a manufacturer')
        return
      }
      const selectedMfg = manufacturerOptions.find((m) => m.id === manufacturerId)
      if (!selectedMfg) {
        setUploading(false)
        showToast('Select a valid manufacturer')
        return
      }
      const pageCountNum = pageCount.trim() ? Number.parseInt(pageCount, 10) : null
      const { error } = await uploadReliefValveSpecBook({
        file: uploadFile,
        title: uploadTitle,
        notes: uploadNotes,
        manufacturerId,
        manufacturerName: selectedMfg.name,
        productValveType: productValveType || null,
        docType: specDocType,
        editionLabel,
        revisionLabel,
        effectiveDate: effectiveDate || null,
        pageCount: pageCountNum,
      })
      setUploading(false)
      if (error) { showToast(error); return }
      setUploadModalOpen(false)
      resetModalState()
      showToast(specDocType ? 'Spec book uploaded and catalogued' : 'Spec book uploaded to library')
      void loadSection('relief_valve_spec_books', ['relief_valve_spec_book'])
      return
    }

    let resolvedMtrNumber: string | null = null
    if (uploadCategory === 'mtr') {
      const allocated = await allocateMtrNumber(mtrNumber)
      if (allocated.error) {
        setUploading(false)
        showToast(allocated.error)
        return
      }
      resolvedMtrNumber = allocated.number
    }

    const { error } = await uploadResourceDocument({
      file: uploadFile,
      scope: 'general',
      valveType: null,
      category: uploadCategory,
      title: uploadTitle,
      notes: uploadNotes,
      manufacturer: manufacturer || null,
      productValveType: productValveType || null,
      wpsType: wpsType || null,
      baseMetalCategory: baseMetalCategory || null,
      weldProcesses,
      weldModes,
      fillerMetal,
      baseMetalThicknessQualified,
      fillerMetalThicknessQualified,
      postWeldHeatTreatRequired,
      pwhtTemperature,
      pwhtTime,
      hfApproved,
      sopNumber: sopNumber.trim() || undefined,
      revisionNumber: revisionNumber.trim() || undefined,
      dateUpdated: dateUpdated || null,
      procCategory: procCategory || null,
      mtrKind: mtrKind || null,
      heatLot: heatLot.trim() || null,
      mtrNumber: resolvedMtrNumber,
      mtrDetails: mtrFields,
    })
    setUploading(false)
    if (error) { showToast(error); return }
    setUploadModalOpen(false)
    resetModalState()
    showToast(resolvedMtrNumber ? `Document uploaded as ${resolvedMtrNumber}` : 'Document uploaded')
    if (modalMode === 'weld') {
      void loadWeldProcedures()
    } else {
      const key = sectionKeyForCategory(uploadCategory)
      const section = SIMPLE_SECTIONS.find((s) => s.key === key)
      if (section) void loadSection(section.key, section.categories)
      if (procedureDialogDoc && sopNumber.trim() && sopNumber.trim() === (procedureDialogDoc.sop_number ?? '').trim()) {
        void openProcedureDialog(procedureDialogDoc)
      }
    }
  }

  const removeDocument = async (row: ResourceDocumentRow) => {
    if (row.category === 'relief_valve_spec_book' && !canCatalogSpecs) {
      showToast('Only Quality Admin or Manager can delete spec books.')
      return
    }
    if (!window.confirm(`Delete "${row.title}"?`)) return
    const { error } = await deleteResourceDocument({
      id: row.id,
      storage_path: row.storage_path,
      storage_bucket: row.category === 'relief_valve_spec_book' ? SPEC_DOCUMENTS_BUCKET : undefined,
    })
    if (error) { showToast(error); return }
    showToast('Document deleted')
    if (row.category === 'weld_procedure') {
      void loadWeldProcedures()
    } else {
      const key = sectionKeyForCategory(row.category)
      const section = SIMPLE_SECTIONS.find((s) => s.key === key)
      if (section) void loadSection(section.key, section.categories)
    }
  }

  const sectionLabelForCategory = (cat: ResourceDocumentCategory) => {
    const found = SIMPLE_SECTIONS.find((s) =>
      (s.categories as readonly string[]).includes(cat)
    )
    return found?.title ?? 'Document'
  }
  const modalTitle = editingDoc
    ? (modalMode === 'weld' ? 'Edit weld procedure' : `Edit ${sectionLabelForCategory(editingDoc.category)}`)
    : (modalMode === 'weld' ? 'Add weld procedure' : `Add ${sectionLabelForCategory(uploadCategory)}`)

  const procCategoryAdjacencyRank: Record<string, number> = {
    Test: 1,
    'Answer Key': 2,
  }

  const compareProcedureDocs = (a: ResourceDocumentRow, b: ResourceDocumentRow) => {
    const aSop = (a.sop_number ?? '').trim()
    const bSop = (b.sop_number ?? '').trim()
    if (aSop && bSop) {
      const sopCmp = aSop.localeCompare(bSop, undefined, { numeric: true, sensitivity: 'base' })
      if (sopCmp !== 0) return sopCmp
    } else if (aSop && !bSop) {
      return -1
    } else if (!aSop && bSop) {
      return 1
    }

    const aRank = procCategoryAdjacencyRank[a.proc_category ?? ''] ?? 0
    const bRank = procCategoryAdjacencyRank[b.proc_category ?? ''] ?? 0
    if (aRank !== bRank) return aRank - bRank

    const aDate = a.date_updated ?? ''
    const bDate = b.date_updated ?? ''
    if (aDate !== bDate) return bDate.localeCompare(aDate)

    return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
  }

  // ── Active module drill-down ────────────────────────────────────────────
  type ActiveModule = 'weld' | SectionKey
  const [activeModule, setActiveModule] = useState<ActiveModule | null>(null)

  const MODULE_CARDS = [
    {
      key: 'weld' as const,
      title: 'Weld Procedures',
      description: 'WPS documents filtered by type, process, and qualification data.',
      icon: '🔥',
      color: '#b45309',
      bg: '#fffbeb',
      border: '#f59e0b',
      count: weldRows.length,
    },
    {
      key: 'iom' as const,
      title: 'IOMs',
      description: 'Instruction, Operation & Maintenance manuals.',
      icon: '📖',
      color: '#1d4ed8',
      bg: '#eff6ff',
      border: '#3b82f6',
      count: (sectionDocs['iom'] ?? []).length,
    },
    {
      key: 'procedures' as const,
      title: 'Procedures',
      description: 'General and process procedures.',
      icon: '📋',
      color: '#065f46',
      bg: '#ecfdf5',
      border: '#10b981',
      count: (sectionDocs['procedures'] ?? []).length,
    },
    {
      key: 'qaqc' as const,
      title: 'QA/QC Documents',
      description: 'Quality assurance and quality control documents.',
      icon: '✅',
      color: '#6d28d9',
      bg: '#f5f3ff',
      border: '#7c3aed',
      count: (sectionDocs['qaqc'] ?? []).length,
    },
    {
      key: 'mtrs' as const,
      title: 'MTRs',
      description: 'Mill test reports for valves, filler metals, and material.',
      icon: '📑',
      color: '#334155',
      bg: '#f1f5f9',
      border: '#64748b',
      count: (sectionDocs['mtrs'] ?? []).length,
    },
    {
      key: 'employee_training' as const,
      title: 'Employee Training',
      description: 'Schedule sessions, training log, employee records, materials and tests.',
      icon: '🎓',
      color: '#0f766e',
      bg: '#f0fdfa',
      border: '#14b8a6',
      count: trainingCount,
    },
    {
      key: 'relief_valve_spec_books' as const,
      title: 'Relief Valve Spec Books',
      description: 'Manufacturer relief valve specification books and reference data.',
      icon: '📕',
      color: '#c2410c',
      bg: '#fff7ed',
      border: '#f97316',
      count: (sectionDocs['relief_valve_spec_books'] ?? []).length,
    },
  ]

  const activeSimpleSection = SIMPLE_SECTIONS.find((s) => s.key === activeModule)

  // ── IOM filters ──────────────────────────────────────────────────────────
  const [iomMfgFilter, setIomMfgFilter] = useState('')
  const [iomVtFilter, setIomVtFilter] = useState('')
  const [sectionSearchQuery, setSectionSearchQuery] = useState('')
  const [sectionSuggestOpen, setSectionSuggestOpen] = useState(false)
  const sectionSearchWrapRef = useRef<HTMLDivElement>(null)

  // ── Procedure category filter (also driven by stats chips) ───────────────
  const [procCategoryFilter, setProcCategoryFilter] = useState<ProcStatFilter>('all')
  const [mtrKindFilter, setMtrKindFilter] = useState<MtrKind | 'all'>('all')

  useEffect(() => {
    setProcCategoryFilter('all')
    setMtrKindFilter('all')
    setSectionSearchQuery('')
    setSectionSuggestOpen(false)
    setIomMfgFilter('')
    setIomVtFilter('')
  }, [activeModule])

  useEffect(() => {
    if (!sectionSuggestOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (sectionSearchWrapRef.current?.contains(target)) return
      setSectionSuggestOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [sectionSuggestOpen])

  // ── Procedure details dialog (test + answer key quick access) ───────────
  const [procedureDialogDoc, setProcedureDialogDoc] = useState<ResourceDocumentRow | null>(null)
  const [procedureCompanionsLoading, setProcedureCompanionsLoading] = useState(false)
  const [procedureTestDocs, setProcedureTestDocs] = useState<ResourceDocumentRow[]>([])
  const [procedureAnswerKeyDocs, setProcedureAnswerKeyDocs] = useState<ResourceDocumentRow[]>([])

  const closeProcedureDialog = () => {
    if (procedureCompanionsLoading) return
    setProcedureDialogDoc(null)
    setProcedureTestDocs([])
    setProcedureAnswerKeyDocs([])
  }

  const openProcedureDialog = async (row: ResourceDocumentRow) => {
    setProcedureDialogDoc(row)
    setProcedureTestDocs([])
    setProcedureAnswerKeyDocs([])

    const sop = (row.sop_number ?? '').trim()
    if (!sop) return

    setProcedureCompanionsLoading(true)
    const { data, error } = await supabase
      .from('resource_documents')
      .select(PROCEDURE_COMPANION_SELECT)
      .in('category', ['general', 'quality_control'])
      .eq('sop_number', sop)
      .in('proc_category', ['Test', 'Answer Key'])
      .order('date_updated', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(100)
    setProcedureCompanionsLoading(false)

    if (error) {
      showToast(`Could not load test/answer key documents: ${error.message}`)
      return
    }

    const companions = ((data ?? []) as ResourceDocumentRow[]).filter((d) => d.id !== row.id)
    setProcedureTestDocs(companions.filter((d) => d.proc_category === 'Test'))
    setProcedureAnswerKeyDocs(companions.filter((d) => d.proc_category === 'Answer Key'))
  }

  const openProcedureCompanionUpload = (kind: 'Test' | 'Answer Key') => {
    if (!procedureDialogDoc) return
    resetModalState()
    setModalMode('general')
    setUploadCategory(procedureDialogDoc.category === 'quality_control' ? 'quality_control' : 'general')
    setUploadTitle(`${procedureDialogDoc.title} - ${kind}`)
    setSopNumber(procedureDialogDoc.sop_number ?? '')
    setRevisionNumber(procedureDialogDoc.revision_number ?? '')
    setDateUpdated(procedureDialogDoc.date_updated ?? '')
    setProcCategory(kind)
    setUploadModalOpen(true)
  }

  return (
    <section className="dashboard-page resources-page">
      <div className="dashboard-title-row admin-page-heading">
        <h2 className="dashboard-title">Resources</h2>
        {activeModule ? (
          <button type="button" className="button-secondary" onClick={() => setActiveModule(null)}>
            ← Back
          </button>
        ) : (
          <Link to="/dashboard" className="button-secondary">Back</Link>
        )}
      </div>

      {/* ── Landing: Module cards ─────────────────────────────────────────── */}
      {!activeModule ? (
        <>
          <p className="placeholder-copy resources-intro">Select a section to view and manage documents.</p>
          <div className="resources-module-cards">
            {MODULE_CARDS.map((m) => (
              <button
                key={m.key}
                type="button"
                className="resources-module-card"
                style={{ borderColor: m.border }}
                onClick={() => setActiveModule(m.key)}
              >
                <div className="resources-module-card-body">
                  <div className="resources-module-card-top">
                    <div
                      className="resources-module-card-icon-wrap"
                      style={{ background: m.bg, color: m.color }}
                    >
                      {m.icon}
                    </div>
                    <span className="resources-module-card-badge" style={{ color: m.color }}>
                      Active
                    </span>
                  </div>
                  <p className="resources-module-card-title" style={{ color: m.color }}>{m.title}</p>
                  <p className="resources-module-card-desc">{m.description}</p>
                </div>
                <div className="resources-module-card-footer" style={{ color: m.color }}>
                  {m.key === 'employee_training'
                    ? `${m.count} training${m.count !== 1 ? 's' : ''}`
                    : `${m.count} document${m.count !== 1 ? 's' : ''}`}
                </div>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {/* ── Weld Procedures drill-down ───────────────────────────────────── */}
      {activeModule === 'weld' ? (
      <section className="dashboard-panel resources-panel">
        <div className="resources-module-header">
          <div>
            <h3 className="resources-module-title">Weld Procedures</h3>
            <p className="placeholder-copy resources-hint">
              All weld procedure specifications (WPS). Search by title, or use the number lookup to decode a WPS.
            </p>
          </div>
        </div>
        <WpsNumberGuide />
        <div className="report-filters weld-procedure-filters">
          <div className="weld-title-search" ref={weldSearchWrapRef}>
            <label htmlFor="weld-title-search">
              Search title
              <input
                id="weld-title-search"
                type="search"
                value={weldTitleQuery}
                placeholder="Start typing a title or number…"
                autoComplete="off"
                onChange={(e) => {
                  setWeldTitleQuery(e.target.value)
                  setWeldSuggestOpen(true)
                }}
                onFocus={() => {
                  if (weldTitleQuery.trim()) setWeldSuggestOpen(true)
                }}
              />
            </label>
            {weldSuggestOpen && weldTitleSuggestions.length > 0 ? (
              <ul className="weld-title-suggestions" role="listbox" aria-label="Matching weld procedures">
                {weldTitleSuggestions.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="weld-title-suggestion"
                      onClick={() => {
                        setWeldTitleQuery(row.title)
                        setWeldSuggestOpen(false)
                      }}
                    >
                      <span className="weld-title-suggestion-title">{row.title}</span>
                      <span className="weld-title-suggestion-meta">
                        {[row.wps_type, row.base_metal_category, (row.weld_processes ?? []).join(', ')]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <label>
            WPS type
            <select value={weldWpsFilter} onChange={(e) => setWeldWpsFilter(e.target.value as WpsType | 'all')}>
              <option value="all">All types</option>
              {WPS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>
            Process
            <select value={weldProcessFilter} onChange={(e) => setWeldProcessFilter(e.target.value as WeldProcess | 'all')}>
              <option value="all">All processes</option>
              {WELD_PROCESSES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label>
            Category
            <select value={weldCategoryFilter} onChange={(e) => setWeldCategoryFilter(e.target.value as BaseMetalCategory | 'all')}>
              <option value="all">All categories</option>
              {BASE_METAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <button type="button" className="button-secondary" onClick={() => void loadWeldProcedures()} disabled={weldLoading}>
            {weldLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <div className="resources-upload-trigger-row">
          <button type="button" className="button-primary" onClick={openWeldUploadModal}>
            + Add weld procedure
          </button>
        </div>

        <p className="status-breakdown-note">
          Showing {visibleWeldRows.length} of {weldRows.length} weld procedure(s)
        </p>
        <div className="weld-table-wrap">
          <table className="weld-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>WPS Type</th>
                <th>Category</th>
                <th>Processes</th>
                <th>Manual / Machine</th>
                <th>Filler Metal</th>
                <th>BM Thickness Qual.</th>
                <th>FM Thickness Qual.</th>
                <th>PWHT Req.</th>
                <th>PWHT Temp.</th>
                <th>PWHT Time</th>
                <th>HF Approved</th>
                <th>Notes</th>
                <th>File</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleWeldRows.map((row) => (
                <tr key={row.id}>
                  <td className="weld-col-title">
                    {row.storage_path ? (
                      <a
                        className="weld-title-link"
                        href={resourceDocumentPublicUrl(row.storage_path)}
                        target="_blank"
                        rel="noreferrer"
                        title={`Open ${row.file_name || 'PDF'}`}
                      >
                        {row.title}
                      </a>
                    ) : (
                      row.title
                    )}
                  </td>
                  <td>{row.wps_type ?? '-'}</td>
                  <td>{row.base_metal_category ?? '-'}</td>
                  <td>{row.weld_processes?.length ? row.weld_processes.join(', ') : '-'}</td>
                  <td>{row.weld_modes?.length ? row.weld_modes.join(', ') : '-'}</td>
                  <td>{row.filler_metal ?? '-'}</td>
                  <td>{row.base_metal_thickness_qualified ?? '-'}</td>
                  <td>{row.filler_metal_thickness_qualified ?? '-'}</td>
                  <td>{row.post_weld_heat_treat_required ? '✓ Yes' : 'No'}</td>
                  <td>{row.pwht_temperature ?? '-'}</td>
                  <td>{row.pwht_time ?? '-'}</td>
                  <td>{row.hf_approved ? '✓ Yes' : 'No'}</td>
                  <td style={{ maxWidth: 160, whiteSpace: 'normal' }}>{row.notes || '-'}</td>
                  <td>
                    <a href={resourceDocumentPublicUrl(row.storage_path)} target="_blank" rel="noreferrer" style={{ whiteSpace: 'nowrap' }}>
                      📄 {row.file_name}
                    </a>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(row.updated_at).toLocaleDateString()}</td>
                  <td>
                    <div className="weld-col-actions">
                      <button type="button" className="button-secondary admin-list-btn" onClick={() => openEditModal(row)}>Edit</button>
                      <button type="button" className="button-secondary admin-list-btn danger" onClick={() => void removeDocument(row)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!weldLoading && visibleWeldRows.length === 0 ? (
                <tr><td colSpan={16} className="table-empty-cell">No weld procedures found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {activeModule === 'employee_training' ? (
        <EmployeeTrainingPanel canWrite={canWrite} onCountsChange={() => void refreshTrainingCount()} />
      ) : null}

      {/* ── Simple module drill-down (IOMs / Procedures / QA/QC) ─────────── */}
      {activeSimpleSection && activeModule !== 'employee_training' ? (() => {
        const allDocs = sectionDocs[activeSimpleSection.key] ?? []
        const loading = sectionLoading[activeSimpleSection.key] ?? false
        const isIom = activeSimpleSection.key === 'iom'
        const isReliefSpecBooks = activeSimpleSection.key === 'relief_valve_spec_books'
        const isMtr = activeSimpleSection.key === 'mtrs'
        const isManufacturerFiltered = isIom || isReliefSpecBooks
        const isProcedureLike = activeSimpleSection.key === 'procedures' || activeSimpleSection.key === 'qaqc'
        const procedureCategoryCounts = PROC_STAT_CATEGORIES.map((cat) => ({
          key: cat,
          label: cat,
          count: allDocs.filter((d) => d.proc_category === cat).length,
        }))
        const uncategorizedCount = allDocs.filter((d) => !(d.proc_category ?? '').trim()).length
        const mtrKindCounts = MTR_KINDS.map((kind) => ({
          key: kind.value,
          label: kind.label,
          count: allDocs.filter((d) => d.mtr_kind === kind.value).length,
        }))
        const baseDocs = isManufacturerFiltered
          ? allDocs.filter((d) => {
              if (iomMfgFilter && (d.manufacturer ?? '') !== iomMfgFilter) return false
              if (iomVtFilter && (d.product_valve_type ?? '') !== iomVtFilter) return false
              return true
            })
          : isProcedureLike
            ? allDocs.filter((d) => {
                if (procCategoryFilter === 'all') return true
                if (procCategoryFilter === 'uncategorized') return !(d.proc_category ?? '').trim()
                return d.proc_category === procCategoryFilter
              })
            : isMtr
              ? allDocs.filter((d) => mtrKindFilter === 'all' || d.mtr_kind === mtrKindFilter)
              : allDocs
        const searchedDocs = baseDocs.filter((d) => resourceDocumentMatchesQuery(d, sectionSearchQuery))
        const docs = isProcedureLike
          ? [...searchedDocs].sort(compareProcedureDocs)
          : isMtr
            ? [...searchedDocs].sort(compareMtrDocuments)
            : searchedDocs
        const sectionSuggestions = sectionSearchQuery.trim()
          ? allDocs.filter((d) => resourceDocumentMatchesQuery(d, sectionSearchQuery)).slice(0, 10)
          : []
        const searchPlaceholder = isManufacturerFiltered
          ? 'Title, manufacturer, valve type, file…'
          : isProcedureLike
            ? 'Title, SOP #, category, file…'
            : isMtr
              ? 'MTR #, size, heat, material, classification…'
              : 'Start typing a title or file name…'
        return (
          <section className="dashboard-panel resources-panel">
            <div className="resources-module-header">
              <div>
                <h3 className="resources-module-title">{activeSimpleSection.title}</h3>
                <p className="placeholder-copy resources-hint">
                  {activeSimpleSection.description} Search by title, file name, or related fields.
                </p>
              </div>
              <button
                type="button"
                className="button-secondary resources-module-refresh"
                onClick={() => void loadSection(activeSimpleSection.key, activeSimpleSection.categories)}
                disabled={loading}
              >
                {loading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {isProcedureLike ? (
              <div className="resources-section-stats" aria-label={`${activeSimpleSection.title} statistics`}>
                <button
                  type="button"
                  className={`resources-section-stat${procCategoryFilter === 'all' ? ' resources-section-stat--active' : ''}`}
                  onClick={() => setProcCategoryFilter('all')}
                >
                  <span className="resources-section-stat-value">{allDocs.length}</span>
                  <span className="resources-section-stat-label">Total</span>
                </button>
                {procedureCategoryCounts.map((stat) => (
                  <button
                    key={stat.key}
                    type="button"
                    className={`resources-section-stat${procCategoryFilter === stat.key ? ' resources-section-stat--active' : ''}`}
                    onClick={() => setProcCategoryFilter(stat.key)}
                    disabled={stat.count === 0 && procCategoryFilter !== stat.key}
                  >
                    <span className="resources-section-stat-value">{stat.count}</span>
                    <span className="resources-section-stat-label">{stat.label}</span>
                  </button>
                ))}
                {uncategorizedCount > 0 || procCategoryFilter === 'uncategorized' ? (
                  <button
                    type="button"
                    className={`resources-section-stat${procCategoryFilter === 'uncategorized' ? ' resources-section-stat--active' : ''}`}
                    onClick={() => setProcCategoryFilter('uncategorized')}
                  >
                    <span className="resources-section-stat-value">{uncategorizedCount}</span>
                    <span className="resources-section-stat-label">Uncategorized</span>
                  </button>
                ) : null}
              </div>
            ) : null}

            {isMtr ? (
              <div className="resources-section-stats" aria-label="MTR types">
                <button
                  type="button"
                  className={`resources-section-stat${mtrKindFilter === 'all' ? ' resources-section-stat--active' : ''}`}
                  onClick={() => setMtrKindFilter('all')}
                >
                  <span className="resources-section-stat-value">{allDocs.length}</span>
                  <span className="resources-section-stat-label">Total</span>
                </button>
                {mtrKindCounts.map((stat) => (
                  <button
                    key={stat.key}
                    type="button"
                    className={`resources-section-stat${mtrKindFilter === stat.key ? ' resources-section-stat--active' : ''}`}
                    onClick={() => setMtrKindFilter(stat.key)}
                  >
                    <span className="resources-section-stat-value">{stat.count}</span>
                    <span className="resources-section-stat-label">{stat.label}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="iom-filter-row resources-section-search-row">
              <div className="weld-title-search" ref={sectionSearchWrapRef}>
                <label htmlFor="resources-section-search">
                  Search
                  <input
                    id="resources-section-search"
                    type="search"
                    value={sectionSearchQuery}
                    placeholder={searchPlaceholder}
                    autoComplete="off"
                    onChange={(e) => {
                      setSectionSearchQuery(e.target.value)
                      setSectionSuggestOpen(true)
                    }}
                    onFocus={() => {
                      if (sectionSearchQuery.trim()) setSectionSuggestOpen(true)
                    }}
                  />
                </label>
                {sectionSuggestOpen && sectionSuggestions.length > 0 ? (
                  <ul className="weld-title-suggestions" role="listbox" aria-label="Matching documents">
                    {sectionSuggestions.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          className="weld-title-suggestion"
                          onClick={() => {
                            setSectionSearchQuery(row.title)
                            setSectionSuggestOpen(false)
                            if (isManufacturerFiltered) {
                              setIomMfgFilter('')
                              setIomVtFilter('')
                            }
                          }}
                        >
                          <span className="weld-title-suggestion-title">{row.title}</span>
                          <span className="weld-title-suggestion-meta">
                            {[
                              row.mtr_number,
                              row.manufacturer,
                              isMtr ? formatMtrDetails(row) : row.product_valve_type,
                              row.sop_number,
                              row.proc_category,
                              row.mtr_kind ? mtrKindLabel(row.mtr_kind) : '',
                              row.mtr_body_heat || row.heat_lot,
                              row.mtr_bonnet_heat,
                              row.file_name,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>

            <div className="resources-upload-trigger-row">
              {!(isReliefSpecBooks && !canCatalogSpecs) ? (
                <button
                  type="button"
                  className="button-primary"
                  onClick={() =>
                    openSimpleUploadModal(
                      activeSimpleSection.categories[0],
                      isMtr && mtrKindFilter !== 'all' ? { mtrKind: mtrKindFilter } : undefined,
                    )
                  }
                >
                  {activeSimpleSection.addLabel}
                </button>
              ) : (
                <p className="placeholder-copy resources-hint">
                  Only Quality Admin or Manager can add or catalogue spec books.
                </p>
              )}
            </div>

            {isManufacturerFiltered && (
              <div className="iom-filter-row">
                <label className="iom-filter-label">
                  Manufacturer
                  <select
                    value={iomMfgFilter}
                    onChange={(e) => setIomMfgFilter(e.target.value)}
                    className="iom-filter-select"
                  >
                    <option value="">All manufacturers</option>
                    {(isReliefSpecBooks
                      ? manufacturerOptions.map((m) => m.name)
                      : manufacturers
                    ).map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <label className="iom-filter-label">
                  Valve Type
                  <select
                    value={iomVtFilter}
                    onChange={(e) => setIomVtFilter(e.target.value)}
                    className="iom-filter-select"
                  >
                    <option value="">All valve types</option>
                    {valveTypeOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                {(iomMfgFilter || iomVtFilter) && (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => { setIomMfgFilter(''); setIomVtFilter('') }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}

            <p className="status-breakdown-note">Showing {docs.length} of {allDocs.length} document(s).</p>
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    {isManufacturerFiltered ? (
                      <>
                        <th>Manufacturer</th>
                        <th>Valve Type</th>
                      </>
                    ) : null}
                    {(activeSimpleSection.key === 'procedures' || activeSimpleSection.key === 'qaqc') ? (
                      <>
                        <th>SOP #</th>
                        <th>Rev</th>
                        <th>Date Updated</th>
                        <th>Category</th>
                      </>
                    ) : null}
                    {isMtr ? (
                      mtrKindFilter === 'valve' ? (
                        <>
                          <th>MTR #</th>
                          <th>Size</th>
                          <th>Pressure</th>
                          <th>Type</th>
                          <th>Body heat</th>
                          <th>Bonnet heat</th>
                          <th>Manufacturer</th>
                        </>
                      ) : mtrKindFilter === 'material' ? (
                        <>
                          <th>MTR #</th>
                          <th>Material type</th>
                          <th>Length</th>
                          <th>OD</th>
                          <th>ID</th>
                          <th>Manufacturer</th>
                        </>
                      ) : mtrKindFilter === 'filler_metal' ? (
                        <>
                          <th>MTR #</th>
                          <th>Classification</th>
                          <th>Material</th>
                          <th>Size</th>
                          <th>Manufacturer</th>
                        </>
                      ) : (
                        <>
                          <th>MTR #</th>
                          <th>Material Type</th>
                          <th>Manufacturer</th>
                          <th>Details</th>
                        </>
                      )
                    ) : null}
                    <th>File</th>
                    <th>Notes</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((row) => (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 600 }}>
                        {isProcedureLike ? (
                          <button
                            type="button"
                            className="resources-procedure-link-btn"
                            onClick={() => void openProcedureDialog(row)}
                          >
                            {row.title}
                          </button>
                        ) : isMtr ? (
                          <button
                            type="button"
                            className="resources-procedure-link-btn"
                            onClick={() => void openSpecBookFile(row)}
                          >
                            {row.title}
                          </button>
                        ) : (
                          row.title
                        )}
                      </td>
                      {isManufacturerFiltered ? (
                        <>
                          <td>{row.manufacturer ?? '-'}</td>
                          <td>{row.product_valve_type ?? '-'}</td>
                        </>
                      ) : null}
                      {(activeSimpleSection.key === 'procedures' || activeSimpleSection.key === 'qaqc') ? (
                        <>
                          <td>{row.sop_number ?? '-'}</td>
                          <td>{row.revision_number ?? '-'}</td>
                          <td>{row.date_updated ? new Date(row.date_updated).toLocaleDateString() : '-'}</td>
                          <td>{row.proc_category ?? '-'}</td>
                        </>
                      ) : null}
                      {isMtr ? (
                        mtrKindFilter === 'valve' ? (
                          <>
                            <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.mtr_number || '—'}</td>
                            <td>{row.mtr_size ?? '-'}</td>
                            <td>{row.mtr_pressure ?? '-'}</td>
                            <td>{row.product_valve_type ?? '-'}</td>
                            <td>{row.mtr_body_heat || row.heat_lot || '-'}</td>
                            <td>{row.mtr_bonnet_heat ?? '-'}</td>
                            <td>{row.manufacturer ?? '-'}</td>
                          </>
                        ) : mtrKindFilter === 'material' ? (
                          <>
                            <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.mtr_number || '—'}</td>
                            <td>{row.mtr_material || row.filler_metal || '-'}</td>
                            <td>{row.mtr_length ?? '-'}</td>
                            <td>{row.mtr_od ?? '-'}</td>
                            <td>{row.mtr_inside_dia ?? '-'}</td>
                            <td>{row.manufacturer ?? '-'}</td>
                          </>
                        ) : mtrKindFilter === 'filler_metal' ? (
                          <>
                            <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.mtr_number || '—'}</td>
                            <td>{row.filler_metal ?? '-'}</td>
                            <td>{row.mtr_material ?? '-'}</td>
                            <td>{row.mtr_size ?? '-'}</td>
                            <td>{row.manufacturer ?? '-'}</td>
                          </>
                        ) : (
                          <>
                            <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.mtr_number || '—'}</td>
                            <td>{mtrKindLabel(row.mtr_kind)}</td>
                            <td>{row.manufacturer ?? '-'}</td>
                            <td>{formatMtrDetails(row)}</td>
                          </>
                        )
                      ) : null}
                      <td>
                        <button
                          type="button"
                          className="resources-procedure-link-btn"
                          onClick={() => void openSpecBookFile(row)}
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          📄 {row.file_name}
                        </button>
                      </td>
                      <td className="table-cell-clamp">{row.notes || '-'}</td>
                      <td>{new Date(row.updated_at).toLocaleDateString()}</td>
                      <td style={{ display: 'flex', gap: '6px' }}>
                        {(!isReliefSpecBooks || canCatalogSpecs) ? (
                          <>
                            <button type="button" className="button-secondary admin-list-btn" onClick={() => openEditModal(row)}>
                              Edit
                            </button>
                            <button type="button" className="button-secondary admin-list-btn danger" onClick={() => void removeDocument(row)}>
                              Delete
                            </button>
                          </>
                        ) : (
                          <span className="placeholder-copy">View only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!loading && docs.length === 0 ? (
                    <tr><td colSpan={11} className="table-empty-cell">No documents found.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        )
      })() : null}


      {/* ── Procedure detail dialog ───────────────────────────────────────── */}
      {procedureDialogDoc ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Procedure details"
          onMouseDown={(e) => e.target === e.currentTarget && closeProcedureDialog()}
        >
          <div className="modal-card resources-procedure-dialog">
            <div className="resources-upload-modal-header">
              <h3>{procedureDialogDoc.title}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeProcedureDialog}
                disabled={procedureCompanionsLoading}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="resources-procedure-dialog-meta">
              <span><strong>SOP #:</strong> {procedureDialogDoc.sop_number ?? '-'}</span>
              <span><strong>Rev:</strong> {procedureDialogDoc.revision_number ?? '-'}</span>
              <span><strong>Category:</strong> {procedureDialogDoc.proc_category ?? '-'}</span>
            </div>

            <div className="resources-procedure-dialog-block">
              <p className="resources-procedure-dialog-label">Procedure file</p>
              <a
                href={resourceDocumentPublicUrl(procedureDialogDoc.storage_path)}
                target="_blank"
                rel="noreferrer"
                className="resources-procedure-dialog-link"
              >
                📄 {procedureDialogDoc.file_name}
              </a>
            </div>

            {procedureDialogDoc.notes ? (
              <p className="resources-procedure-dialog-notes">{procedureDialogDoc.notes}</p>
            ) : null}

            <div className="resources-procedure-dialog-grid">
              <section className="resources-procedure-dialog-block">
                <div className="resources-procedure-dialog-head">
                  <p className="resources-procedure-dialog-label">Tests</p>
                  <button
                    type="button"
                    className="button-secondary admin-list-btn"
                    onClick={() => openProcedureCompanionUpload('Test')}
                    disabled={procedureCompanionsLoading}
                  >
                    Upload test
                  </button>
                </div>
                {procedureCompanionsLoading ? (
                  <p className="placeholder-copy">Loading…</p>
                ) : procedureTestDocs.length === 0 ? (
                  <p className="placeholder-copy">No test documents linked to this SOP yet.</p>
                ) : (
                  <ul className="resources-procedure-dialog-list">
                    {procedureTestDocs.map((doc) => (
                      <li key={doc.id}>
                        <a
                          href={resourceDocumentPublicUrl(doc.storage_path)}
                          target="_blank"
                          rel="noreferrer"
                          className="resources-procedure-dialog-link"
                        >
                          📄 {doc.file_name}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="resources-procedure-dialog-block">
                <div className="resources-procedure-dialog-head">
                  <p className="resources-procedure-dialog-label">Answer keys</p>
                  <button
                    type="button"
                    className="button-secondary admin-list-btn"
                    onClick={() => openProcedureCompanionUpload('Answer Key')}
                    disabled={procedureCompanionsLoading}
                  >
                    Upload answer key
                  </button>
                </div>
                {procedureCompanionsLoading ? (
                  <p className="placeholder-copy">Loading…</p>
                ) : procedureAnswerKeyDocs.length === 0 ? (
                  <p className="placeholder-copy">No answer key documents linked to this SOP yet.</p>
                ) : (
                  <ul className="resources-procedure-dialog-list">
                    {procedureAnswerKeyDocs.map((doc) => (
                      <li key={doc.id}>
                        <a
                          href={resourceDocumentPublicUrl(doc.storage_path)}
                          target="_blank"
                          rel="noreferrer"
                          className="resources-procedure-dialog-link"
                        >
                          📄 {doc.file_name}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Upload / Add modal ───────────────────────────────────────────── */}
      {uploadModalOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={modalTitle}
        >
          <div className="modal-card resources-upload-modal">
            <div className="resources-upload-modal-header">
              <h3>{modalTitle}</h3>
              <button type="button" className="modal-close-btn" onClick={closeUploadModal} disabled={uploading} aria-label="Close">
                ✕
              </button>
            </div>

            {/* Drop zone */}
            <div
              className={`resources-drop-zone${dragOver ? ' resources-drop-zone--over' : uploadFile ? ' resources-drop-zone--has-file' : ''}`}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => !uploading && fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !uploading && fileInputRef.current?.click()}
              aria-label="Drop file here or click to browse"
            >
              <input
                ref={fileInputRef}
                type="file"
                className="resources-drop-zone-input"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.gif"
                tabIndex={-1}
              />
              {uploadFile ? (
                <>
                  <span className="resources-drop-icon">📄</span>
                  <p className="resources-drop-filename">{uploadFile.name}</p>
                  <p className="resources-drop-sub">Click to change file</p>
                </>
              ) : (
                <>
                  <span className="resources-drop-icon">📂</span>
                  <p className="resources-drop-primary">Drag &amp; drop a file here</p>
                  <p className="resources-drop-sub">or click to browse your computer</p>
                  <p className="resources-drop-types">
                    {editingDoc
                      ? 'Leave empty to keep the existing file. PDF, Word, Excel, CSV, image — up to 40 MB'
                      : 'PDF, Word, Excel, CSV, image — up to 40 MB'}
                  </p>
                </>
              )}
            </div>

            {/* Fields */}
            <div className="resources-upload-fields">
              <label className="modal-label" htmlFor="upload-title">
                Title <span className="required-star">*</span>
              </label>
              <input
                id="upload-title"
                type="text"
                className="modal-status-select"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder={
                  modalMode === 'weld'
                    ? 'e.g. WPS-017 Carbon Steel Joint'
                    : uploadCategory === 'mtr'
                      ? 'e.g. Heat 4521 A105 body'
                      : 'e.g. ISO 9001 Quality Manual'
                }
                disabled={uploading}
                autoFocus
              />


              {/* Manufacturer + Valve Type — IOM / maintenance manual (lookup_values) */}
              {(uploadCategory === 'iom' || uploadCategory === 'maintenance_manual') ? (
                <>
                  <label className="modal-label" htmlFor="upload-manufacturer">Manufacturer</label>
                  <select
                    id="upload-manufacturer"
                    className="modal-status-select"
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    disabled={uploading}
                  >
                    <option value="">— Select manufacturer —</option>
                    {manufacturers.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>

                  <label className="modal-label" htmlFor="upload-product-valve-type">Valve Type</label>
                  <select
                    id="upload-product-valve-type"
                    className="modal-status-select"
                    value={productValveType}
                    onChange={(e) => setProductValveType(e.target.value)}
                    disabled={uploading}
                  >
                    <option value="">— Select valve type —</option>
                    {valveTypeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </>
              ) : null}

              {/* Relief Valve Spec Books — manufacturers table + optional catalog fields */}
              {uploadCategory === 'relief_valve_spec_book' ? (
                <>
                  <div className="weld-fields-divider">Spec book details</div>

                  <label className="modal-label" htmlFor="upload-manufacturer-id">
                    Manufacturer <span className="required-star">*</span>
                  </label>
                  <select
                    id="upload-manufacturer-id"
                    className="modal-status-select"
                    value={manufacturerId}
                    onChange={(e) => setManufacturerId(e.target.value)}
                    disabled={uploading}
                  >
                    <option value="">— Select manufacturer —</option>
                    {manufacturerOptions.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>

                  <label className="modal-label" htmlFor="upload-spec-doc-type">Document type</label>
                  <select
                    id="upload-spec-doc-type"
                    className="modal-status-select"
                    value={specDocType}
                    onChange={(e) => setSpecDocType(e.target.value as SpecDocumentType | '')}
                    disabled={uploading}
                  >
                    <option value="">— Library only (no spec catalog) —</option>
                    {SPEC_DOC_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>

                  <label className="modal-label" htmlFor="upload-edition-label">Edition</label>
                  <input
                    id="upload-edition-label"
                    type="text"
                    className="modal-status-select"
                    value={editionLabel}
                    onChange={(e) => setEditionLabel(e.target.value)}
                    placeholder="e.g. 2022"
                    disabled={uploading}
                  />

                  <label className="modal-label" htmlFor="upload-revision-label">Revision</label>
                  <input
                    id="upload-revision-label"
                    type="text"
                    className="modal-status-select"
                    value={revisionLabel}
                    onChange={(e) => setRevisionLabel(e.target.value)}
                    placeholder="e.g. Rev B"
                    disabled={uploading}
                  />

                  <label className="modal-label" htmlFor="upload-effective-date">Effective date</label>
                  <input
                    id="upload-effective-date"
                    type="date"
                    className="modal-status-select"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    disabled={uploading}
                  />

                  <label className="modal-label" htmlFor="upload-page-count">Page count</label>
                  <input
                    id="upload-page-count"
                    type="number"
                    min={1}
                    className="modal-status-select"
                    value={pageCount}
                    onChange={(e) => setPageCount(e.target.value)}
                    placeholder="e.g. 120"
                    disabled={uploading}
                  />

                  <label className="modal-label" htmlFor="upload-spec-product-valve-type">Valve Type</label>
                  <select
                    id="upload-spec-product-valve-type"
                    className="modal-status-select"
                    value={productValveType}
                    onChange={(e) => setProductValveType(e.target.value)}
                    disabled={uploading}
                  >
                    <option value="">— Select valve type —</option>
                    {valveTypeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </>
              ) : null}

              {/* Procedure / QA/QC fields */}
              {(uploadCategory === 'general' || uploadCategory === 'quality_control') && (
                <>
                  <div className="weld-fields-divider">Procedure Details</div>

                  <label className="modal-label" htmlFor="upload-sop-number">SOP Number</label>
                  <input
                    id="upload-sop-number"
                    type="text"
                    className="modal-status-select"
                    value={sopNumber}
                    onChange={(e) => setSopNumber(e.target.value)}
                    placeholder="e.g. SOP-042"
                    disabled={uploading}
                  />

                  <label className="modal-label" htmlFor="upload-revision-number">Revision Number</label>
                  <input
                    id="upload-revision-number"
                    type="text"
                    className="modal-status-select"
                    value={revisionNumber}
                    onChange={(e) => setRevisionNumber(e.target.value)}
                    placeholder="e.g. Rev 3"
                    disabled={uploading}
                  />

                  <label className="modal-label" htmlFor="upload-date-updated">Date Updated</label>
                  <input
                    id="upload-date-updated"
                    type="date"
                    className="modal-status-select"
                    value={dateUpdated}
                    onChange={(e) => setDateUpdated(e.target.value)}
                    disabled={uploading}
                  />

                  <label className="modal-label" htmlFor="upload-proc-category">Category</label>
                  <select
                    id="upload-proc-category"
                    className="modal-status-select"
                    value={procCategory}
                    onChange={(e) => setProcCategory(e.target.value as 'Valve-Specific' | 'NDE' | 'Other' | 'Test' | 'Answer Key' | '')}
                    disabled={uploading}
                  >
                    <option value="">— Select category —</option>
                    <option value="Valve-Specific">Valve-Specific</option>
                    <option value="NDE">NDE</option>
                    <option value="Other">Other</option>
                    <option value="Test">Test</option>
                    <option value="Answer Key">Answer Key</option>
                  </select>
                </>
              )}

              {uploadCategory === 'mtr' ? (
                <>
                  <div className="weld-fields-divider">MTR details</div>

                  <label className="modal-label" htmlFor="upload-mtr-number">MTR #</label>
                  <input
                    id="upload-mtr-number"
                    type="text"
                    className="modal-status-select"
                    value={mtrNumber}
                    onChange={(e) => setMtrNumber(e.target.value)}
                    onBlur={() => setMtrNumber((prev) => (prev.trim() ? normalizeMtrNumber(prev) : prev))}
                    placeholder={
                      editingDoc
                        ? editingDoc.mtr_number || 'Keep existing number'
                        : `Leave blank to assign ${nextMtrNumber((sectionDocs.mtrs ?? []).map((row) => row.mtr_number))}`
                    }
                    disabled={uploading}
                  />
                  <p className="placeholder-copy resources-hint" style={{ marginTop: '-0.15rem' }}>
                    {editingDoc
                      ? 'Enter the assigned MTR number, or leave as-is.'
                      : 'Type an existing number (47 or MTR-47). Leave blank and new reports get the next MTR-000001+ number.'}
                  </p>

                  <label className="modal-label" htmlFor="upload-mtr-kind">
                    Material Type <span className="required-star">*</span>
                  </label>
                  <select
                    id="upload-mtr-kind"
                    className="modal-status-select"
                    value={mtrKind}
                    onChange={(e) => {
                      const next = e.target.value as MtrKind | ''
                      setMtrKind(next)
                      setMtrSize('')
                      setMtrPressure('')
                      setProductValveType('')
                      setMtrBodyHeat('')
                      setMtrBonnetHeat('')
                      setMtrMaterial('')
                      setMtrLength('')
                      setMtrOd('')
                      setMtrInsideDia('')
                      setFillerMetal('')
                      setHeatLot('')
                    }}
                    disabled={uploading}
                  >
                    <option value="">— Select material type —</option>
                    {MTR_KINDS.map((kind) => (
                      <option key={kind.value} value={kind.value}>{kind.label}</option>
                    ))}
                  </select>

                  <LookupAddSelect
                    id="upload-mtr-manufacturer"
                    label="Manufacturer"
                    value={manufacturer}
                    options={manufacturers}
                    emptyOption="— Select manufacturer —"
                    addLabel="+ Add manufacturer"
                    addPlaceholder="New manufacturer"
                    disabled={uploading}
                    onChange={setManufacturer}
                    onAdd={(next) => persistMtrLookup('manufacturer', next, setManufacturer)}
                  />

                  {mtrKind === 'valve' ? (
                    <>
                      <label className="modal-label" htmlFor="upload-mtr-size">
                        Size <span className="required-star">*</span>
                      </label>
                      <select
                        id="upload-mtr-size"
                        className="modal-status-select"
                        value={mtrSize}
                        onChange={(e) => setMtrSize(e.target.value)}
                        disabled={uploading}
                      >
                        <option value="">— Select size —</option>
                        {optionsWithCurrent(lookupOptions.valve_size ?? [], mtrSize).map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>

                      <label className="modal-label" htmlFor="upload-mtr-pressure">
                        Pressure <span className="required-star">*</span>
                      </label>
                      <select
                        id="upload-mtr-pressure"
                        className="modal-status-select"
                        value={mtrPressure}
                        onChange={(e) => setMtrPressure(e.target.value)}
                        disabled={uploading}
                      >
                        <option value="">— Select pressure —</option>
                        {optionsWithCurrent(lookupOptions.pressure_class ?? [], mtrPressure).map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>

                      <label className="modal-label" htmlFor="upload-mtr-valve-type">
                        Type <span className="required-star">*</span>
                      </label>
                      <select
                        id="upload-mtr-valve-type"
                        className="modal-status-select"
                        value={productValveType}
                        onChange={(e) => setProductValveType(e.target.value)}
                        disabled={uploading}
                      >
                        <option value="">— Select type —</option>
                        {optionsWithCurrent(valveTypeOptions, productValveType).map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>

                      <label className="modal-label" htmlFor="upload-mtr-body-heat">
                        Body heat number <span className="required-star">*</span>
                      </label>
                      <input
                        id="upload-mtr-body-heat"
                        type="text"
                        className="modal-status-select"
                        value={mtrBodyHeat}
                        onChange={(e) => setMtrBodyHeat(e.target.value)}
                        placeholder="Body mill heat"
                        disabled={uploading}
                      />

                      <label className="modal-label" htmlFor="upload-mtr-bonnet-heat">
                        Bonnet heat number <span className="required-star">*</span>
                      </label>
                      <input
                        id="upload-mtr-bonnet-heat"
                        type="text"
                        className="modal-status-select"
                        value={mtrBonnetHeat}
                        onChange={(e) => setMtrBonnetHeat(e.target.value)}
                        placeholder="Bonnet mill heat"
                        disabled={uploading}
                      />
                    </>
                  ) : null}

                  {mtrKind === 'material' ? (
                    <>
                      <LookupAddSelect
                        id="upload-mtr-material"
                        label="Material type"
                        required
                        value={mtrMaterial}
                        options={lookupOptions.body_material ?? []}
                        emptyOption="— Select material type —"
                        addLabel="+ Add material"
                        addPlaceholder="New material"
                        disabled={uploading}
                        onChange={setMtrMaterial}
                        onAdd={(next) => persistMtrLookup('body_material', next, setMtrMaterial)}
                      />

                      <label className="modal-label" htmlFor="upload-mtr-length">
                        Length <span className="required-star">*</span>
                      </label>
                      <input
                        id="upload-mtr-length"
                        type="text"
                        className="modal-status-select"
                        value={mtrLength}
                        onChange={(e) => setMtrLength(e.target.value)}
                        placeholder="e.g. 12 ft, 144 in"
                        disabled={uploading}
                      />

                      <label className="modal-label" htmlFor="upload-mtr-od">
                        OD <span className="required-star">*</span>
                      </label>
                      <input
                        id="upload-mtr-od"
                        type="text"
                        className="modal-status-select"
                        value={mtrOd}
                        onChange={(e) => setMtrOd(e.target.value)}
                        placeholder="Outside diameter"
                        disabled={uploading}
                      />

                      <label className="modal-label" htmlFor="upload-mtr-id">
                        ID <span className="required-star">*</span>
                      </label>
                      <input
                        id="upload-mtr-id"
                        type="text"
                        className="modal-status-select"
                        value={mtrInsideDia}
                        onChange={(e) => setMtrInsideDia(e.target.value)}
                        placeholder="Inside diameter"
                        disabled={uploading}
                      />
                    </>
                  ) : null}

                  {mtrKind === 'filler_metal' ? (
                    <>
                      <LookupAddSelect
                        id="upload-mtr-filler"
                        label="Filler classification"
                        required
                        value={fillerMetal}
                        options={fillerClassificationOptions}
                        emptyOption="— Select classification —"
                        addLabel="+ Add classification"
                        addPlaceholder="New classification"
                        disabled={uploading}
                        onChange={setFillerMetal}
                        onAdd={(next) => persistMtrLookup('filler_classification', next, setFillerMetal)}
                      />

                      <LookupAddSelect
                        id="upload-mtr-filler-material"
                        label="Material"
                        required
                        value={mtrMaterial}
                        options={lookupOptions.body_material ?? []}
                        emptyOption="— Select material —"
                        addLabel="+ Add material"
                        addPlaceholder="New material"
                        disabled={uploading}
                        onChange={setMtrMaterial}
                        onAdd={(next) => persistMtrLookup('body_material', next, setMtrMaterial)}
                      />

                      <label className="modal-label" htmlFor="upload-mtr-filler-size">
                        Size <span className="required-star">*</span>
                      </label>
                      <select
                        id="upload-mtr-filler-size"
                        className="modal-status-select"
                        value={mtrSize}
                        onChange={(e) => setMtrSize(e.target.value)}
                        disabled={uploading}
                      >
                        <option value="">— Select size —</option>
                        {optionsWithCurrent(lookupOptions.filler_size ?? [], mtrSize).map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    </>
                  ) : null}
                </>
              ) : null}

              <label className="modal-label" htmlFor="upload-notes">Notes{uploadCategory === 'mtr' ? '' : ' (optional)'}</label>
              {uploadCategory === 'mtr' ? (
                <textarea
                  id="upload-notes"
                  className="modal-status-select"
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="Notes for this MTR"
                  disabled={uploading}
                  rows={3}
                />
              ) : (
                <input
                  id="upload-notes"
                  type="text"
                  className="modal-status-select"
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="Short description or revision note"
                  disabled={uploading}
                />
              )}

              {/* Weld-specific fields — always shown in weld mode */}
              {modalMode === 'weld' ? (
                <>
                  <div className="weld-fields-divider">Weld Procedure Details</div>

                  <label className="modal-label" htmlFor="upload-wps-type">WPS Type</label>
                  <select
                    id="upload-wps-type"
                    className="modal-status-select"
                    value={wpsType}
                    onChange={(e) => setWpsType(e.target.value as WpsType | '')}
                    disabled={uploading}
                  >
                    <option value="">— Select WPS type —</option>
                    {WPS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>

                  <label className="modal-label" htmlFor="upload-bm-category">Base Metal Category</label>
                  <select
                    id="upload-bm-category"
                    className="modal-status-select"
                    value={baseMetalCategory}
                    onChange={(e) => setBaseMetalCategory(e.target.value as BaseMetalCategory | '')}
                    disabled={uploading}
                  >
                    <option value="">— Select category —</option>
                    {BASE_METAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>

                  <label className="modal-label">Weld Process Utilized</label>
                  <div className="weld-process-checkboxes">
                    {WELD_PROCESSES.map((p) => (
                      <label key={p} className="weld-process-check-label">
                        <input
                          type="checkbox"
                          checked={weldProcesses.includes(p)}
                          onChange={() => toggleWeldProcess(p)}
                          disabled={uploading}
                        />
                        {p}
                      </label>
                    ))}
                  </div>

                  <label className="modal-label">Manual / Machine</label>
                  <div className="weld-process-checkboxes">
                    {WELD_MODES.map((m) => (
                      <label key={m} className="weld-process-check-label">
                        <input
                          type="checkbox"
                          checked={weldModes.includes(m)}
                          onChange={() =>
                            setWeldModes((prev) =>
                              prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
                            )
                          }
                          disabled={uploading}
                        />
                        {m}
                      </label>
                    ))}
                  </div>

                  <label className="modal-label" htmlFor="upload-filler-metal">Filler Metal</label>
                  <input
                    id="upload-filler-metal"
                    type="text"
                    className="modal-status-select"
                    value={fillerMetal}
                    onChange={(e) => setFillerMetal(e.target.value)}
                    placeholder="e.g. ER70S-6"
                    disabled={uploading}
                  />

                  <label className="modal-label" htmlFor="upload-bm-thickness-qualified">Base Metal Thickness Qualified</label>
                  <input
                    id="upload-bm-thickness-qualified"
                    type="text"
                    className="modal-status-select"
                    value={baseMetalThicknessQualified}
                    onChange={(e) => setBaseMetalThicknessQualified(e.target.value)}
                    placeholder={'e.g. 1/8" to 3/4"'}
                    disabled={uploading}
                  />

                  <label className="modal-label" htmlFor="upload-fm-thickness-qualified">Filler Metal Thickness Qualified</label>
                  <input
                    id="upload-fm-thickness-qualified"
                    type="text"
                    className="modal-status-select"
                    value={fillerMetalThicknessQualified}
                    onChange={(e) => setFillerMetalThicknessQualified(e.target.value)}
                    placeholder={'e.g. up to 3/4"'}
                    disabled={uploading}
                  />

                  <label className="weld-checkbox-label">
                    <input
                      type="checkbox"
                      checked={postWeldHeatTreatRequired}
                      onChange={(e) => {
                        setPostWeldHeatTreatRequired(e.target.checked)
                        if (!e.target.checked) { setPwhtTemperature(''); setPwhtTime('') }
                      }}
                      disabled={uploading}
                    />
                    Post-Weld Heat Treat Required
                  </label>

                  {postWeldHeatTreatRequired && (
                    <div className="pwht-detail-fields">
                      <div className="pwht-detail-field">
                        <label className="modal-label" htmlFor="upload-pwht-temp">PWHT Temperature</label>
                        <input
                          id="upload-pwht-temp"
                          type="text"
                          className="modal-status-select"
                          value={pwhtTemperature}
                          onChange={(e) => setPwhtTemperature(e.target.value)}
                          placeholder="e.g. 1150°F"
                          disabled={uploading}
                        />
                      </div>
                      <div className="pwht-detail-field">
                        <label className="modal-label" htmlFor="upload-pwht-time">PWHT Time</label>
                        <input
                          id="upload-pwht-time"
                          type="text"
                          className="modal-status-select"
                          value={pwhtTime}
                          onChange={(e) => setPwhtTime(e.target.value)}
                          placeholder="e.g. 1 hr/inch min 1 hr"
                          disabled={uploading}
                        />
                      </div>
                    </div>
                  )}

                  <label className="weld-checkbox-label">
                    <input
                      type="checkbox"
                      checked={hfApproved}
                      onChange={(e) => setHfApproved(e.target.checked)}
                      disabled={uploading}
                    />
                    HF Approved Procedure
                  </label>
                </>
              ) : null}
            </div>

            <div className="technician-modal-footer">
              <button type="button" className="button-secondary" onClick={closeUploadModal} disabled={uploading}>
                Cancel
              </button>
              <button type="button" className="button-primary" onClick={() => void handleUpload()} disabled={uploading}>
                {uploading ? (editingDoc ? 'Saving…' : 'Uploading…') : editingDoc ? 'Save changes' : modalMode === 'weld' ? 'Save weld procedure' : 'Upload document'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
