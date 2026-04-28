import type { Attachment, AttachmentParentType, AttachmentTag } from '../types'

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      reject(new Error(`File is too large (max ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB)`))
      return
    }
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Failed to read file'))
    r.readAsDataURL(file)
  })
}

export function makeAttachment(input: {
  parentId: string
  parentType: AttachmentParentType
  file: File
  tag?: AttachmentTag
}): Promise<Attachment> {
  return readFileAsDataUrl(input.file).then((data) => ({
    id: crypto.randomUUID(),
    parentId: input.parentId,
    parentType: input.parentType,
    fileName: input.file.name,
    fileSize: input.file.size,
    mimeType: input.file.type || 'application/octet-stream',
    data,
    uploadedAt: new Date().toISOString(),
    tag: input.tag ?? 'other',
  }))
}

export function openAttachmentData(a: Attachment): void {
  window.open(a.data, '_blank', 'noopener,noreferrer')
}
