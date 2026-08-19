export const MAX_RECEIVED_VALVE_PHOTOS = 4

export type ReceivedValveImage = {
  storage_path: string
  url: string
  file_name: string
}

export type ReceivedValvePhotoDraft = {
  key: string
  url: string
  name: string
  storagePath?: string | null
  file?: File | null
}

export function parseReceivedValveImages(raw: unknown): ReceivedValveImage[] {
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
    .filter((item): item is ReceivedValveImage => item != null)
    .slice(0, MAX_RECEIVED_VALVE_PHOTOS)
}

export function receivedValveImagesFromLegacyFields(row: {
  image_url?: string | null
  image_storage_path?: string | null
  image_name?: string | null
}): ReceivedValveImage[] {
  const url = typeof row.image_url === 'string' ? row.image_url.trim() : ''
  if (!url) return []
  return [
    {
      url,
      storage_path: typeof row.image_storage_path === 'string' ? row.image_storage_path : '',
      file_name: typeof row.image_name === 'string' && row.image_name.trim() ? row.image_name.trim() : 'Photo',
    },
  ]
}

export function mergeReceivedValveImages(
  imagesJson: unknown,
  legacy: {
    image_url?: string | null
    image_storage_path?: string | null
    image_name?: string | null
  },
): ReceivedValveImage[] {
  const parsed = parseReceivedValveImages(imagesJson)
  if (parsed.length) return parsed
  return receivedValveImagesFromLegacyFields(legacy)
}

export function receivedValveImagesToJson(images: ReceivedValveImage[]) {
  return images.slice(0, MAX_RECEIVED_VALVE_PHOTOS).map((image) => ({
    storage_path: image.storage_path,
    url: image.url,
    file_name: image.file_name,
  }))
}

export function legacyFieldsFromReceivedValveImages(images: ReceivedValveImage[]) {
  const first = images[0]
  return {
    imageDataUrl: first?.url ?? null,
    imageStoragePath: first?.storage_path ?? null,
    imageName: first?.file_name ?? null,
  }
}

export function draftsFromReceivedValveImages(images: ReceivedValveImage[]): ReceivedValvePhotoDraft[] {
  return images.map((image) => ({
    key: image.storage_path || image.url,
    url: image.url,
    name: image.file_name,
    storagePath: image.storage_path || null,
    file: null,
  }))
}

export function newPhotoDraft(file: File, dataUrl: string): ReceivedValvePhotoDraft {
  return {
    key: crypto.randomUUID(),
    url: dataUrl,
    name: file.name,
    file,
  }
}
