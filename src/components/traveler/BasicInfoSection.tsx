import { useEffect, useMemo, useRef, useState } from 'react'
import { EmployeeInitialsInput } from '../EmployeeInitialsInput'
import { useToast } from '../ToastNotification'
import { supabase } from '../../lib/supabase'
import type { TravelerBasicInfo } from '../../types/traveler'

type BasicInfoSectionProps = {
  travelerId: string
  valveId: string
  valveTypeId: string
  onComplete: () => void
}

type TravelerAttachmentType = 'image_before' | 'image_after' | 'qa_doc'

type TravelerAttachmentRow = {
  id: string
  traveler_id: string
  valve_id: string
  file_type: TravelerAttachmentType | 'additional_doc' | 'weld_cert' | 'pmi_report'
  file_name: string
  file_url: string
  uploaded_at: string
}

type BasicInfoFormState = {
  customer: string
  salesman: string
  purchase_order_no: string
  customer_valve_id: string
  location_id: string
  manufacturer_name: string
  due_date: string
  manufacturer_sn: string
  pressure: string
  size: string
  outlet_connection: 'RF' | 'RTJ' | 'BW' | 'FF' | 'Other' | ''
  figure_number: string
  drawing_number: string
  operator: 'Handwheel' | 'Lever' | 'Bare stem' | 'Gear Op.' | 'Air Act.' | 'Electric Act.' | ''
  valve_condition: 'Repairable' | 'Unrepairable' | ''
  junked_reason: string
  notes: string
  material_id: Record<string, string>
  pmi_required: boolean | null
  pmi_attached: boolean | null
  tech_initials: string
}

const TYPE_LABELS: Record<string, string> = {
  a: 'Lubricated Plug Valve',
  b: 'Non Lubricated Plug Valve',
  c: 'Orbit Valve',
  d: 'Piston Check',
  f: 'Pressure Seal Check Valve',
  g: 'Pressure Seal Gate Valve',
  h: 'Pressure Seal Globe Valve',
  i: 'Twinseal',
  j: 'Pipeline Gate',
  k: 'Angle Globe Valve',
  l: 'Check Valve',
  m: 'Gate Valve',
  n: 'Globe Valve',
  o: 'Ball Valve',
  p: 'Wedge Plug',
  q: 'Delayed Coker - Isolation Ball Valve',
  r: 'Relief Valve - VR Traveler',
  s: 'Relief Valve - TO Traveler',
  t: 'Manufacturing Traveler',
}

const MATERIAL_FIELDS: Record<string, Array<{ key: string; label: string }>> = {
  b: [
    { key: 'body', label: 'Body' },
    { key: 'seat', label: 'Seat' },
    { key: 'diaphragm', label: 'Diaphragm' },
    { key: 'top_cap', label: 'Top Cap' },
    { key: 'thrust_collar', label: 'Thrust Collar' },
    { key: 'metal_diaphragm', label: 'Metal Diaphragm' },
    { key: 'plug', label: 'Plug' },
    { key: 'adjuster', label: 'Adjuster' },
  ],
  l: [
    { key: 'body', label: 'Body' },
    { key: 'clapper', label: 'Clapper' },
    { key: 'clapper_nut', label: 'Clapper Nut' },
    { key: 'top_cap', label: 'Top Cap' },
    { key: 'seat', label: 'Seat' },
    { key: 'pin', label: 'Pin' },
    { key: 'clapper_arm', label: 'Clapper Arm' },
  ],
  m: [
    { key: 'body', label: 'Body' },
    { key: 'wedge', label: 'Wedge' },
    { key: 'stem', label: 'Stem' },
    { key: 'seat_rings', label: 'Seat Rings' },
    { key: 'bonnet', label: 'Bonnet' },
  ],
  n: [
    { key: 'body', label: 'Body' },
    { key: 'disc', label: 'Disc' },
    { key: 'stem', label: 'Stem' },
    { key: 'seat_ring', label: 'Seat Ring' },
    { key: 'bonnet', label: 'Bonnet' },
  ],
  o: [
    { key: 'body', label: 'Body' },
    { key: 'ball', label: 'Ball' },
    { key: 'stem', label: 'Stem' },
    { key: 'seats', label: 'Seats' },
    { key: 'end_caps', label: 'End Caps' },
  ],
  a: [
    { key: 'body', label: 'Body' },
    { key: 'seat', label: 'Seat' },
    { key: 'plug', label: 'Plug' },
    { key: 'top_cap', label: 'Top Cap' },
    { key: 'lubricant', label: 'Lubricant' },
  ],
  i: [
    { key: 'body', label: 'Body' },
    { key: 'seats', label: 'Seats' },
    { key: 'stem', label: 'Stem' },
    { key: 'end_connections', label: 'End Connections' },
  ],
  c: [
    { key: 'body', label: 'Body' },
    { key: 'plug', label: 'Plug' },
    { key: 'seat_rings', label: 'Seat Rings' },
    { key: 'stem', label: 'Stem' },
    { key: 'top_cap', label: 'Top Cap' },
  ],
  d: [
    { key: 'body', label: 'Body' },
    { key: 'piston', label: 'Piston' },
    { key: 'spring', label: 'Spring' },
    { key: 'seat', label: 'Seat' },
    { key: 'cover', label: 'Cover' },
  ],
  f: [
    { key: 'body', label: 'Body' },
    { key: 'clapper', label: 'Clapper' },
    { key: 'seat', label: 'Seat' },
    { key: 'bonnet', label: 'Bonnet' },
  ],
  g: [
    { key: 'body', label: 'Body' },
    { key: 'wedge', label: 'Wedge' },
    { key: 'stem', label: 'Stem' },
    { key: 'seat_rings', label: 'Seat Rings' },
    { key: 'bonnet', label: 'Bonnet' },
  ],
  h: [
    { key: 'body', label: 'Body' },
    { key: 'disc', label: 'Disc' },
    { key: 'stem', label: 'Stem' },
    { key: 'seat_ring', label: 'Seat Ring' },
    { key: 'bonnet', label: 'Bonnet' },
  ],
  j: [
    { key: 'body', label: 'Body' },
    { key: 'wedge', label: 'Wedge' },
    { key: 'stem', label: 'Stem' },
    { key: 'seat_rings', label: 'Seat Rings' },
    { key: 'bonnet', label: 'Bonnet' },
  ],
  k: [
    { key: 'body', label: 'Body' },
    { key: 'disc', label: 'Disc' },
    { key: 'stem', label: 'Stem' },
    { key: 'seat_ring', label: 'Seat Ring' },
    { key: 'bonnet', label: 'Bonnet' },
  ],
  p: [
    { key: 'body', label: 'Body' },
    { key: 'plug', label: 'Plug' },
    { key: 'stem', label: 'Stem' },
    { key: 'seats', label: 'Seats' },
    { key: 'top_cap', label: 'Top Cap' },
  ],
  q: [
    { key: 'body', label: 'Body' },
    { key: 'ball', label: 'Ball' },
    { key: 'stem', label: 'Stem' },
    { key: 'seats', label: 'Seats' },
    { key: 'end_caps', label: 'End Caps' },
  ],
  r: [
    { key: 'body', label: 'Body' },
    { key: 'nozzle', label: 'Nozzle' },
    { key: 'disc', label: 'Disc' },
    { key: 'spring', label: 'Spring' },
    { key: 'spindle', label: 'Spindle' },
  ],
  s: [
    { key: 'body', label: 'Body' },
    { key: 'nozzle', label: 'Nozzle' },
    { key: 'disc', label: 'Disc' },
    { key: 'spring', label: 'Spring' },
    { key: 'spindle', label: 'Spindle' },
  ],
  t: [
    { key: 'body', label: 'Body' },
    { key: 'bonnet', label: 'Bonnet' },
    { key: 'trim', label: 'Trim' },
  ],
}

const TRAVELER_ATTACHMENTS_BUCKET = 'traveler-attachments'
const MAX_BYTES = 20 * 1024 * 1024

function emptyForm(): BasicInfoFormState {
  return {
    customer: '',
    salesman: '',
    purchase_order_no: '',
    customer_valve_id: '',
    location_id: '',
    manufacturer_name: '',
    due_date: '',
    manufacturer_sn: '',
    pressure: '',
    size: '',
    outlet_connection: '',
    figure_number: '',
    drawing_number: '',
    operator: '',
    valve_condition: '',
    junked_reason: '',
    notes: '',
    material_id: {},
    pmi_required: null,
    pmi_attached: null,
    tech_initials: '',
  }
}

function toText(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function toMaterialObject(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
    out[key] = typeof value === 'string' ? value : ''
  }
  return out
}

function toNullableBool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

function extFromName(name: string): string {
  if (!name.includes('.')) return ''
  const ext = name.slice(name.lastIndexOf('.'))
  return ext.length <= 12 ? ext : ''
}

export function BasicInfoSection({ travelerId, valveId, valveTypeId, onComplete }: BasicInfoSectionProps) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingType, setUploadingType] = useState<TravelerAttachmentType | null>(null)
  const [form, setForm] = useState<BasicInfoFormState>(emptyForm())
  const [rowId, setRowId] = useState<string | null>(null)
  const [isComplete, setIsComplete] = useState(false)
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<TravelerAttachmentRow[]>([])
  const [locked, setLocked] = useState(false)

  const beforeInputRef = useRef<HTMLInputElement>(null)
  const afterInputRef = useRef<HTMLInputElement>(null)
  const qaDocInputRef = useRef<HTMLInputElement>(null)

  const materialFields = useMemo(() => MATERIAL_FIELDS[valveTypeId] ?? [], [valveTypeId])
  const typeLabel = TYPE_LABELS[valveTypeId] ?? `Type ${valveTypeId}`

  const loadAttachments = async () => {
    const { data, error } = await supabase
      .from('traveler_attachments')
      .select('id,traveler_id,valve_id,file_type,file_name,file_url,uploaded_at')
      .eq('traveler_id', travelerId)
      .order('uploaded_at', { ascending: false })

    if (error) {
      showToast('Could not load traveler attachments')
      setAttachments([])
      return
    }
    setAttachments((data ?? []) as TravelerAttachmentRow[])
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('traveler_basic_info')
        .select('*')
        .eq('traveler_id', travelerId)
        .maybeSingle()
      if (cancelled) return
      if (error) {
        showToast(`Could not load Basic Information: ${error.message}`)
        setLoading(false)
        return
      }
      if (data) {
        const row = data as TravelerBasicInfo & { created_at?: string; updated_at?: string }
        setRowId(row.id)
        setIsComplete(Boolean(row.is_complete))
        setSubmittedAt(row.submitted_at)
        setLocked(Boolean(row.is_complete))
        setForm({
          customer: toText(row.customer),
          salesman: toText(row.salesman),
          purchase_order_no: toText(row.purchase_order_no),
          customer_valve_id: toText(row.customer_valve_id),
          location_id: toText(row.location_id),
          manufacturer_name: toText(row.manufacturer_name),
          due_date: toText(row.due_date),
          manufacturer_sn: toText(row.manufacturer_sn),
          pressure: toText(row.pressure),
          size: toText(row.size),
          outlet_connection: (row.outlet_connection ?? '') as BasicInfoFormState['outlet_connection'],
          figure_number: toText(row.figure_number),
          drawing_number: toText(row.drawing_number),
          operator: (row.operator ?? '') as BasicInfoFormState['operator'],
          valve_condition: (row.valve_condition ?? '') as BasicInfoFormState['valve_condition'],
          junked_reason: toText(row.junked_reason),
          notes: toText(row.notes),
          material_id: toMaterialObject(row.material_id),
          pmi_required: toNullableBool(row.pmi_required),
          pmi_attached: toNullableBool(row.pmi_attached),
          tech_initials: toText(row.tech_initials),
        })
      }
      await loadAttachments()
      if (cancelled) return
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [travelerId, showToast])

  const setField = <K extends keyof BasicInfoFormState>(key: K, value: BasicInfoFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const setMaterialField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, material_id: { ...prev.material_id, [key]: value } }))
  }

  const groupedAttachments = useMemo(() => {
    return {
      image_before: attachments.filter((a) => a.file_type === 'image_before'),
      image_after: attachments.filter((a) => a.file_type === 'image_after'),
      qa_doc: attachments.filter((a) => a.file_type === 'qa_doc'),
    }
  }, [attachments])

  const handleUpload = async (type: TravelerAttachmentType, files: FileList | null) => {
    if (!files?.length || locked || uploadingType) return
    setUploadingType(type)
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) {
          showToast(`File too large: ${file.name} (max 20 MB)`)
          continue
        }
        const storagePath = `${travelerId}/${type}/${crypto.randomUUID()}${extFromName(file.name)}`
        const { error: uploadError } = await supabase.storage.from(TRAVELER_ATTACHMENTS_BUCKET).upload(storagePath, file, {
          contentType: file.type || undefined,
          upsert: false,
        })
        if (uploadError) {
          showToast(uploadError.message || `Upload failed: ${file.name}`)
          continue
        }
        const { data } = supabase.storage.from(TRAVELER_ATTACHMENTS_BUCKET).getPublicUrl(storagePath)
        const { error: rowError } = await supabase
          .from('traveler_attachments')
          .upsert(
            {
              id: crypto.randomUUID(),
              traveler_id: travelerId,
              valve_id: valveId,
              file_type: type,
              file_name: file.name.slice(0, 500),
              file_url: data.publicUrl,
              file_size: file.size,
            },
            { onConflict: 'id' },
          )
        if (rowError) {
          await supabase.storage.from(TRAVELER_ATTACHMENTS_BUCKET).remove([storagePath])
          showToast(rowError.message || `Could not save attachment: ${file.name}`)
        }
      }
      await loadAttachments()
    } finally {
      setUploadingType(null)
      if (beforeInputRef.current) beforeInputRef.current.value = ''
      if (afterInputRef.current) afterInputRef.current.value = ''
      if (qaDocInputRef.current) qaDocInputRef.current.value = ''
    }
  }

  const submitPart1 = async () => {
    if (!form.tech_initials.trim()) {
      showToast('Tech initials are required before submit.')
      return
    }
    setSaving(true)
    const payload = {
      traveler_id: travelerId,
      valve_id: valveId,
      customer: form.customer.trim() || null,
      salesman: form.salesman.trim() || null,
      purchase_order_no: form.purchase_order_no.trim() || null,
      customer_valve_id: form.customer_valve_id.trim() || null,
      location_id: form.location_id.trim() || null,
      manufacturer_name: form.manufacturer_name.trim() || null,
      due_date: form.due_date || null,
      manufacturer_sn: form.manufacturer_sn.trim() || null,
      pressure: form.pressure.trim() || null,
      size: form.size.trim() || null,
      outlet_connection: form.outlet_connection || null,
      figure_number: form.figure_number.trim() || null,
      drawing_number: form.drawing_number.trim() || null,
      operator: form.operator || null,
      valve_condition: form.valve_condition || null,
      junked_reason: form.valve_condition === 'Unrepairable' ? form.junked_reason.trim() || null : null,
      notes: form.notes.trim() || null,
      material_id: form.material_id,
      pmi_required: form.pmi_required,
      pmi_attached: form.pmi_attached,
      tech_initials: form.tech_initials.trim().slice(0, 6).toUpperCase(),
      is_complete: true,
      submitted_at: new Date().toISOString(),
    }

    const result = await supabase
      .from('traveler_basic_info')
      .upsert(
        {
          id: rowId ?? crypto.randomUUID(),
          ...payload,
        },
        { onConflict: 'id' },
      )
      .select('id,submitted_at')
      .single()

    setSaving(false)
    if (result.error) {
      showToast(`Could not submit Part 1: ${result.error.message}`)
      return
    }
    const saved = result.data as { id: string; submitted_at: string | null }
    setRowId(saved.id)
    setSubmittedAt(saved.submitted_at ?? null)
    setIsComplete(true)
    setLocked(true)
    setForm((prev) => ({ ...prev, tech_initials: payload.tech_initials }))
    showToast('Part 1 submitted')
    onComplete()
  }

  if (loading) {
    return <p className="status-breakdown-note">Loading Basic Information...</p>
  }

  return (
    <section className="traveler-basic-section">
      {isComplete ? (
        <div className="traveler-basic-complete-banner">
          <span aria-hidden>✅</span>
          <span>
            Part 1 submitted{form.tech_initials ? ` by ${form.tech_initials}` : ''}{' '}
            {submittedAt ? `on ${formatDateLabel(submittedAt)}` : ''}
          </span>
          <button type="button" className="button-secondary" onClick={() => setLocked((prev) => !prev)}>
            {locked ? 'Edit' : 'Lock'}
          </button>
        </div>
      ) : null}

      <div className="traveler-basic-card">
        <h4 className="traveler-basic-subtitle">Basic Information</h4>
        <div className="new-job-form new-job-grid traveler-basic-grid">
          <label>
            Type
            <input value={typeLabel} readOnly disabled />
          </label>
          <label>
            Customer
            <input value={form.customer} onChange={(e) => setField('customer', e.target.value)} disabled={locked || saving} />
          </label>
          <label>
            J-S Valve ID
            <input value={valveId} readOnly disabled />
          </label>

          <label>
            Salesman
            <input value={form.salesman} onChange={(e) => setField('salesman', e.target.value)} disabled={locked || saving} />
          </label>
          <label>
            Purchase Order #
            <input
              value={form.purchase_order_no}
              onChange={(e) => setField('purchase_order_no', e.target.value)}
              disabled={locked || saving}
            />
          </label>
          <label>
            Customer ID
            <input
              value={form.customer_valve_id}
              onChange={(e) => setField('customer_valve_id', e.target.value)}
              disabled={locked || saving}
            />
          </label>

          <label>
            Location
            <input value={form.location_id} onChange={(e) => setField('location_id', e.target.value)} disabled={locked || saving} />
          </label>
          <label>
            Manufacturer
            <input
              value={form.manufacturer_name}
              onChange={(e) => setField('manufacturer_name', e.target.value)}
              disabled={locked || saving}
            />
          </label>
          <label>
            Due Date
            <input type="date" value={form.due_date} onChange={(e) => setField('due_date', e.target.value)} disabled={locked || saving} />
          </label>

          <label>
            Manufacturer S/N
            <input
              value={form.manufacturer_sn}
              onChange={(e) => setField('manufacturer_sn', e.target.value)}
              disabled={locked || saving}
            />
          </label>
          <label>
            Pressure
            <input value={form.pressure} onChange={(e) => setField('pressure', e.target.value)} disabled={locked || saving} />
          </label>
          <label>
            Size
            <input value={form.size} onChange={(e) => setField('size', e.target.value)} disabled={locked || saving} />
          </label>

          <label>
            Outlet Connection
            <select
              value={form.outlet_connection}
              onChange={(e) => setField('outlet_connection', e.target.value as BasicInfoFormState['outlet_connection'])}
              disabled={locked || saving}
            >
              <option value="">Select</option>
              <option value="RF">RF</option>
              <option value="RTJ">RTJ</option>
              <option value="BW">BW</option>
              <option value="FF">FF</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label>
            Figure Number
            <input value={form.figure_number} onChange={(e) => setField('figure_number', e.target.value)} disabled={locked || saving} />
          </label>
          <label>
            Drawing Number
            <input value={form.drawing_number} onChange={(e) => setField('drawing_number', e.target.value)} disabled={locked || saving} />
          </label>

          <label>
            Operator
            <select
              value={form.operator}
              onChange={(e) => setField('operator', e.target.value as BasicInfoFormState['operator'])}
              disabled={locked || saving}
            >
              <option value="">Select</option>
              <option value="Handwheel">Handwheel</option>
              <option value="Lever">Lever</option>
              <option value="Bare stem">Bare stem</option>
              <option value="Gear Op.">Gear Op.</option>
              <option value="Air Act.">Air Act.</option>
              <option value="Electric Act.">Electric Act.</option>
            </select>
          </label>
          <label>
            Valve Condition
            <select
              value={form.valve_condition}
              onChange={(e) => setField('valve_condition', e.target.value as BasicInfoFormState['valve_condition'])}
              disabled={locked || saving}
            >
              <option value="">Select</option>
              <option value="Repairable">Repairable</option>
              <option value="Unrepairable">Unrepairable</option>
            </select>
          </label>
          <div />

          {form.valve_condition === 'Unrepairable' ? (
            <label className="new-job-span-full">
              Junked Reason
              <textarea
                className="new-job-textarea"
                value={form.junked_reason}
                onChange={(e) => setField('junked_reason', e.target.value)}
                disabled={locked || saving}
              />
            </label>
          ) : null}

          <label className="new-job-span-full">
            Notes
            <textarea
              className="new-job-textarea"
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              disabled={locked || saving}
            />
          </label>
        </div>
      </div>

      <div className="traveler-basic-card">
        <h4 className="traveler-basic-subtitle">Material Identification</h4>
        <div className="new-job-form new-job-grid traveler-basic-grid">
          {materialFields.length > 0 ? (
            materialFields.map((field) => (
              <label key={field.key}>
                {field.label}
                <input
                  value={form.material_id[field.key] ?? ''}
                  onChange={(e) => setMaterialField(field.key, e.target.value)}
                  disabled={locked || saving}
                />
              </label>
            ))
          ) : (
            <label className="new-job-span-full">
              Material Notes
              <textarea
                className="new-job-textarea"
                value={form.material_id.material_notes ?? ''}
                onChange={(e) => setMaterialField('material_notes', e.target.value)}
                disabled={locked || saving}
              />
            </label>
          )}
        </div>

        <div className="traveler-radio-wrap">
          <div className="traveler-radio-row">
            <span className="traveler-radio-label">PMI Required</span>
            <label>
              <input
                type="radio"
                checked={form.pmi_required === true}
                onChange={() => setField('pmi_required', true)}
                disabled={locked || saving}
              />{' '}
              Yes
            </label>
            <label>
              <input
                type="radio"
                checked={form.pmi_required === false}
                onChange={() => setField('pmi_required', false)}
                disabled={locked || saving}
              />{' '}
              No
            </label>
          </div>
          <div className="traveler-radio-row">
            <span className="traveler-radio-label">PMI Attached</span>
            <label>
              <input
                type="radio"
                checked={form.pmi_attached === true}
                onChange={() => setField('pmi_attached', true)}
                disabled={locked || saving}
              />{' '}
              Yes
            </label>
            <label>
              <input
                type="radio"
                checked={form.pmi_attached === false}
                onChange={() => setField('pmi_attached', false)}
                disabled={locked || saving}
              />{' '}
              No
            </label>
          </div>
        </div>
      </div>

      <div className="traveler-basic-card">
        <h4 className="traveler-basic-subtitle">Attachments</h4>
        <div className="traveler-upload-grid">
          <section className="traveler-upload-card">
            <h5>Images Before</h5>
            <input
              ref={beforeInputRef}
              type="file"
              className="valve-attachments-file-input"
              accept="image/*"
              multiple
              disabled={locked || Boolean(uploadingType)}
              onChange={(e) => void handleUpload('image_before', e.target.files)}
            />
            <button
              type="button"
              className="button-secondary"
              disabled={locked || Boolean(uploadingType)}
              onClick={() => beforeInputRef.current?.click()}
            >
              {uploadingType === 'image_before' ? 'Uploading...' : 'Add images'}
            </button>
            <ul className="traveler-attachment-list">
              {groupedAttachments.image_before.map((row) => (
                <li key={row.id}>
                  <a href={row.file_url} target="_blank" rel="noreferrer">
                    {row.file_name}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section className="traveler-upload-card">
            <h5>Images After</h5>
            <input
              ref={afterInputRef}
              type="file"
              className="valve-attachments-file-input"
              accept="image/*"
              multiple
              disabled={locked || Boolean(uploadingType)}
              onChange={(e) => void handleUpload('image_after', e.target.files)}
            />
            <button
              type="button"
              className="button-secondary"
              disabled={locked || Boolean(uploadingType)}
              onClick={() => afterInputRef.current?.click()}
            >
              {uploadingType === 'image_after' ? 'Uploading...' : 'Add images'}
            </button>
            <ul className="traveler-attachment-list">
              {groupedAttachments.image_after.map((row) => (
                <li key={row.id}>
                  <a href={row.file_url} target="_blank" rel="noreferrer">
                    {row.file_name}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section className="traveler-upload-card">
            <h5>QA/QC Documents</h5>
            <input
              ref={qaDocInputRef}
              type="file"
              className="valve-attachments-file-input"
              accept=".pdf,.doc,.docx,.xlsx,.xls,.txt,.csv,image/*"
              multiple
              disabled={locked || Boolean(uploadingType)}
              onChange={(e) => void handleUpload('qa_doc', e.target.files)}
            />
            <button
              type="button"
              className="button-secondary"
              disabled={locked || Boolean(uploadingType)}
              onClick={() => qaDocInputRef.current?.click()}
            >
              {uploadingType === 'qa_doc' ? 'Uploading...' : 'Add documents'}
            </button>
            <ul className="traveler-attachment-list">
              {groupedAttachments.qa_doc.map((row) => (
                <li key={row.id}>
                  <a href={row.file_url} target="_blank" rel="noreferrer">
                    {row.file_name}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <div className="traveler-basic-card traveler-basic-submit-row">
        <EmployeeInitialsInput
          value={form.tech_initials}
          onChange={(value) => setField('tech_initials', value)}
          disabled={locked || saving}
        />
        <button type="button" className="button-primary" onClick={() => void submitPart1()} disabled={locked || saving}>
          {saving ? 'Submitting...' : 'Submit Part 1'}
        </button>
      </div>
    </section>
  )
}
