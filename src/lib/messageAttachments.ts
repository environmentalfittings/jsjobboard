import { supabase } from './supabase'
import { VALVE_ATTACHMENTS_BUCKET } from './valveAttachments'

export const MAX_MESSAGE_ATTACHMENTS = 3
const MAX_BYTES = 10 * 1024 * 1024

export type MessageAttachment = {
  storage_path: string
  url: string
  file_name: string
  content_type: string
}

function extFromName(name: string): string {
  if (!name.includes('.')) return ''
  const ext = name.slice(name.lastIndexOf('.'))
  return ext.length <= 12 ? ext : ''
}

export function isMessageAttachmentFile(file: File): boolean {
  return (
    file.type.startsWith('image/') ||
    file.type === 'application/pdf' ||
    /\.(jpe?g|png|gif|webp|bmp|heic|pdf)$/i.test(file.name)
  )
}

export function parseMessageAttachments(raw: unknown): MessageAttachment[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      if (typeof row.storage_path !== 'string' || typeof row.url !== 'string') return null
      return {
        storage_path: row.storage_path,
        url: row.url,
        file_name: typeof row.file_name === 'string' ? row.file_name : 'Attachment',
        content_type: typeof row.content_type === 'string' ? row.content_type : 'application/octet-stream',
      }
    })
    .filter((item): item is MessageAttachment => item != null)
    .slice(0, MAX_MESSAGE_ATTACHMENTS)
}

export async function uploadMessageAttachment(
  messageId: number,
  file: File,
): Promise<{ attachment: MessageAttachment | null; error: string | null }> {
  if (file.size > MAX_BYTES) {
    return { attachment: null, error: 'File is too large (max 10 MB)' }
  }
  if (!isMessageAttachmentFile(file)) {
    return { attachment: null, error: 'Please choose an image or PDF file' }
  }

  const path = `messages/${messageId}/${crypto.randomUUID()}${extFromName(file.name)}`
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
      storage_path: path,
      url: data.publicUrl,
      file_name: file.name.slice(0, 500),
      content_type: file.type || 'application/octet-stream',
    },
    error: null,
  }
}
