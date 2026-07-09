import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { EmployeeInitialsInput } from '../EmployeeInitialsInput'
import { useToast } from '../ToastNotification'

type PartsOrderedSectionProps = {
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
  supplier: string | null
  ordered_date: string | null
  received_date: string | null
  status: PartStatus | null
}

type NewPartDraft = {
  part_name: string
  part_number: string
  quantity: string
  supplier: string
  ordered_date: string
  received_date: string
  status: PartStatus
}

function emptyPartDraft(): NewPartDraft {
  return {
    part_name: '',
    part_number: '',
    quantity: '1',
    supplier: '',
    ordered_date: '',
    received_date: '',
    status: 'repair',
  }
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

export function PartsOrderedSection({ travelerId, valveId, onComplete }: PartsOrderedSectionProps) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [partsBusy, setPartsBusy] = useState(false)
  const [rowId, setRowId] = useState<string | null>(null)
  const [isNa, setIsNa] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [locked, setLocked] = useState(false)
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [techInitials, setTechInitials] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [parts, setParts] = useState<TravelerPartRow[]>([])
  const [showAddPart, setShowAddPart] = useState(false)
  const [newPart, setNewPart] = useState<NewPartDraft>(emptyPartDraft())

  const persistSection = async (next: { is_na: boolean; is_complete: boolean; submitted_at: string | null; tech_initials: string | null }) => {
    const payload = {
      traveler_id: travelerId,
      valve_id: valveId,
      is_na: next.is_na,
      is_complete: next.is_complete,
      submitted_at: next.submitted_at,
      tech_initials: next.tech_initials,
      order_notes: next.is_na ? null : orderNotes.trim() || null,
    }
    const result = await supabase
      .from('traveler_parts_ordered')
      .upsert(
        {
          id: rowId ?? crypto.randomUUID(),
          ...payload,
        },
        { onConflict: 'id' },
      )
      .select('id,submitted_at')
      .single()
    if (result.error) throw result.error
    const data = result.data as { id: string; submitted_at: string | null }
    setRowId(data.id)
    setSubmittedAt(data.submitted_at ?? null)
  }

  const loadParts = async () => {
    const { data, error } = await supabase
      .from('traveler_parts')
      .select('id,traveler_id,valve_id,part_name,part_number,quantity,supplier,ordered_date,received_date,status')
      .eq('traveler_id', travelerId)
      .order('created_at', { ascending: false })
    if (error) {
      showToast(`Could not load parts: ${error.message}`)
      setParts([])
      return
    }
    setParts((data ?? []) as TravelerPartRow[])
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const [sectionRes] = await Promise.all([
        supabase
          .from('traveler_parts_ordered')
          .select('id,is_na,is_complete,submitted_at,tech_initials,order_notes')
          .eq('traveler_id', travelerId)
          .maybeSingle(),
      ])
      if (cancelled) return

      if (sectionRes.error) {
        showToast(`Could not load Parts Ordered: ${sectionRes.error.message}`)
      } else if (sectionRes.data) {
        setRowId(sectionRes.data.id as string)
        setIsNa(Boolean(sectionRes.data.is_na))
        setIsComplete(Boolean(sectionRes.data.is_complete))
        setLocked(Boolean(sectionRes.data.is_complete))
        setSubmittedAt((sectionRes.data.submitted_at as string | null) ?? null)
        setTechInitials((sectionRes.data.tech_initials as string | null) ?? '')
        setOrderNotes((sectionRes.data.order_notes as string | null) ?? '')
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
          supplier: newPart.supplier.trim() || null,
          ordered_date: newPart.ordered_date || null,
          received_date: newPart.received_date || null,
          status: newPart.status,
        },
        { onConflict: 'id' },
      )
    setPartsBusy(false)
    if (error) {
      showToast(`Could not add part: ${error.message}`)
      return
    }
    setNewPart(emptyPartDraft())
    setShowAddPart(false)
    await loadParts()
    showToast('Part added')
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

  const updatePart = async (
    partId: string,
    patch: Partial<{
      part_name: string | null
      part_number: string | null
      quantity: number | null
      supplier: string | null
      ordered_date: string | null
      received_date: string | null
      status: TravelerPartRow['status']
    }>,
  ) => {
    if (locked || saving || partsBusy) return
    const { error } = await supabase.from('traveler_parts').update(patch).eq('id', partId)
    if (error) {
      showToast(`Could not update part: ${error.message}`)
      return
    }
    setParts((prev) => prev.map((part) => (part.id === partId ? { ...part, ...patch } : part)))
  }

  const handleNaToggle = async (checked: boolean) => {
    setIsNa(checked)
    if (!checked || locked) return
    setSaving(true)
    try {
      const submitted = new Date().toISOString()
      await persistSection({ is_na: true, is_complete: true, submitted_at: submitted, tech_initials: null })
      setIsComplete(true)
      setLocked(true)
      showToast('Parts Ordered marked N/A and complete')
      onComplete()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save N/A')
    } finally {
      setSaving(false)
    }
  }

  const submit = async () => {
    if (!isNa && !techInitials.trim()) {
      showToast('Tech initials are required before submit.')
      return
    }
    setSaving(true)
    try {
      const submitted = new Date().toISOString()
      const initials = isNa ? null : techInitials.trim().slice(0, 6).toUpperCase()
      await persistSection({ is_na: isNa, is_complete: true, submitted_at: submitted, tech_initials: initials })
      setTechInitials(initials ?? '')
      setIsComplete(true)
      setLocked(true)
      showToast('Parts Ordered submitted')
      onComplete()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not submit Parts Ordered')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="status-breakdown-note">Loading Parts Ordered...</p>

  return (
    <section className="traveler-basic-section">
      {isComplete ? (
        <div className="traveler-basic-complete-banner">
          <span aria-hidden>✅</span>
          <span>
            Parts Ordered submitted
            {techInitials ? ` by ${techInitials}` : ''}
            {submittedAt ? ` on ${formatDateLabel(submittedAt)}` : ''}
          </span>
          <button type="button" className="button-secondary" onClick={() => setLocked((p) => !p)}>
            {locked ? 'Edit' : 'Lock'}
          </button>
        </div>
      ) : null}

      <div className="traveler-basic-card">
        <div className="traveler-section-head-row">
          <h4 className="traveler-basic-subtitle">Parts Ordered</h4>
          <label className="traveler-na-toggle">
            <input type="checkbox" checked={isNa} onChange={(e) => void handleNaToggle(e.target.checked)} disabled={locked || saving} /> N/A
          </label>
        </div>

        {isNa ? null : (
          <>
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
              <div className="traveler-parts-inline-form traveler-parts-inline-form--ordered">
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
                <input
                  placeholder="Supplier"
                  value={newPart.supplier}
                  onChange={(e) => setNewPart((prev) => ({ ...prev, supplier: e.target.value }))}
                  disabled={partsBusy || locked || saving}
                />
                <input
                  type="date"
                  value={newPart.ordered_date}
                  onChange={(e) => setNewPart((prev) => ({ ...prev, ordered_date: e.target.value }))}
                  disabled={partsBusy || locked || saving}
                />
                <input
                  type="date"
                  value={newPart.received_date}
                  onChange={(e) => setNewPart((prev) => ({ ...prev, received_date: e.target.value }))}
                  disabled={partsBusy || locked || saving}
                />
                <select
                  value={newPart.status}
                  onChange={(e) => setNewPart((prev) => ({ ...prev, status: e.target.value as NewPartDraft['status'] }))}
                  disabled={partsBusy || locked || saving}
                >
                  <option value="repair">Repair</option>
                  <option value="replace">Replace</option>
                  <option value="new">New</option>
                  <option value="other">Other</option>
                  <option value="needed">Needed</option>
                  <option value="ordered">Ordered</option>
                  <option value="received">Received</option>
                  <option value="installed">Installed</option>
                </select>
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
                    <th>Supplier</th>
                    <th>Order Date</th>
                    <th>Received Date</th>
                    <th>Status</th>
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
                        <td>
                          <input
                            value={part.part_name ?? ''}
                            onChange={(e) => setParts((prev) => prev.map((p) => (p.id === part.id ? { ...p, part_name: e.target.value } : p)))}
                            onBlur={(e) => void updatePart(part.id, { part_name: e.target.value.trim() || null })}
                            disabled={locked || saving || partsBusy}
                          />
                        </td>
                        <td>
                          <input
                            value={part.part_number ?? ''}
                            onChange={(e) => setParts((prev) => prev.map((p) => (p.id === part.id ? { ...p, part_number: e.target.value } : p)))}
                            onBlur={(e) => void updatePart(part.id, { part_number: e.target.value.trim() || null })}
                            disabled={locked || saving || partsBusy}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            value={part.quantity ?? 0}
                            onChange={(e) =>
                              setParts((prev) =>
                                prev.map((p) => (p.id === part.id ? { ...p, quantity: Number.parseInt(e.target.value || '0', 10) || 0 } : p)),
                              )
                            }
                            onBlur={(e) => void updatePart(part.id, { quantity: Number.parseInt(e.target.value || '0', 10) || null })}
                            disabled={locked || saving || partsBusy}
                          />
                        </td>
                        <td>
                          <input
                            value={part.supplier ?? ''}
                            onChange={(e) => setParts((prev) => prev.map((p) => (p.id === part.id ? { ...p, supplier: e.target.value } : p)))}
                            onBlur={(e) => void updatePart(part.id, { supplier: e.target.value.trim() || null })}
                            disabled={locked || saving || partsBusy}
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            value={part.ordered_date ?? ''}
                            onChange={(e) => setParts((prev) => prev.map((p) => (p.id === part.id ? { ...p, ordered_date: e.target.value } : p)))}
                            onBlur={(e) => void updatePart(part.id, { ordered_date: e.target.value || null })}
                            disabled={locked || saving || partsBusy}
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            value={part.received_date ?? ''}
                            onChange={(e) => setParts((prev) => prev.map((p) => (p.id === part.id ? { ...p, received_date: e.target.value } : p)))}
                            onBlur={(e) => void updatePart(part.id, { received_date: e.target.value || null })}
                            disabled={locked || saving || partsBusy}
                          />
                        </td>
                        <td>
                          <select
                            value={part.status ?? 'needed'}
                            onChange={(e) => {
                              const value = e.target.value as TravelerPartRow['status']
                              setParts((prev) => prev.map((p) => (p.id === part.id ? { ...p, status: value } : p)))
                              void updatePart(part.id, { status: value })
                            }}
                            disabled={locked || saving || partsBusy}
                          >
                            <option value="repair">repair</option>
                            <option value="replace">replace</option>
                            <option value="new">new</option>
                            <option value="other">other</option>
                            <option value="needed">needed</option>
                            <option value="ordered">ordered</option>
                            <option value="received">received</option>
                            <option value="installed">installed</option>
                          </select>
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

            <label className="traveler-textarea-label">
              Order Notes
              <textarea className="new-job-textarea" value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} disabled={locked || saving} />
            </label>
          </>
        )}
      </div>

      <div className="traveler-basic-card traveler-basic-submit-row">
        <EmployeeInitialsInput value={techInitials} onChange={setTechInitials} disabled={locked || saving} />
        <button type="button" className="button-primary" onClick={() => void submit()} disabled={locked || saving}>
          {saving ? 'Submitting...' : 'Submit Parts Ordered'}
        </button>
      </div>
    </section>
  )
}
