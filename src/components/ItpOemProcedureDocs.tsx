import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useToast } from './ToastNotification'
import {
  iomProcedureKindLabel,
  listIomAndProcedureDocuments,
  resourceDocumentMatchesQuery,
  resourceDocumentPublicUrl,
  uploadResourceDocument,
  type ResourceDocumentCategory,
  type ResourceDocumentRow,
} from '../lib/resourceDocuments'
import type { ItpLinkedResourceDoc } from '../types/itpLibraryPlan'

type Props = {
  docs: ItpLinkedResourceDoc[]
  onChange: (next: ItpLinkedResourceDoc[]) => void
  valveType?: string
  readOnly?: boolean
}

function toLinked(row: Pick<ResourceDocumentRow, 'id' | 'title' | 'category' | 'file_name' | 'storage_path'>): ItpLinkedResourceDoc {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    fileName: row.file_name,
    storagePath: row.storage_path,
  }
}

let cachedList: Promise<{ rows: ResourceDocumentRow[]; error: string | null }> | null = null

function loadDocs(force = false) {
  if (force || !cachedList) cachedList = listIomAndProcedureDocuments()
  return cachedList
}

export function ItpOemProcedureDocs({ docs, onChange, valveType = '', readOnly = false }: Props) {
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const radioName = useId()
  const [library, setLibrary] = useState<ResourceDocumentRow[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [uploadKind, setUploadKind] = useState<'iom' | 'procedure'>('iom')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadDocs().then((result) => {
      if (cancelled) return
      if (result.error) showToast(`Could not load IOMs / Procedures: ${result.error}`)
      setLibrary(result.rows)
    })
    return () => {
      cancelled = true
    }
  }, [showToast])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const linkedIds = useMemo(() => new Set(docs.map((row) => row.id)), [docs])
  const suggestions = useMemo(() => {
    const q = query.trim()
    const rows = library.filter((row) => !linkedIds.has(row.id))
    const matched = q ? rows.filter((row) => resourceDocumentMatchesQuery(row, q)) : rows
    const preferred = valveType.trim().toLowerCase()
    const ranked = preferred
      ? [...matched].sort((a, b) => {
          const aHit = String(a.product_valve_type ?? a.valve_type ?? '').toLowerCase() === preferred ? 0 : 1
          const bHit = String(b.product_valve_type ?? b.valve_type ?? '').toLowerCase() === preferred ? 0 : 1
          if (aHit !== bHit) return aHit - bHit
          return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
        })
      : matched
    return ranked.slice(0, 12)
  }, [library, linkedIds, query, valveType])

  const attach = (row: ItpLinkedResourceDoc) => {
    if (linkedIds.has(row.id)) return
    onChange([...docs, row])
    setQuery('')
    setOpen(false)
  }

  const addFile = async (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file || uploading) return
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    if (!isPdf) {
      showToast('Please choose a PDF')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setUploading(true)
    try {
      const category: ResourceDocumentCategory = uploadKind === 'iom' ? 'iom' : 'general'
      const title = file.name.replace(/\.[^.]+$/, '').trim() || file.name
      const result = await uploadResourceDocument({
        file,
        scope: 'general',
        category,
        title,
        productValveType: valveType.trim() || null,
      })
      if (result.error || !result.row) {
        showToast(result.error || 'Could not add that PDF to Resources')
        return
      }
      cachedList = null
      const refreshed = await loadDocs(true)
      setLibrary(refreshed.rows)
      attach(toLinked(result.row))
      showToast(`Added to ${uploadKind === 'iom' ? 'IOMs' : 'Procedures'} and linked to this step`)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div
      className="itp-oem-docs"
      ref={wrapRef}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="itp-oem-docs-hdr">
        <span>IOM / Procedure PDFs</span>
        <span className="itp-oem-docs-hint">From Resources</span>
      </div>
      {docs.length === 0 ? (
        <p className="itp-oem-docs-empty">Pull an IOM or shop procedure, or add a new PDF.</p>
      ) : (
        <ul className="itp-oem-docs-list">
          {docs.map((doc) => (
            <li key={doc.id}>
              <a href={resourceDocumentPublicUrl(doc.storagePath)} target="_blank" rel="noreferrer">
                {doc.title}
              </a>
              <span className="itp-oem-docs-kind">{iomProcedureKindLabel(doc.category)}</span>
              {readOnly ? null : (
                <button
                  type="button"
                  className="link-button-danger"
                  onClick={() => onChange(docs.filter((row) => row.id !== doc.id))}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {readOnly ? null : (
        <div className="itp-oem-docs-add">
          <input
            type="search"
            value={query}
            placeholder="Search IOMs and Procedures…"
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
          />
          {open && suggestions.length > 0 ? (
            <ul className="itp-oem-docs-suggest" role="listbox">
              {suggestions.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => attach(toLinked(row))}>
                    <span>{row.title}</span>
                    <span>
                      {iomProcedureKindLabel(row.category)}
                      {row.manufacturer ? ` · ${row.manufacturer}` : ''}
                      {row.sop_number ? ` · ${row.sop_number}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="itp-oem-docs-upload">
            <label>
              <input
                type="radio"
                name={radioName}
                checked={uploadKind === 'iom'}
                onChange={() => setUploadKind('iom')}
              />
              Add to IOMs
            </label>
            <label>
              <input
                type="radio"
                name={radioName}
                checked={uploadKind === 'procedure'}
                onChange={() => setUploadKind('procedure')}
              />
              Add to Procedures
            </label>
            <button
              type="button"
              className="button-secondary"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? 'Uploading…' : 'Add PDF'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(e) => void addFile(e.target.files)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
