import { supabase } from './supabase'
import { VALVE_ATTACHMENTS_BUCKET } from './valveAttachments'
import type { ItpLibraryAttachment } from '../types/itpLibraryPlan'

const MAX_BYTES = 20 * 1024 * 1024

function extFromName(name: string): string {
  if (!name.includes('.')) return ''
  const ext = name.slice(name.lastIndexOf('.'))
  return ext.length <= 12 ? ext : ''
}

export function isItpLibraryAttachmentFile(file: File): boolean {
  return (
    file.type.startsWith('image/') ||
    file.type === 'application/pdf' ||
    /\.(jpe?g|png|gif|webp|bmp|heic|pdf)$/i.test(file.name)
  )
}

export function isItpLibraryAttachmentImage(attachment: ItpLibraryAttachment): boolean {
  return (
    attachment.contentType.startsWith('image/') ||
    /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(attachment.fileName)
  )
}

export function isItpLibraryAttachmentPdf(attachment: ItpLibraryAttachment): boolean {
  return (
    attachment.contentType === 'application/pdf' || /\.pdf$/i.test(attachment.fileName)
  )
}

export async function uploadItpLibraryAttachment(
  valveRowId: number,
  file: File,
): Promise<{ attachment: ItpLibraryAttachment | null; error: string | null }> {
  if (file.size > MAX_BYTES) {
    return { attachment: null, error: 'File is too large (max 20 MB)' }
  }
  if (!isItpLibraryAttachmentFile(file)) {
    return { attachment: null, error: 'Please choose an image or PDF file' }
  }

  const path = `${valveRowId}/itp-library/${crypto.randomUUID()}${extFromName(file.name)}`
  const { error: uploadError } = await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (uploadError) {
    return { attachment: null, error: uploadError.message || 'Upload failed' }
  }

  const { data } = supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).getPublicUrl(path)
  return {
    attachment: {
      id: crypto.randomUUID(),
      fileName: file.name.slice(0, 500),
      url: data.publicUrl,
      storagePath: path,
      contentType: file.type || 'application/octet-stream',
      uploadedAt: new Date().toISOString(),
      caption: '',
    },
    error: null,
  }
}

/** Photos for a flagged checklist item (images only, max handled by caller). */
export async function uploadItpFlagPhoto(
  valveRowId: number,
  itemId: string,
  file: File,
): Promise<{ attachment: ItpLibraryAttachment | null; error: string | null }> {
  if (file.size > MAX_BYTES) {
    return { attachment: null, error: 'File is too large (max 20 MB)' }
  }
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(file.name)) {
    return { attachment: null, error: 'Please choose an image file' }
  }

  const path = `${valveRowId}/itp-library/flags/${itemId}/${crypto.randomUUID()}${extFromName(file.name)}`
  const { error: uploadError } = await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (uploadError) {
    return { attachment: null, error: uploadError.message || 'Upload failed' }
  }

  const { data } = supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).getPublicUrl(path)
  return {
    attachment: {
      id: crypto.randomUUID(),
      fileName: file.name.slice(0, 500),
      url: data.publicUrl,
      storagePath: path,
      contentType: file.type || 'application/octet-stream',
      uploadedAt: new Date().toISOString(),
      caption: '',
    },
    error: null,
  }
}

export async function deleteItpLibraryAttachment(
  attachment: ItpLibraryAttachment,
): Promise<{ error: string | null }> {
  const { error } = await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).remove([attachment.storagePath])
  if (error) return { error: error.message || 'Could not remove attachment' }
  return { error: null }
}
