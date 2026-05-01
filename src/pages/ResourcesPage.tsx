import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { ValveTypeProceduresPanel } from '../components/ValveTypeProceduresPanel'
import { loadLookupOptionsMap } from '../lib/lookupValues'
import {
  deleteResourceDocument,
  resourceDocumentPublicUrl,
  type ResourceDocumentCategory,
  type ResourceDocumentRow,
  type ResourceDocumentScope,
  type WeldProcess,
  type WpsType,
  uploadResourceDocument,
  WELD_PROCESSES,
  WPS_TYPES,
} from '../lib/resourceDocuments'
import { supabase } from '../lib/supabase'

export type { ValveTypeProcedureRow } from '../components/ValveTypeProceduresPanel'

const DOC_CATEGORY_OPTIONS: { value: ResourceDocumentCategory; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'quality_control', label: 'Quality control' },
  { value: 'iom', label: 'IOM' },
  { value: 'maintenance_manual', label: 'Maintenance manual' },
  { value: 'other', label: 'Other' },
]

const RESOURCE_DOC_SELECT =
  'id,scope,valve_type,category,title,notes,storage_path,file_name,mime_type,created_at,updated_at,wps_type,weld_processes,filler_metal'

export function ResourcesPage() {
  const { showToast } = useToast()

  // ── Valve types ──────────────────────────────────────────────────────────
  const [valveTypes, setValveTypes] = useState<string[]>([])
  const [typesLoading, setTypesLoading] = useState(true)
  const [newValveType, setNewValveType] = useState('')
  const [addingValveType, setAddingValveType] = useState(false)
  const [typeReloadTick, setTypeReloadTick] = useState(0)

  // ── Weld procedures section ──────────────────────────────────────────────
  const [weldRows, setWeldRows] = useState<ResourceDocumentRow[]>([])
  const [weldLoading, setWeldLoading] = useState(false)
  const [weldWpsFilter, setWeldWpsFilter] = useState<WpsType | 'all'>('all')
  const [weldProcessFilter, setWeldProcessFilter] = useState<WeldProcess | 'all'>('all')

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
      const matchProcess =
        weldProcessFilter === 'all' || (r.weld_processes ?? []).includes(weldProcessFilter)
      return matchWps && matchProcess
    })
  }, [weldRows, weldWpsFilter, weldProcessFilter])

  useEffect(() => {
    void loadWeldProcedures()
  }, [])

  // ── General resource documents section ───────────────────────────────────
  const [scope, setScope] = useState<ResourceDocumentScope>('general')
  const [selectedValveType, setSelectedValveType] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | ResourceDocumentCategory>('all')
  const [rows, setRows] = useState<ResourceDocumentRow[]>([])
  const [rowsLoading, setRowsLoading] = useState(false)
  const [tableMissing, setTableMissing] = useState(false)

  const loadDocuments = async () => {
    if (scope === 'valve_type' && !selectedValveType.trim()) {
      setRows([])
      return
    }
    setRowsLoading(true)
    setTableMissing(false)
    let query = supabase
      .from('resource_documents')
      .select(RESOURCE_DOC_SELECT)
      // Exclude weld procedures — they have their own section
      .neq('category', 'weld_procedure')
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(400)

    if (scope === 'general') {
      query = query.eq('scope', 'general')
    } else {
      query = query.eq('scope', 'valve_type').eq('valve_type', selectedValveType.trim())
    }
    if (categoryFilter !== 'all') query = query.eq('category', categoryFilter)

    const { data, error } = await query
    setRowsLoading(false)
    if (error) {
      const msg = `${error.message ?? ''} ${(error as { details?: string }).details ?? ''}`
      if (/relation|does not exist|schema cache|PGRST205/i.test(msg)) {
        setTableMissing(true)
        setRows([])
        return
      }
      showToast(`Could not load documents: ${error.message}`)
      setRows([])
      return
    }
    setRows((data ?? []) as ResourceDocumentRow[])
  }

  useEffect(() => {
    void loadDocuments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, selectedValveType, categoryFilter])

  // ── Upload modal (shared, but mode-aware) ────────────────────────────────
  type ModalMode = 'general' | 'weld'
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('general')
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadNotes, setUploadNotes] = useState('')
  const [uploadCategory, setUploadCategory] = useState<ResourceDocumentCategory>('general')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Weld-specific fields
  const [wpsType, setWpsType] = useState<WpsType | ''>('')
  const [weldProcesses, setWeldProcesses] = useState<WeldProcess[]>([])
  const [fillerMetal, setFillerMetal] = useState('')

  const toggleWeldProcess = (p: WeldProcess) =>
    setWeldProcesses((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))

  const resetModalState = () => {
    setUploadTitle('')
    setUploadNotes('')
    setUploadFile(null)
    setDragOver(false)
    setWpsType('')
    setWeldProcesses([])
    setFillerMetal('')
  }

  const openWeldUploadModal = () => {
    resetModalState()
    setModalMode('weld')
    setUploadCategory('weld_procedure')
    setUploadModalOpen(true)
  }

  const openGeneralUploadModal = () => {
    resetModalState()
    setModalMode('general')
    setUploadCategory('general')
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
    if (!uploadFile) { showToast('Choose a file to upload'); return }
    if (!uploadTitle.trim()) { showToast('Enter a document title'); return }
    setUploading(true)
    const { error } = await uploadResourceDocument({
      file: uploadFile,
      scope: modalMode === 'weld' ? 'general' : scope,
      valveType: (modalMode === 'general' && scope === 'valve_type') ? selectedValveType : null,
      category: uploadCategory,
      title: uploadTitle,
      notes: uploadNotes,
      wpsType: wpsType || null,
      weldProcesses,
      fillerMetal,
    })
    setUploading(false)
    if (error) { showToast(error); return }
    setUploadModalOpen(false)
    showToast('Document uploaded')
    if (modalMode === 'weld') {
      void loadWeldProcedures()
    } else {
      void loadDocuments()
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
      void loadDocuments()
    }
  }

  // ── Valve types ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    void (async () => {
      setTypesLoading(true)
      try {
        const map = await loadLookupOptionsMap()
        if (!cancelled) setValveTypes(map.valve_type ?? [])
      } catch {
        if (!cancelled) showToast('Could not load valve types')
      } finally {
        if (!cancelled) setTypesLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [showToast, typeReloadTick])

  const addValveType = async () => {
    const value = newValveType.trim()
    if (!value) { showToast('Enter a valve type name'); return }
    if (valveTypes.some((t) => t.toLowerCase() === value.toLowerCase())) {
      showToast('Valve type already exists'); return
    }
    setAddingValveType(true)
    const maxSort = Math.max(valveTypes.length, 0)
    const { error } = await supabase.from('lookup_values').insert({
      category: 'valve_type', value, sort_order: maxSort + 1,
    })
    setAddingValveType(false)
    if (error) { showToast(`Could not add valve type: ${error.message}`); return }
    setNewValveType('')
    setTypeReloadTick((n) => n + 1)
    setSelectedValveType(value)
    setScope('valve_type')
    showToast('Valve type added')
  }

  const scopeLabel = scope === 'general' ? 'General' : selectedValveType || 'Valve type'
  const modalTitle = modalMode === 'weld' ? 'Add weld procedure' : `Upload document — ${scopeLabel}`

  return (
    <section className="dashboard-page resources-page">
      <div className="dashboard-title-row admin-page-heading">
        <h2 className="dashboard-title">Resources</h2>
        <Link to="/dashboard" className="button-secondary">Back</Link>
      </div>

      <p className="placeholder-copy resources-intro">
        Manage weld procedures, valve-type documents, and shared resources.
      </p>

      {/* ── Weld Procedures ─────────────────────────────────────────────── */}
      <section className="dashboard-panel resources-panel">
        <h3>Weld procedures</h3>
        <p className="placeholder-copy resources-hint">
          All weld procedure specifications (WPS). Filter by type or process.
        </p>
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
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>WPS Type</th>
                <th>Processes</th>
                <th>Filler Metal</th>
                <th>Notes</th>
                <th>File</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleWeldRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.title}</td>
                  <td>{row.wps_type ?? '-'}</td>
                  <td>{row.weld_processes?.length ? row.weld_processes.join(', ') : '-'}</td>
                  <td>{row.filler_metal ?? '-'}</td>
                  <td className="table-cell-clamp">{row.notes || '-'}</td>
                  <td>
                    <a href={resourceDocumentPublicUrl(row.storage_path)} target="_blank" rel="noreferrer">
                      {row.file_name}
                    </a>
                  </td>
                  <td>{new Date(row.updated_at).toLocaleDateString()}</td>
                  <td>
                    <button type="button" className="button-secondary admin-list-btn danger" onClick={() => void removeDocument(row)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!weldLoading && visibleWeldRows.length === 0 ? (
                <tr><td colSpan={8} className="table-empty-cell">No weld procedures found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Resource Documents (no weld procedures) ──────────────────────── */}
      <section className="dashboard-panel resources-panel">
        <h3>Resource documents</h3>
        <p className="placeholder-copy resources-hint">
          Upload and manage QC docs, IOMs, maintenance manuals, and other files.
        </p>
        <div className="report-filters">
          <label>
            Section
            <select value={scope} onChange={(e) => setScope(e.target.value as ResourceDocumentScope)}>
              <option value="general">General</option>
              <option value="valve_type">Valve type</option>
            </select>
          </label>
          {scope === 'valve_type' ? (
            <label>
              Valve type
              <select value={selectedValveType} onChange={(e) => setSelectedValveType(e.target.value)} disabled={typesLoading}>
                <option value="">— Select valve type —</option>
                {valveTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          ) : null}
          <label>
            Filter category
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as 'all' | ResourceDocumentCategory)}>
              <option value="all">All categories</option>
              {DOC_CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="button-secondary" onClick={() => void loadDocuments()} disabled={rowsLoading}>
            {rowsLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {tableMissing ? (
          <p className="resources-missing-table">
            The <code>resource_documents</code> table is not in your database yet. Run{' '}
            <code>supabase/migration-resources-documents.sql</code> in Supabase SQL Editor.
          </p>
        ) : null}

        <div className="resources-upload-trigger-row">
          <button
            type="button"
            className="button-primary"
            onClick={openGeneralUploadModal}
            disabled={scope === 'valve_type' && !selectedValveType.trim()}
          >
            + Add resource document
          </button>
          {scope === 'valve_type' && !selectedValveType.trim() ? (
            <span className="resources-upload-hint">Select a valve type above first</span>
          ) : null}
        </div>

        <p className="status-breakdown-note">
          Showing {rows.length} document(s) for {scopeLabel}.
        </p>
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Section</th>
                <th>File</th>
                <th>Notes</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.title}</td>
                  <td>{DOC_CATEGORY_OPTIONS.find((c) => c.value === row.category)?.label ?? row.category}</td>
                  <td>{row.scope === 'general' ? 'General' : row.valve_type ?? '-'}</td>
                  <td>
                    <a href={resourceDocumentPublicUrl(row.storage_path)} target="_blank" rel="noreferrer">
                      {row.file_name}
                    </a>
                  </td>
                  <td className="table-cell-clamp">{row.notes || '-'}</td>
                  <td>{new Date(row.updated_at).toLocaleDateString()}</td>
                  <td>
                    <button type="button" className="button-secondary admin-list-btn danger" onClick={() => void removeDocument(row)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!rowsLoading && rows.length === 0 ? (
                <tr><td colSpan={7} className="table-empty-cell">No documents found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Add valve type ───────────────────────────────────────────────── */}
      <section className="dashboard-panel resources-panel">
        <h3>Add valve type</h3>
        <p className="placeholder-copy resources-hint">New types appear in Resources and job dropdowns.</p>
        <div className="report-filters">
          <label>
            Valve type name
            <input
              type="text"
              value={newValveType}
              onChange={(e) => setNewValveType(e.target.value)}
              placeholder="e.g. Triple Offset Butterfly"
            />
          </label>
          <button type="button" className="button-primary" disabled={addingValveType || typesLoading} onClick={() => void addValveType()}>
            {addingValveType ? 'Adding…' : 'Add valve type'}
          </button>
        </div>
      </section>

      <ValveTypeProceduresPanel key={typeReloadTick} variant="page" />

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
                  <p className="resources-drop-types">PDF, Word, Excel, CSV, image — up to 40 MB</p>
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

              {/* Category selector only for general docs */}
              {modalMode === 'general' ? (
                <>
                  <label className="modal-label" htmlFor="upload-category">Category</label>
                  <select
                    id="upload-category"
                    className="modal-status-select"
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value as ResourceDocumentCategory)}
                    disabled={uploading}
                  >
                    {DOC_CATEGORY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
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
                </>
              ) : null}
            </div>

            <div className="technician-modal-footer">
              <button type="button" className="button-secondary" onClick={closeUploadModal} disabled={uploading}>
                Cancel
              </button>
              <button type="button" className="button-primary" onClick={() => void handleUpload()} disabled={uploading}>
                {uploading ? 'Uploading…' : modalMode === 'weld' ? 'Save weld procedure' : 'Upload document'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
