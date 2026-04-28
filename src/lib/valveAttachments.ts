import { supabase } from './supabase'

export const VALVE_ATTACHMENTS_BUCKET = 'valve-attachments'

const MAX_BYTES = 20 * 1024 * 1024

export function attachmentPublicUrl(storagePath: string) {
  const { data } = supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

export function isImageMime(mime: string | null, fileName?: string) {
  if (mime && mime.startsWith('image/')) return true
  if (fileName && /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(fileName)) return true
  return false
}

export async function uploadValveAttachment(
  valveRowId: number,
  file: File,
  kind: 'photo' | 'file',
): Promise<{ error: string | null }> {
  if (file.size > MAX_BYTES) {
    return { error: 'File is too large (max 20 MB)' }
  }

  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
  const safeExt = ext.length <= 12 ? ext : ''
  const path = `${valveRowId}/${crypto.randomUUID()}${safeExt}`

  const { error: upErr } = await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  })

  if (upErr) {
    return { error: upErr.message || 'Upload failed' }
  }

  const { error: rowErr } = await supabase.from('valve_attachments').insert({
    valve_row_id: valveRowId,
    storage_path: path,
    file_name: file.name.slice(0, 500),
    mime_type: file.type || null,
    kind,
  })

  if (rowErr) {
    await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).remove([path])
    return { error: rowErr.message || 'Could not save attachment record' }
  }

  return { error: null }
}

export async function deleteValveAttachment(row: {
  id: number
  storage_path: string
}): Promise<{ error: string | null }> {
  const { error: stErr } = await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).remove([row.storage_path])
  if (stErr) {
    return { error: stErr.message || 'Could not remove file' }
  }
  const { error: dbErr } = await supabase.from('valve_attachments').delete().eq('id', row.id)
  if (dbErr) {
    return { error: dbErr.message || 'Could not remove attachment' }
  }
  return { error: null }
}
