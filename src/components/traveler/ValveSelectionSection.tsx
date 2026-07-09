import { useEffect, useState } from 'react'
import { EmployeeInitialsInput } from '../EmployeeInitialsInput'
import { useToast } from '../ToastNotification'
import { supabase } from '../../lib/supabase'

type ValveSelectionSectionProps = {
  travelerId: string
  valveId: string
  onComplete: () => void
}

type PartStatus =
  | 'needed'
  | 'ordered'
  | 'received'
  | 'installed'
  | 'repair'
  | 'replace'
  | 'new'
  | 'other'

type TravelerPartRow = {
  id: string
  traveler_id: string
  valve_id: string
  part_name: string | null
  part_number: string | null
  quantity: number | null
  before_image_url: string | null
  after_image_url: string | null
  status: PartStatus | null
  notes: string | null
}

type NewPartDraft = {
  part_name: string
  part_number: string
  quantity: string
  status: PartStatus
  notes: string
  other_status_note: string
  before_file: File | null
  after_file: File | null
}

function emptyPartDraft(): NewPartDraft {
  return {
    part_name: '',
    part_number: '',
    quantity: '1',
    status: 'repair',
    notes: '',
    other_status_note: '',
    before_file: null,
    after_file: null,
  }
}

function formatSubmittedAt(value: string | null) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

export function ValveSelectionSection({ travelerId, valveId, onComplete }: ValveSelectionSectionProps) {
  const { showToast } = useToast()
  const TRAVELER_ATTACHMENTS_BUCKET = 'traveler-attachments'
  const MAX_BYTES = 20 * 1024 * 1024
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [partsBusy, setPartsBusy] = useState(false)
  const [selectionId, setSelectionId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [techInitials, setTechInitials] = useState('')
  const [isNa, setIsNa] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [parts, setParts] = useState<TravelerPartRow[]>([])
  const [showAddPart, setShowAddPart] = useState(false)
  const [newPart, setNewPart] = useState<NewPartDraft>(emptyPartDraft())

  const handleNewPartStatusChange = (value: PartStatus) => {
    if (value !== 'other') {
      setNewPart((prev) => ({ ...prev, status: value }))
      return
    }
    const response = window.prompt('Enter custom part action/comment (optional):', newPart.other_status_note || '')
    if (response === null) {
      setNewPart((prev) => ({ ...prev, status: 'other' }))
      return
    }
    setNewPart((prev) => ({ ...prev, status: 'other', other_status_note: response.trim() }))
  }

  const loadParts = async () => {
    const { data, error } = await supabase
      .from('traveler_parts')
      .select('id,traveler_id,valve_id,part_name,part_number,quantity,before_image_url,after_image_url,status,notes')
      .eq('traveler_id', travelerId)
      .order('created_at', { ascending: false })
    if (error) {
      showToast(`Could not load parts: ${error.message}`)
      setParts([])
      return
    }
    setParts((data ?? []) as TravelerPartRow[])
  }

  const extFromName = (name: string): string => {
    if (!name.includes('.')) return ''
    const ext = name.slice(name.lastIndexOf('.'))
    return ext.length <= 12 ? ext : ''
  }

  const uploadPartPhoto = async (file: File, kind: 'before' | 'after'): Promise<{ url: string; path: string }> => {
    if (file.size > MAX_BYTES) {
      throw new Error(`File too large: ${file.name} (max 20 MB)`)
    }
    const path = `${travelerId}/parts/${crypto.randomUUID()}-${kind}${extFromName(file.name)}`
    const { error: uploadError } = await supabase.storage.from(TRAVELER_ATTACHMENTS_BUCKET).upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    })
    if (uploadError) {
      throw new Error(uploadError.message || `Could not upload ${kind} image`)
    }
    const { data } = supabase.storage.from(TRAVELER_ATTACHMENTS_BUCKET).getPublicUrl(path)
    return { url: data.publicUrl, path }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('traveler_valve_selection')
        .select('id,notes,tech_initials,submitted_at,is_complete,is_na')
        .eq('traveler_id', travelerId)
        .maybeSingle()
      if (cancelled) return
      if (error) {
        showToast(`Could not load Valve Selection: ${error.message}`)
        setLoading(false)
        return
      }
      if (data) {
        setSelectionId(data.id as string)
        setNotes((data.notes as string | null) ?? '')
        setTechInitials((data.tech_initials as string | null) ?? '')
        setSubmittedAt((data.submitted_at as string | null) ?? null)
        setIsComplete(Boolean(data.is_complete))
        setIsNa(Boolean(data.is_na))
        setLocked(Boolean(data.is_complete))
      }
      await loadParts()
      if (cancelled) return
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [travelerId, showToast])

  const addPart = async () => {
    const name = newPart.part_name.trim()
    if (!name) {
      showToast('Part Name is required.')
      return
    }
    const qtyNum = Number.parseInt(newPart.quantity, 10)
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      showToast('Quantity must be a positive number.')
      return
    }
    setPartsBusy(true)
    const uploadedPaths: string[] = []
    let beforeImageUrl: string | null = null
    let afterImageUrl: string | null = null
    try {
      if (newPart.before_file) {
        const uploaded = await uploadPartPhoto(newPart.before_file, 'before')
        beforeImageUrl = uploaded.url
        uploadedPaths.push(uploaded.path)
      }
      if (newPart.after_file) {
        const uploaded = await uploadPartPhoto(newPart.after_file, 'after')
        afterImageUrl = uploaded.url
        uploadedPaths.push(uploaded.path)
      }

      const mergedNotes = [newPart.notes.trim(), newPart.status === 'other' ? newPart.other_status_note.trim() : '']
        .filter(Boolean)
        .join(' | ')
      const { error } = await supabase
        .from('traveler_parts')
        .upsert(
          {
            id: crypto.randomUUID(),
            traveler_id: travelerId,
            valve_id: valveId,
            part_name: name,
            part_number: newPart.part_number.trim() || null,
            quantity: qtyNum,
            before_image_url: beforeImageUrl,
            after_image_url: afterImageUrl,
            status: newPart.status,
            notes: mergedNotes || null,
          },
          { onConflict: 'id' },
        )
      if (error) {
        if (uploadedPaths.length > 0) {
          await supabase.storage.from(TRAVELER_ATTACHMENTS_BUCKET).remove(uploadedPaths)
        }
        throw new Error(error.message)
      }
      setNewPart(emptyPartDraft())
      setShowAddPart(false)
      await loadParts()
      showToast('Part added')
    } catch (error) {
      showToast(error instanceof Error ? `Could not add part: ${error.message}` : 'Could not add part')
    } finally {
      setPartsBusy(false)
    }
  }

  const deletePart = async (partId: string) => {
    if (!window.confirm('Remove this part row?')) return
    setPartsBusy(true)
    const { error } = await supabase.from('traveler_parts').delete().eq('id', partId)
    setPartsBusy(false)
    if (error) {
      showToast(`Could not delete part: ${error.message}`)
      return
    }
    await loadParts()
    showToast('Part removed')
  }

  const submitValveSelection = async () => {
    if (!isNa && !techInitials.trim()) {
      showToast('Tech initials are required before submit.')
      return
    }
    setSaving(true)
    const payload = {
      traveler_id: travelerId,
      valve_id: valveId,
      notes: isNa ? null : notes.trim() || null,
      tech_initials: techInitials.trim().slice(0, 6).toUpperCase() || null,
      is_na: isNa,
      is_complete: true,
      submitted_at: new Date().toISOString(),
    }
    const result = await supabase
      .from('traveler_valve_selection')
      .upsert(
        {
          id: selectionId ?? crypto.randomUUID(),
          ...payload,
        },
        { onConflict: 'id' },
      )
      .select('id,submitted_at')
      .single()
    setSaving(false)
    if (result.error) {
      showToast(`Could not submit Valve Selection: ${result.error.message}`)
      return
    }
    const saved = result.data as { id: string; submitted_at: string | null }
    setSelectionId(saved.id)
    setSubmittedAt(saved.submitted_at ?? null)
    setTechInitials(payload.tech_initials ?? '')
    setIsComplete(true)
    setLocked(true)
    showToast('Valve Selection submitted')
    onComplete()
  }

  if (loading) {
    return <p className="status-breakdown-note">Loading Valve Selection...</p>
  }

  return (
    <section className="traveler-basic-section">
      {isComplete ? (
        <div className="traveler-basic-complete-banner">
          <span aria-hidden>✅</span>
          <span>
            Valve Selection submitted
            {techInitials ? ` by ${techInitials}` : ''}
            {submittedAt ? ` on ${formatSubmittedAt(submittedAt)}` : ''}
          </span>
          <button type="button" className="button-secondary" onClick={() => setLocked((prev) => !prev)}>
            {locked ? 'Edit' : 'Lock'}
          </button>
        </div>
      ) : null}

      <div className="traveler-basic-card">
        <div className="traveler-section-head-row">
          <h4 className="traveler-basic-subtitle">Valve Selection</h4>
          <label className="traveler-na-toggle">
            <input
              type="checkbox"
              checked={isNa}
              onChange={(e) => setIsNa(e.target.checked)}
              disabled={locked || saving}
            />{' '}
            N/A
          </label>
        </div>

        {isNa ? (
          <p className="status-breakdown-note">N/A is selected. This section will be marked complete on submit.</p>
        ) : (
          <>
            <label className="traveler-textarea-label">
              Valve Selection Notes
              <textarea
                className="new-job-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={locked || saving}
              />
            </label>

            <div className="traveler-parts-header">
              <h5>Parts</h5>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setShowAddPart((prev) => !prev)}
                disabled={locked || saving || partsBusy}
              >
                {showAddPart ? 'Cancel' : 'Add Part'}
              </button>
            </div>

            {showAddPart ? (
              <div className="traveler-parts-inline-form">
                <input
                  placeholder="Part Name"
                  value={newPart.part_name}
                  onChange={(e) => setNewPart((prev) => ({ ...prev, part_name: e.target.value }))}
                  disabled={partsBusy || locked || saving}
                />
                <input
                  placeholder="Part #"
                  value={newPart.part_number}
                  onChange={(e) => setNewPart((prev) => ({ ...prev, part_number: e.target.value }))}
                  disabled={partsBusy || locked || saving}
                />
                <input
                  type="number"
                  min={1}
                  placeholder="Qty"
                  value={newPart.quantity}
                  onChange={(e) => setNewPart((prev) => ({ ...prev, quantity: e.target.value }))}
                  disabled={partsBusy || locked || saving}
                />
                <select
                  value={newPart.status}
                  onChange={(e) => handleNewPartStatusChange(e.target.value as PartStatus)}
                  disabled={partsBusy || locked || saving}
                >
                  <option value="repair">Repair</option>
                  <option value="replace">Replace</option>
                  <option value="new">New</option>
                  <option value="other">Other...</option>
                </select>
                <input
                  placeholder="Notes"
                  value={newPart.notes}
                  onChange={(e) => setNewPart((prev) => ({ ...prev, notes: e.target.value }))}
                  disabled={partsBusy || locked || saving}
                />
                <label className="traveler-part-file-field">
                  Before image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setNewPart((prev) => ({ ...prev, before_file: e.target.files?.[0] ?? null }))}
                    disabled={partsBusy || locked || saving}
                  />
                </label>
                <label className="traveler-part-file-field">
                  After image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setNewPart((prev) => ({ ...prev, after_file: e.target.files?.[0] ?? null }))}
                    disabled={partsBusy || locked || saving}
                  />
                </label>
                <button type="button" className="button-primary" onClick={() => void addPart()} disabled={partsBusy || locked || saving}>
                  {partsBusy ? 'Saving...' : 'Save Part'}
                </button>
              </div>
            ) : null}

            <div className="traveler-parts-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Part Name</th>
                    <th>Part #</th>
                    <th>Qty</th>
                    <th>Status</th>
                    <th>Notes</th>
                    <th>Before</th>
                    <th>After</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {parts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="traveler-parts-empty">
                        No parts added yet.
                      </td>
                    </tr>
                  ) : (
                    parts.map((part) => (
                      <tr key={part.id}>
                        <td>{part.part_name ?? '-'}</td>
                        <td>{part.part_number ?? '-'}</td>
                        <td>{part.quantity ?? '-'}</td>
                        <td>{part.status ?? '-'}</td>
                        <td>{part.notes ?? '-'}</td>
                        <td>
                          {part.before_image_url ? (
                            <a href={part.before_image_url} target="_blank" rel="noreferrer">
                              View
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td>
                          {part.after_image_url ? (
                            <a href={part.after_image_url} target="_blank" rel="noreferrer">
                              View
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="valve-attachment-remove"
                            onClick={() => void deletePart(part.id)}
                            disabled={locked || saving || partsBusy}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="traveler-basic-card traveler-basic-submit-row">
        <EmployeeInitialsInput
          value={techInitials}
          onChange={setTechInitials}
          disabled={locked || saving}
        />
        <button type="button" className="button-primary" onClick={() => void submitValveSelection()} disabled={locked || saving}>
          {saving ? 'Submitting...' : 'Submit Valve Selection'}
        </button>
      </div>
    </section>
  )
}
