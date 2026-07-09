import { supabase } from './supabase'
import { VALVE_ATTACHMENTS_BUCKET } from './valveAttachments'
import type { ItpPlanPartPhoto } from '../types/itpPlan'

const MAX_BYTES = 20 * 1024 * 1024

function extFromName(name: string): string {
  if (!name.includes('.')) return ''
  const ext = name.slice(name.lastIndexOf('.'))
  return ext.length <= 12 ? ext : ''
}

export async function uploadItpPartPhoto(
  valveRowId: number,
  partId: string,
  file: File,
): Promise<{ photo: ItpPlanPartPhoto | null; error: string | null }> {
  if (file.size > MAX_BYTES) {
    return { photo: null, error: 'File is too large (max 20 MB)' }
  }
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(file.name)) {
    return { photo: null, error: 'Please choose an image file' }
  }

  const path = `${valveRowId}/itp-parts/${partId}/${crypto.randomUUID()}${extFromName(file.name)}`
  const { error: uploadError } = await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (uploadError) {
    return { photo: null, error: uploadError.message || 'Upload failed' }
  }

  const { data } = supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).getPublicUrl(path)
  return {
    photo: {
      id: crypto.randomUUID(),
      fileName: file.name.slice(0, 500),
      url: data.publicUrl,
      storagePath: path,
      uploadedAt: new Date().toISOString(),
    },
    error: null,
  }
}

export async function deleteItpPartPhoto(photo: ItpPlanPartPhoto): Promise<{ error: string | null }> {
  const { error } = await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).remove([photo.storagePath])
  if (error) return { error: error.message || 'Could not remove photo' }
  return { error: null }
}
