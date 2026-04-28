import { useEffect, useMemo, useState } from 'react'
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
  uploadResourceDocument,
} from '../lib/resourceDocuments'
import { supabase } from '../lib/supabase'

export type { ValveTypeProcedureRow } from '../components/ValveTypeProceduresPanel'

const DOC_CATEGORY_OPTIONS: { value: ResourceDocumentCategory; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'weld_procedure', label: 'Weld procedure' },
  { value: 'quality_control', label: 'Quality control' },
  { value: 'iom', label: 'IOM' },
  { value: 'maintenance_manual', label: 'Maintenance manual' },
  { value: 'other', label: 'Other' },
]

export function ResourcesPage() {
  const { showToast } = useToast()

  const [valveTypes, setValveTypes] = useState<string[]>([])
  const [typesLoading, setTypesLoading] = useState(true)
  const [newValveType, setNewValveType] = useState('')
  const [addingValveType, setAddingValveType] = useState(false)
  const [typeReloadTick, setTypeReloadTick] = useState(0)

  const [scope, setScope] = useState<ResourceDocumentScope>('general')
  const [selectedValveType, setSelectedValveType] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | ResourceDocumentCategory>('all')
  const [rows, setRows] = useState<ResourceDocumentRow[]>([])
  const [rowsLoading, setRowsLoading] = useState(false)
  const [tableMissing, setTableMissing] = useState(false)

  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadNotes, setUploadNotes] = useState('')
  const [uploadCategory, setUploadCategory] = useState<ResourceDocumentCategory>('general')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

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
    return () => {
      cancelled = true
    }
  }, [showToast, typeReloadTick])

  const loadDocuments = async () => {
    if (scope === 'valve_type' && !selectedValveType.trim()) {
      setRows([])
      return
    }
    setRowsLoading(true)
    setTableMissing(false)
    let query = supabase
      .from('resource_documents')
      .select('id,scope,valve_type,category,title,notes,storage_path,file_name,mime_type,created_at,updated_at')
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

  const addValveType = async () => {
    const value = newValveType.trim()
    if (!value) {
      showToast('Enter a valve type name')
      return
    }
    if (valveTypes.some((t) => t.toLowerCase() === value.toLowerCase())) {
      showToast('Valve type already exists')
      return
    }
    setAddingValveType(true)
    const maxSort = Math.max(valveTypes.length, 0)
    const { error } = await supabase.from('lookup_values').insert({
      category: 'valve_type',
      value,
      sort_order: maxSort + 1,
    })
    setAddingValveType(false)
    if (error) {
      showToast(`Could not add valve type: ${error.message}`)
      return
    }
    setNewValveType('')
    setTypeReloadTick((n) => n + 1)
    setSelectedValveType(value)
    setScope('valve_type')
    showToast('Valve type added')
  }

  const handleUpload = async () => {
    if (!uploadFile) {
      showToast('Choose a file to upload')
      return
    }
    if (!uploadTitle.trim()) {
      showToast('Enter a document title')
      return
    }
    setUploading(true)
    const { error } = await uploadResourceDocument({
      file: uploadFile,
      scope,
      valveType: scope === 'valve_type' ? selectedValveType : null,
      category: uploadCategory,
      title: uploadTitle,
      notes: uploadNotes,
    })
    setUploading(false)
    if (error) {
      showToast(error)
      return
    }
    setUploadFile(null)
    setUploadTitle('')
    setUploadNotes('')
    showToast('Document uploaded')
    void loadDocuments()
  }

  const removeDocument = async (row: ResourceDocumentRow) => {
    if (!window.confirm(`Delete "${row.title}"?`)) return
    const { error } = await deleteResourceDocument({ id: row.id, storage_path: row.storage_path })
    if (error) {
      showToast(error)
      return
    }
    showToast('Document deleted')
    void loadDocuments()
  }

  const scopeLabel = scope === 'general' ? 'General' : selectedValveType || 'Valve type'
  const visibleRows = useMemo(() => rows, [rows])

  return (
    <section className="dashboard-page resources-page">
      <div className="dashboard-title-row admin-page-heading">
        <h2 className="dashboard-title">Resources</h2>
        <Link to="/dashboard" className="button-secondary">
          Back
        </Link>
      </div>

      <p className="placeholder-copy resources-intro">
        Manage valve-type procedures plus shared documents. Use <strong>General</strong> for weld/QC docs, and valve-type
        sections for IOMs and maintenance manuals.
      </p>

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

      <section className="dashboard-panel resources-panel">
        <h3>Resource documents</h3>
        <p className="placeholder-copy resources-hint">
          Upload and manage files for <strong>General</strong> or a specific valve type.
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
                {valveTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Filter category
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'all' | ResourceDocumentCategory)}
            >
              <option value="all">All categories</option>
              {DOC_CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
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

        <div className="resources-add-block">
          <h3 className="resources-add-heading">Upload document ({scopeLabel})</h3>
          <div className="report-filters">
            <label>
              Title
              <input
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="e.g. WPS-017 Carbon Weld Procedure"
              />
            </label>
            <label>
              Category
              <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value as ResourceDocumentCategory)}>
                {DOC_CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              File
              <input
                type="file"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.gif"
              />
            </label>
            <label>
              Notes (optional)
              <input type="text" value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} />
            </label>
            <button
              type="button"
              className="button-primary"
              onClick={() => void handleUpload()}
              disabled={uploading || (scope === 'valve_type' && !selectedValveType.trim())}
            >
              {uploading ? 'Uploading…' : 'Upload document'}
            </button>
          </div>
        </div>

        <p className="status-breakdown-note">
          Showing {visibleRows.length} document(s) for {scopeLabel}.
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
              {visibleRows.map((row) => (
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
                  <td>{new Date(row.updated_at).toLocaleString()}</td>
                  <td>
                    <button type="button" className="button-secondary admin-list-btn danger" onClick={() => void removeDocument(row)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ValveTypeProceduresPanel key={typeReloadTick} variant="page" />
    </section>
  )
}
