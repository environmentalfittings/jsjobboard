import { useState, type ChangeEvent } from 'react'
import {
  MAX_RECEIVED_VALVE_PHOTOS,
  type ReceivedValvePhotoDraft,
} from '../lib/receivedValveImages'
import { prepareReceivedValveImage } from '../lib/receivedValves'

type ReceivedValvePhotosEditorProps = {
  drafts: ReceivedValvePhotoDraft[]
  onChange: (drafts: ReceivedValvePhotoDraft[]) => void
  removedStoragePaths: string[]
  onRemovedStoragePathsChange: (paths: string[]) => void
  busy?: boolean
  emptyHint?: string
}

export function ReceivedValvePhotosEditor({
  drafts,
  onChange,
  removedStoragePaths,
  onRemovedStoragePathsChange,
  busy = false,
  emptyHint = 'No pictures on this entry yet.',
}: ReceivedValvePhotosEditorProps) {
  const [preparing, setPreparing] = useState(false)
  const atLimit = drafts.length >= MAX_RECEIVED_VALVE_PHOTOS

  const onFilesChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return

    const remaining = MAX_RECEIVED_VALVE_PHOTOS - drafts.length
    if (remaining <= 0) return

    setPreparing(true)
    try {
      const nextDrafts = [...drafts]
      for (const file of files.slice(0, remaining)) {
        const prepared = await prepareReceivedValveImage(file)
        if (!prepared.ok) continue
        nextDrafts.push({
          key: crypto.randomUUID(),
          url: prepared.dataUrl,
          name: prepared.file.name,
          file: prepared.file,
        })
      }
      onChange(nextDrafts)
    } finally {
      setPreparing(false)
    }
  }

  const removeDraft = (key: string) => {
    const draft = drafts.find((item) => item.key === key)
    if (draft?.storagePath && !removedStoragePaths.includes(draft.storagePath)) {
      onRemovedStoragePathsChange([...removedStoragePaths, draft.storagePath])
    }
    onChange(drafts.filter((item) => item.key !== key))
  }

  return (
    <div className="received-valves-image-wrap received-valves-span-full">
      <label>
        Pictures ({drafts.length}/{MAX_RECEIVED_VALVE_PHOTOS})
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => void onFilesChange(event)}
          disabled={busy || preparing || atLimit}
        />
      </label>
      <p className="status-breakdown-note">
        {preparing
          ? 'Preparing photos…'
          : atLimit
            ? `Maximum of ${MAX_RECEIVED_VALVE_PHOTOS} pictures reached. Remove one to add another.`
            : 'Take photos or choose from the library. Up to 4 pictures per valve. Large photos are compressed automatically.'}
      </p>
      {drafts.length ? (
        <div className="received-valves-photo-grid">
          {drafts.map((draft) => (
            <div key={draft.key} className="received-valves-image-preview">
              <img src={draft.url} alt={draft.name} />
              <div className="received-valves-image-meta">
                <span>{draft.name}</span>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => removeDraft(draft.key)}
                  disabled={busy || preparing}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="status-breakdown-note">{emptyHint}</p>
      )}
    </div>
  )
}
