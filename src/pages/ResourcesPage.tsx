import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import {
  deleteResourceDocument,
  resourceDocumentPublicUrl,
  type ResourceDocumentCategory,
  type ResourceDocumentRow,
  type BaseMetalCategory,
  type WeldMode,
  type WeldProcess,
  type WpsType,
  uploadResourceDocument,
  BASE_METAL_CATEGORIES,
  WELD_MODES,
  WELD_PROCESSES,
  WPS_TYPES,
} from '../lib/resourceDocuments'
import { loadLookupOptionsMap } from '../lib/lookupValues'
import { supabase } from '../lib/supabase'



const RESOURCE_DOC_SELECT =
  'id,scope,valve_type,category,title,notes,storage_path,file_name,mime_type,created_at,updated_at,wps_type,base_metal_category,weld_processes,weld_modes,filler_metal,base_metal_thickness_qualified,filler_metal_thickness_qualified,post_weld_heat_treat_required,pwht_temperature,pwht_time,hf_approved,manufacturer,product_valve_type'

export function ResourcesPage() {
  const { showToast } = useToast()

  // ── Lookup lists for modal dropdowns ─────────────────────────────────────
  const [manufacturers, setManufacturers] = useState<string[]>([])
  const [valveTypeOptions, setValveTypeOptions] = useState<string[]>([])

  useEffect(() => {
    void (async () => {
      try {
        const map = await loadLookupOptionsMap()
        setManufacturers(map.manufacturer ?? [])
        setValveTypeOptions(map.valve_type ?? [])
      } catch { /* silently ignore */ }
    })()
  }, [])

  // ── Weld procedures section ──────────────────────────────────────────────
  const [weldRows, setWeldRows] = useState<ResourceDocumentRow[]>([])
  const [weldLoading, setWeldLoading] = useState(false)
  const [weldWpsFilter, setWeldWpsFilter] = useState<WpsType | 'all'>('all')
  const [weldProcessFilter, setWeldProcessFilter] = useState<WeldProcess | 'all'>('all')
  const [weldCategoryFilter, setWeldCategoryFilter] = useState<BaseMetalCategory | 'all'>('all')

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
      return matchWps && matchProcess && matchCategory
    })
  }, [weldRows, weldWpsFilter, weldProcessFilter, weldCategoryFilter])

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
  ] as const

  type SectionKey = (typeof SIMPLE_SECTIONS)[number]['key']

  const [sectionDocs, setSectionDocs] = useState<Record<string, ResourceDocumentRow[]>>({})
  const [sectionLoading, setSectionLoading] = useState<Record<string, boolean>>({})

  const loadSection = async (key: string, categories: readonly ResourceDocumentCategory[]) => {
    setSectionLoading((prev) => ({ ...prev, [key]: true }))
    const { data, error } = await supabase
      .from('resource_documents')
      .select(RESOURCE_DOC_SELECT)
      .in('category', [...categories])
      .order('title', { ascending: true })
      .limit(400)
    setSectionLoading((prev) => ({ ...prev, [key]: false }))
    if (error) {
      showToast(`Could not load documents: ${error.message}`)
      return
    }
    setSectionDocs((prev) => ({ ...prev, [key]: (data ?? []) as ResourceDocumentRow[] }))
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

  const toggleWeldProcess = (p: WeldProcess) =>
    setWeldProcesses((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))

  const resetModalState = () => {
    setEditingDoc(null)
    setUploadTitle('')
    setUploadNotes('')
    setUploadFile(null)
    setDragOver(false)
    setManufacturer('')
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
  }

  const openEditModal = (row: ResourceDocumentRow) => {
    setEditingDoc(row)
    setModalMode(row.category === 'weld_procedure' ? 'weld' : 'general')
    setUploadCategory(row.category)
    setUploadTitle(row.title)
    setUploadNotes(row.notes ?? '')
    setUploadFile(null)
    setDragOver(false)
    setManufacturer(row.manufacturer ?? '')
    setProductValveType(row.product_valve_type ?? '')
    setWpsType(row.wps_type ?? '')
    setBaseMetalCategory(row.base_metal_category ?? '')
    setWeldProcesses((row.weld_processes ?? []) as WeldProcess[])
    setWeldModes((row.weld_modes ?? []) as WeldMode[])
    setFillerMetal(row.filler_metal ?? '')
    setBaseMetalThicknessQualified(row.base_metal_thickness_qualified ?? '')
    setFillerMetalThicknessQualified(row.filler_metal_thickness_qualified ?? '')
    setPostWeldHeatTreatRequired(row.post_weld_heat_treat_required ?? false)
    setPwhtTemperature(row.pwht_temperature ?? '')
    setPwhtTime(row.pwht_time ?? '')
    setHfApproved(row.hf_approved ?? false)
    setUploadModalOpen(true)
  }

  const openWeldUploadModal = () => {
    resetModalState()
    setModalMode('weld')
    setUploadCategory('weld_procedure')
    setUploadModalOpen(true)
  }

  const openSimpleUploadModal = (category: ResourceDocumentCategory) => {
    resetModalState()
    setModalMode('general')
    setUploadCategory(category)
    setUploadModalOpen(true)
  }

  const closeUploadModal = () => {
    if (uploading) return
    setUploadModalOpen(false)
  }

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
    if (!uploadTitle.trim()) { showToast('Enter a document title'); return }

    setUploading(true)

    // ── Edit mode: update existing row (file replacement is optional) ─────────
    if (editingDoc) {
      // If a new file was chosen, upload it first and swap the storage path
      let newStoragePath: string | undefined
      let newFileName: string | undefined
      let newMimeType: string | undefined

      if (uploadFile) {
        const { error: upErr, path } = await (async () => {
          // Re-use the uploadResourceDocument helper for the storage part only,
          // then we'll patch the DB row ourselves.
          const ext = uploadFile.name.lastIndexOf('.') >= 0
            ? uploadFile.name.slice(uploadFile.name.lastIndexOf('.')).toLowerCase()
            : ''
          const p = `resources/general/${crypto.randomUUID()}${ext}`
          const { error } = await supabase.storage
            .from('valve-attachments')
            .upload(p, uploadFile, { contentType: uploadFile.type || undefined, upsert: false })
          return { error, path: p }
        })()
        if (upErr) { setUploading(false); showToast(upErr.message || 'File upload failed'); return }
        // Remove old file (best-effort)
        await supabase.storage.from('valve-attachments').remove([editingDoc.storage_path])
        newStoragePath = path
        newFileName = uploadFile.name.slice(0, 500)
        newMimeType = uploadFile.type || undefined
      }

      const patch: Record<string, unknown> = {
        title: uploadTitle.trim(),
        notes: uploadNotes,
        manufacturer: manufacturer || null,
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

      setUploading(false)
      if (patchErr) {
        const isdup = patchErr.code === '23505' || /duplicate|unique/i.test(patchErr.message)
        showToast(isdup ? `A document named "${uploadTitle.trim()}" already exists in this section.` : patchErr.message || 'Could not save changes')
        return
      }
      setUploadModalOpen(false)
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
    })
    setUploading(false)
    if (error) { showToast(error); return }
    setUploadModalOpen(false)
    showToast('Document uploaded')
    if (modalMode === 'weld') {
      void loadWeldProcedures()
    } else {
      const key = sectionKeyForCategory(uploadCategory)
      const section = SIMPLE_SECTIONS.find((s) => s.key === key)
      if (section) void loadSection(section.key, section.categories)
    }
  }

  const removeDocument = async (row: ResourceDocumentRow) => {
    if (!window.confirm(`Delete "${row.title}"?`)) return
    const { error } = await deleteResourceDocument({ id: row.id, storage_path: row.storage_path })
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
  ]

  const activeSimpleSection = SIMPLE_SECTIONS.find((s) => s.key === activeModule)

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
                  {m.count} document{m.count !== 1 ? 's' : ''}
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
            <p className="placeholder-copy resources-hint">All weld procedure specifications (WPS). Filter by type or process.</p>
          </div>
        </div>
        <div className="report-filters">
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
                  <td className="weld-col-title">{row.title}</td>
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
                <tr><td colSpan={15} className="table-empty-cell">No weld procedures found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {/* ── Simple module drill-down (IOMs / Procedures / QA/QC) ─────────── */}
      {activeSimpleSection ? (() => {
        const docs = sectionDocs[activeSimpleSection.key] ?? []
        const loading = sectionLoading[activeSimpleSection.key] ?? false
        return (
          <section className="dashboard-panel resources-panel">
            <div className="resources-module-header">
              <div>
                <h3 className="resources-module-title">{activeSimpleSection.title}</h3>
                <p className="placeholder-copy resources-hint">{activeSimpleSection.description}</p>
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

            <div className="resources-upload-trigger-row">
              <button
                type="button"
                className="button-primary"
                onClick={() => openSimpleUploadModal(activeSimpleSection.categories[0])}
              >
                {activeSimpleSection.addLabel}
              </button>
            </div>

            <p className="status-breakdown-note">Showing {docs.length} document(s).</p>
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    {(activeSimpleSection.categories[0] === 'iom' || activeSimpleSection.categories.includes('maintenance_manual' as ResourceDocumentCategory)) ? (
                      <>
                        <th>Manufacturer</th>
                        <th>Valve Type</th>
                      </>
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
                      <td style={{ fontWeight: 600 }}>{row.title}</td>
                      {(activeSimpleSection.categories[0] === 'iom' || activeSimpleSection.categories.includes('maintenance_manual' as ResourceDocumentCategory)) ? (
                        <>
                          <td>{row.manufacturer ?? '-'}</td>
                          <td>{row.product_valve_type ?? '-'}</td>
                        </>
                      ) : null}
                      <td>
                        <a href={resourceDocumentPublicUrl(row.storage_path)} target="_blank" rel="noreferrer">
                          📄 {row.file_name}
                        </a>
                      </td>
                      <td className="table-cell-clamp">{row.notes || '-'}</td>
                      <td>{new Date(row.updated_at).toLocaleDateString()}</td>
                      <td style={{ display: 'flex', gap: '6px' }}>
                        <button type="button" className="button-secondary admin-list-btn" onClick={() => openEditModal(row)}>
                          Edit
                        </button>
                        <button type="button" className="button-secondary admin-list-btn danger" onClick={() => void removeDocument(row)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!loading && docs.length === 0 ? (
                    <tr><td colSpan={7} className="table-empty-cell">No documents found.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        )
      })() : null}


      {/* ── Upload / Add modal ───────────────────────────────────────────── */}
      {uploadModalOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={modalTitle}
          onMouseDown={(e) => e.target === e.currentTarget && closeUploadModal()}
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
                placeholder={modalMode === 'weld' ? 'e.g. WPS-017 Carbon Steel Joint' : 'e.g. ISO 9001 Quality Manual'}
                disabled={uploading}
                autoFocus
              />


              {/* Manufacturer + Valve Type — shown for IOM / maintenance manual */}
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

              <label className="modal-label" htmlFor="upload-notes">Notes (optional)</label>
              <input
                id="upload-notes"
                type="text"
                className="modal-status-select"
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
                placeholder="Short description or revision note"
                disabled={uploading}
              />

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
