import type { SpecDocumentType } from '../types/manufacturerSpec'
import { supabase } from './supabase'

export const SPEC_DOCUMENTS_BUCKET = 'spec-documents'
export const SPEC_SIGNED_URL_TTL_SEC = 3600

const MAX_BYTES = 40 * 1024 * 1024

export const SPEC_DOC_TYPES: { value: SpecDocumentType; label: string }[] = [
  { value: 'spring_chart', label: 'Spring chart' },
  { value: 'catalog', label: 'Catalog' },
  { value: 'maintenance_manual', label: 'Maintenance manual' },
  { value: 'critical_dimensions', label: 'Critical dimensions' },
  { value: 'code', label: 'Code' },
  { value: 'national_board', label: 'National Board' },
  { value: 'bulletin', label: 'Bulletin' },
]

export type ManufacturerOption = {
  id: string
  name: string
  /** Display label including aliases, e.g. "Anderson Greenwood (A.G., AG, AG.)" */
  label: string
  aliases: string[]
}

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

export async function loadManufacturerOptions(): Promise<{
  options: ManufacturerOption[]
  error: string | null
}> {
  const [{ data: manufacturers, error: mfgErr }, { data: aliases, error: aliasErr }] = await Promise.all([
    supabase
      .from('manufacturers')
      .select('id,name,is_active')
      .order('name', { ascending: true }),
    supabase.from('manufacturer_aliases').select('manufacturer_id,alias_text,normalized_alias'),
  ])

  if (mfgErr) return { options: [], error: mfgErr.message }
  if (aliasErr) return { options: [], error: aliasErr.message }

  const aliasByMfg = new Map<string, string[]>()
  for (const row of aliases ?? []) {
    const mfgId = String(row.manufacturer_id)
    const alias = String(row.alias_text ?? '').trim()
    if (!alias) continue
    const list = aliasByMfg.get(mfgId) ?? []
    if (!list.some((a) => a.toLowerCase() === alias.toLowerCase())) list.push(alias)
    aliasByMfg.set(mfgId, list)
  }

  const options: ManufacturerOption[] = (manufacturers ?? [])
    .filter((row) => row.is_active !== false)
    .map((row) => {
      const id = String(row.id)
      const name = String(row.name ?? '').trim()
      const aliasList = (aliasByMfg.get(id) ?? []).filter(
        (a) => a.toLowerCase() !== name.toLowerCase(),
      )
      const label = aliasList.length > 0 ? `${name} (${aliasList.join(', ')})` : name
      return { id, name, label, aliases: aliasList }
    })

  return { options, error: null }
}

export async function createSpecDocumentSignedUrl(
  storagePath: string,
  expiresIn = SPEC_SIGNED_URL_TTL_SEC,
): Promise<{ url: string | null; error: string | null }> {
  const path = storagePath.trim()
  if (!path) return { url: null, error: 'Missing storage path.' }

  const { data, error } = await supabase.storage
    .from(SPEC_DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresIn)

  if (error || !data?.signedUrl) {
    return { url: null, error: error?.message || 'Could not create signed URL.' }
  }
  return { url: data.signedUrl, error: null }
}

export async function uploadReliefValveSpecBook(args: {
  file: File
  title: string
  notes?: string
  manufacturerId: string
  manufacturerName: string
  productValveType?: string | null
  docType?: SpecDocumentType | ''
  editionLabel?: string
  revisionLabel?: string
  effectiveDate?: string | null
  pageCount?: number | null
}): Promise<{ error: string | null; resourceId?: number }> {
  const title = args.title.trim()
  const manufacturerId = args.manufacturerId.trim()
  const manufacturerName = args.manufacturerName.trim()

  if (!title) return { error: 'Title is required.' }
  if (!manufacturerId) return { error: 'Manufacturer is required.' }
  if (args.file.size > MAX_BYTES) return { error: 'File is too large (max 40 MB).' }

  const mfgToken = safePathToken(manufacturerName) || safePathToken(manufacturerId) || 'mfg'
  const storagePath = `spec-books/${mfgToken}/${crypto.randomUUID()}${fileExt(args.file.name)}`

  const { error: uploadErr } = await supabase.storage
    .from(SPEC_DOCUMENTS_BUCKET)
    .upload(storagePath, args.file, {
      contentType: args.file.type || undefined,
      upsert: false,
    })
  if (uploadErr) return { error: uploadErr.message || 'Upload failed.' }

  const { data: resourceRow, error: resourceErr } = await supabase
    .from('resource_documents')
    .insert({
      scope: 'general',
      valve_type: null,
      category: 'relief_valve_spec_book',
      title,
      notes: (args.notes ?? '').trim(),
      storage_path: storagePath,
      file_name: args.file.name.slice(0, 500),
      mime_type: args.file.type || null,
      manufacturer: manufacturerName || null,
      product_valve_type: (args.productValveType ?? '').trim() || null,
    })
    .select('id')
    .single()

  if (resourceErr || !resourceRow) {
    await supabase.storage.from(SPEC_DOCUMENTS_BUCKET).remove([storagePath])
    const isdup = resourceErr?.code === '23505' || /duplicate|unique/i.test(resourceErr?.message ?? '')
    return {
      error: isdup
        ? `A document named "${title}" already exists in this section. Each title must be unique.`
        : resourceErr?.message || 'Could not save library row.',
    }
  }

  const docType = args.docType
  if (docType) {
    const pageCount =
      args.pageCount != null && Number.isFinite(args.pageCount) && args.pageCount > 0
        ? Math.floor(args.pageCount)
        : null

    const { error: specErr } = await supabase.from('spec_documents').insert({
      manufacturer_id: manufacturerId,
      resource_document_id: resourceRow.id,
      title,
      doc_type: docType,
      edition_label: (args.editionLabel ?? '').trim() || null,
      revision_label: (args.revisionLabel ?? '').trim() || null,
      effective_date: args.effectiveDate || null,
      page_count: pageCount,
      status: 'active',
    })

    if (specErr) {
      return {
        error: `Library saved, but catalog failed: ${specErr.message}`,
        resourceId: resourceRow.id as number,
      }
    }
  }

  return { error: null, resourceId: resourceRow.id as number }
}

export async function deleteSpecDocumentStorage(storagePath: string): Promise<{ error: string | null }> {
  const { error } = await supabase.storage.from(SPEC_DOCUMENTS_BUCKET).remove([storagePath])
  if (error) return { error: error.message || 'Could not remove file.' }
  return { error: null }
}
