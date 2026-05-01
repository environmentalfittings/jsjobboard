import { supabase } from './supabase'

export const RESOURCE_DOCS_BUCKET = 'valve-attachments'

export type ResourceDocumentScope = 'general' | 'valve_type'
export type ResourceDocumentCategory =
  | 'general'
  | 'weld_procedure'
  | 'quality_control'
  | 'iom'
  | 'maintenance_manual'
  | 'other'

export const WPS_TYPES = ['Joint', 'Corrosion Resistant Overlay', 'Hardface Overlay'] as const
export type WpsType = (typeof WPS_TYPES)[number]

export const WELD_PROCESSES = ['GTAW', 'GMAW', 'SMAW', 'SAW', 'FCAW'] as const
export type WeldProcess = (typeof WELD_PROCESSES)[number]

export type ResourceDocumentRow = {
  id: number
  scope: ResourceDocumentScope
  valve_type: string | null
  category: ResourceDocumentCategory
  title: string
  notes: string
  storage_path: string
  file_name: string
  mime_type: string | null
  created_at: string
  updated_at: string
  // Weld procedure fields
  wps_type: WpsType | null
  weld_processes: WeldProcess[]
  filler_metal: string | null
}

const MAX_BYTES = 40 * 1024 * 1024

function safePathToken(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function fileExt(name: string) {
  const idx = name.lastIndexOf('.')
  if (idx < 0) return ''
  const ext = name.slice(idx).toLowerCase()
  return ext.length <= 12 ? ext : ''
}

export function resourceDocumentPublicUrl(storagePath: string) {
  const { data } = supabase.storage.from(RESOURCE_DOCS_BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

export async function uploadResourceDocument(args: {
  file: File
  scope: ResourceDocumentScope
  valveType?: string | null
  category: ResourceDocumentCategory
  title: string
  notes?: string
  wpsType?: WpsType | null
  weldProcesses?: WeldProcess[]
  fillerMetal?: string
}): Promise<{ error: string | null }> {
  const { file, scope, category } = args
  const title = args.title.trim()
  const valveType = (args.valveType ?? '').trim()
  const notes = (args.notes ?? '').trim()

  if (file.size > MAX_BYTES) return { error: 'File is too large (max 40 MB).' }
  if (!title) return { error: 'Title is required.' }
  if (scope === 'valve_type' && !valveType) return { error: 'Choose a valve type.' }

  const scopeFolder = scope === 'general' ? 'general' : `valve-type/${safePathToken(valveType) || 'unknown'}`
  const storagePath = `resources/${scopeFolder}/${crypto.randomUUID()}${fileExt(file.name)}`

  const { error: uploadErr } = await supabase.storage.from(RESOURCE_DOCS_BUCKET).upload(storagePath, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (uploadErr) return { error: uploadErr.message || 'Upload failed.' }

  const isWeld = category === 'weld_procedure'
  const { error: rowErr } = await supabase.from('resource_documents').insert({
    scope,
    valve_type: scope === 'general' ? null : valveType,
    category,
    title,
    notes,
    storage_path: storagePath,
    file_name: file.name.slice(0, 500),
    mime_type: file.type || null,
    wps_type: isWeld ? (args.wpsType ?? null) : null,
    weld_processes: isWeld ? (args.weldProcesses ?? []) : [],
    filler_metal: isWeld ? ((args.fillerMetal ?? '').trim() || null) : null,
  })

  if (rowErr) {
    await supabase.storage.from(RESOURCE_DOCS_BUCKET).remove([storagePath])
    return { error: rowErr.message || 'Could not save document record.' }
  }

  return { error: null }
}

export async function deleteResourceDocument(row: {
  id: number
  storage_path: string
}): Promise<{ error: string | null }> {
  const { error: storageErr } = await supabase.storage.from(RESOURCE_DOCS_BUCKET).remove([row.storage_path])
  if (storageErr) return { error: storageErr.message || 'Could not remove file.' }

  const { error: dbErr } = await supabase.from('resource_documents').delete().eq('id', row.id)
  if (dbErr) return { error: dbErr.message || 'Could not remove document row.' }

  return { error: null }
}
