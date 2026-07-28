import { supabase } from './supabase'
import { attachmentPublicUrl, VALVE_ATTACHMENTS_BUCKET } from './valveAttachments'

export const MAX_MESSAGE_ATTACHMENTS = 3
const MAX_BYTES = 10 * 1024 * 1024
const SIGNED_URL_TTL_SEC = 60 * 60 * 24

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

function inferUploadContentType(file: File): string | undefined {
  if (file.type && file.type !== 'application/octet-stream') return file.type
  const lower = file.name.toLowerCase()
  if (/\.jpe?g$/.test(lower)) return 'image/jpeg'
  if (/\.png$/.test(lower)) return 'image/png'
  if (/\.gif$/.test(lower)) return 'image/gif'
  if (/\.webp$/.test(lower)) return 'image/webp'
  if (/\.bmp$/.test(lower)) return 'image/bmp'
  if (/\.heic$/.test(lower)) return 'image/heic'
  if (/\.heif$/.test(lower)) return 'image/heif'
  if (/\.pdf$/.test(lower)) return 'application/pdf'
  return undefined
}

function normalizeAttachmentRow(row: Record<string, unknown>): MessageAttachment | null {
  const storagePath =
    typeof row.storage_path === 'string'
      ? row.storage_path
      : typeof row.storagePath === 'string'
        ? row.storagePath
        : null
  if (!storagePath) return null

  const fileName =
    typeof row.file_name === 'string'
      ? row.file_name
      : typeof row.fileName === 'string'
        ? row.fileName
        : 'Attachment'
  const contentType =
    typeof row.content_type === 'string'
      ? row.content_type
      : typeof row.contentType === 'string'
        ? row.contentType
        : 'application/octet-stream'
  const storedUrl = typeof row.url === 'string' ? row.url.trim() : ''

  return {
    storage_path: storagePath,
    url: storedUrl || attachmentPublicUrl(storagePath),
    file_name: fileName,
    content_type: contentType,
  }
}

export function isMessageAttachmentFile(file: File): boolean {
  return (
    file.type.startsWith('image/') ||
    file.type === 'application/pdf' ||
    /\.(jpe?g|png|gif|webp|bmp|heic|heif|pdf)$/i.test(file.name)
  )
}

export function parseMessageAttachments(raw: unknown): MessageAttachment[] {
  let list: unknown = raw
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list) as unknown
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  return list
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      return normalizeAttachmentRow(item as Record<string, unknown>)
    })
    .filter((item): item is MessageAttachment => item != null)
    .slice(0, MAX_MESSAGE_ATTACHMENTS)
}

/** Load browser-safe URLs (signed when the bucket is private). */
export async function resolveMessageAttachmentUrls(
  attachments: MessageAttachment[],
): Promise<MessageAttachment[]> {
  if (!attachments.length) return attachments

  return Promise.all(
    attachments.map(async (attachment) => {
      const { data, error } = await supabase.storage
        .from(VALVE_ATTACHMENTS_BUCKET)
        .createSignedUrl(attachment.storage_path, SIGNED_URL_TTL_SEC)
      if (!error && data?.signedUrl) {
        return { ...attachment, url: data.signedUrl }
      }
      return { ...attachment, url: attachmentPublicUrl(attachment.storage_path) }
    }),
  )
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

  const contentType = inferUploadContentType(file)
  const path = `messages/${messageId}/${crypto.randomUUID()}${extFromName(file.name)}`
  const { error: uploadError } = await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).upload(path, file, {
    contentType,
    upsert: false,
  })
  if (uploadError) {
    return { attachment: null, error: uploadError.message || 'Upload failed' }
  }

  const publicUrl = attachmentPublicUrl(path)
  return {
    attachment: {
      storage_path: path,
      url: publicUrl,
      file_name: file.name.slice(0, 500),
      content_type: contentType || file.type || 'application/octet-stream',
    },
    error: null,
  }
}
