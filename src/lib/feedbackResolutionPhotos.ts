import { supabase } from './supabase'
import { VALVE_ATTACHMENTS_BUCKET } from './valveAttachments'

export const MAX_FEEDBACK_RESOLUTION_PHOTOS = 3
const MAX_BYTES = 10 * 1024 * 1024

export type FeedbackResolutionImage = {
  storage_path: string
  url: string
  file_name: string
}

function extFromName(name: string): string {
  if (!name.includes('.')) return ''
  const ext = name.slice(name.lastIndexOf('.'))
  return ext.length <= 12 ? ext : ''
}

export function isFeedbackResolutionImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(file.name)
}

export function parseFeedbackResolutionImages(raw: unknown): FeedbackResolutionImage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      if (typeof row.storage_path !== 'string' || typeof row.url !== 'string') return null
      return {
        storage_path: row.storage_path,
        url: row.url,
        file_name: typeof row.file_name === 'string' ? row.file_name : 'Photo',
      }
    })
    .filter((item): item is FeedbackResolutionImage => item != null)
    .slice(0, MAX_FEEDBACK_RESOLUTION_PHOTOS)
}

export async function uploadFeedbackResolutionPhoto(
  feedbackId: number,
  file: File,
): Promise<{ image: FeedbackResolutionImage | null; error: string | null }> {
  if (file.size > MAX_BYTES) {
    return { image: null, error: 'Image is too large (max 10 MB)' }
  }
  if (!isFeedbackResolutionImageFile(file)) {
    return { image: null, error: 'Please choose an image file' }
  }

  const path = `feedback/${feedbackId}/${crypto.randomUUID()}${extFromName(file.name)}`
  const { error: uploadError } = await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (uploadError) {
    return { image: null, error: uploadError.message || 'Upload failed' }
  }

  const { data } = supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).getPublicUrl(path)
  return {
    image: {
      storage_path: path,
      url: data.publicUrl,
      file_name: file.name.slice(0, 500),
    },
    error: null,
  }
}

export async function deleteFeedbackResolutionPhotos(
  images: FeedbackResolutionImage[],
): Promise<{ error: string | null }> {
  if (!images.length) return { error: null }
  const paths = images.map((image) => image.storage_path)
  const { error } = await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).remove(paths)
  if (error) return { error: error.message || 'Could not remove photos' }
  return { error: null }
}
