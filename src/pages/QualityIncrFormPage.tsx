import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import {
  buildIncrFormFromRework,
  createQualityIncr,
  getQualityIncr,
  getStatusReworkById,
  updateQualityIncr,
} from '../lib/qualityIncrs'
import {
  emptyQualityIncrForm,
  QUALITY_INCR_DISPOSITION_OPTIONS,
  QUALITY_INCR_DEFAULT_WHY_COUNT,
  QUALITY_INCR_MAX_WHY_COUNT,
  qualityIncrToForm,
  type QualityIncrFormState,
  type QualityIncrStatus,
} from '../types/qualityIncr'
import { PRIORITY_DEPARTMENTS } from '../constants/priorityDepartments'

function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`incr-form-field ${className}`.trim()}>
      <span>{label}</span>
      {children}
    </label>
  )
}

export function QualityIncrFormPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { user, username } = useAuth()
  const editingId = id && id !== 'new' ? Number(id) : null
  const reworkIdRaw = searchParams.get('reworkId')
  const reworkId = reworkIdRaw ? Number(reworkIdRaw) : null

  const [form, setForm] = useState<QualityIncrFormState>(() => emptyQualityIncrForm())
  const [incrNumber, setIncrNumber] = useState<string | null>(null)
  const [linkedReworkId, setLinkedReworkId] = useState<number | null>(reworkId)
  const [valveRowId, setValveRowId] = useState<number | null>(null)
  const [valveId, setValveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        if (editingId && Number.isFinite(editingId)) {
          const { data, error } = await getQualityIncr(editingId)
          if (cancelled) return
          if (error || !data) {
            showToast(error || 'INCR not found')
            navigate('/quality-team')
            return
          }
          setForm(qualityIncrToForm(data))
          setIncrNumber(data.incr_number)
          setLinkedReworkId(data.rework_log_id)
          setValveRowId(data.valve_row_id)
          setValveId(data.valve_id)
          return
        }

        const base = emptyQualityIncrForm()
        base.initiator_name = username || ''
        if (reworkId && Number.isFinite(reworkId)) {
          const { data: rework, error } = await getStatusReworkById(reworkId)
          if (cancelled) return
          if (error || !rework) {
            showToast(error || 'Rework row not found')
          } else {
            const prefilled = await buildIncrFormFromRework(rework, { initiatorName: username })
            if (cancelled) return
            setForm(prefilled)
            setLinkedReworkId(rework.id)
            setValveRowId(rework.valve_row_id)
            setValveId(rework.valve_id)
            setLoading(false)
            return
          }
        }
        if (!cancelled) setForm(base)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editingId, reworkId, navigate, showToast, username])

  const patch = <K extends keyof QualityIncrFormState>(key: K, value: QualityIncrFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const patchWhy = (index: number, value: string) => {
    setForm((prev) => {
      const five_whys = [...prev.five_whys]
      five_whys[index] = value
      return { ...prev, five_whys }
    })
  }

  const addWhyRow = () => {
    setForm((prev) => {
      if (prev.five_whys.length >= QUALITY_INCR_MAX_WHY_COUNT) return prev
      return { ...prev, five_whys: [...prev.five_whys, ''] }
    })
  }

  const removeWhyRow = (index: number) => {
    setForm((prev) => {
      if (prev.five_whys.length <= QUALITY_INCR_DEFAULT_WHY_COUNT) return prev
      if (index < QUALITY_INCR_DEFAULT_WHY_COUNT) return prev
      return { ...prev, five_whys: prev.five_whys.filter((_, i) => i !== index) }
    })
  }

  const save = async () => {
    if (!form.nonconformance_details.trim() && !form.discrepancy_description.trim()) {
      showToast('Enter non-conformance details or a discrepancy description')
      return
    }
    setSaving(true)
    try {
      if (editingId && Number.isFinite(editingId)) {
        const { data, error } = await updateQualityIncr(editingId, form)
        if (error) {
          showToast(error)
          return
        }
        showToast(`Saved ${data?.incr_number ?? 'INCR'}`)
        return
      }
      const { data, error } = await createQualityIncr({
        form,
        reworkLogId: linkedReworkId,
        valveRowId,
        valveId,
        createdByUserId: user?.id ?? null,
        createdByName: username || null,
      })
      if (error && !data) {
        showToast(error)
        return
      }
      if (error && data) showToast(error)
      else showToast(`Created ${data?.incr_number ?? 'INCR'}`)
      if (data) navigate(`/quality-team/incrs/${data.id}`, { replace: true })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <section className="dashboard-page">
        <p className="placeholder-copy">Loading INCR…</p>
      </section>
    )
  }

  return (
    <section className="dashboard-page incr-form-page">
      <div className="dashboard-title-row">
        <div>
          <h2 className="dashboard-title">
            {incrNumber ? `INCR ${incrNumber}` : 'INCR'}
          </h2>
          <p className="placeholder-copy" style={{ marginTop: '0.35rem' }}>
            Internal Non-Conformance Report (fields match the shop NCMR / NCR form). Saved under Quality Team.
            {valveId || valveRowId ? (
              <>
                {' '}
                Job card fields are prefilled from{' '}
                <strong>{valveId || `row ${valveRowId}`}</strong>
                {valveRowId ? (
                  <>
                    {' '}
                    (
                    <Link to={`/job-board?open=${valveRowId}`}>open card</Link>
                    ).
                  </>
                ) : (
                  '.'
                )}
              </>
            ) : null}
          </p>
        </div>
        <div className="technicians-page-actions">
          <Link to="/quality-team" className="button-secondary">
            Back to Quality Team
          </Link>
          <button type="button" className="button-primary" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : incrNumber ? 'Save' : 'Save INCR'}
          </button>
        </div>
      </div>

      <section className="dashboard-panel">
        <h3>Header</h3>
        <div className="incr-form-grid">
          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) => patch('status', e.target.value as QualityIncrStatus)}
              disabled={saving}
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="void">Void</option>
            </select>
          </Field>
          <Field label="Date rejected">
            <input type="date" value={form.date_rejected} onChange={(e) => patch('date_rejected', e.target.value)} disabled={saving} />
          </Field>
          <Field label="Customer name">
            <input value={form.customer_name} onChange={(e) => patch('customer_name', e.target.value)} disabled={saving} />
          </Field>
          <Field label="W.O. / S.O.">
            <input value={form.wo_so} onChange={(e) => patch('wo_so', e.target.value)} disabled={saving} />
          </Field>
          <Field label="Work cell / WC">
            <input value={form.work_cell} onChange={(e) => patch('work_cell', e.target.value)} disabled={saving} />
          </Field>
          <label className="incr-form-field incr-form-check">
            <input
              type="checkbox"
              checked={form.requires_corporate_ncr}
              onChange={(e) => patch('requires_corporate_ncr', e.target.checked)}
              disabled={saving}
            />
            <span>Requires Corporate NCR</span>
          </label>
        </div>
      </section>

      <section className="dashboard-panel">
        <h3>Part / item</h3>
        <div className="incr-form-grid">
          <Field label="Part description" className="incr-form-field--wide">
            <input value={form.part_description} onChange={(e) => patch('part_description', e.target.value)} disabled={saving} />
          </Field>
          <Field label="Item">
            <input value={form.item} onChange={(e) => patch('item', e.target.value)} disabled={saving} />
          </Field>
          <Field label="Employee name">
            <input value={form.employee_name} onChange={(e) => patch('employee_name', e.target.value)} disabled={saving} />
          </Field>
          <Field label="Dept responsible">
            <select
              value={form.dept_responsible}
              onChange={(e) => patch('dept_responsible', e.target.value)}
              disabled={saving}
            >
              <option value="">— Select —</option>
              {PRIORITY_DEPARTMENTS.map((dept) => (
                <option key={dept.id} value={dept.label}>
                  {dept.label}
                </option>
              ))}
              {form.dept_responsible &&
              !PRIORITY_DEPARTMENTS.some((dept) => dept.label === form.dept_responsible) ? (
                <option value={form.dept_responsible}>{form.dept_responsible}</option>
              ) : null}
            </select>
          </Field>
        </div>
      </section>

      <section className="dashboard-panel">
        <h3>Non-conformance details</h3>
        <div className="incr-form-grid">
          <Field label="Non-conformance details" className="incr-form-field--wide">
            <textarea
              rows={4}
              value={form.nonconformance_details}
              onChange={(e) => patch('nonconformance_details', e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Description of discrepancy / nonconformance" className="incr-form-field--wide">
            <textarea
              rows={3}
              value={form.discrepancy_description}
              onChange={(e) => patch('discrepancy_description', e.target.value)}
              disabled={saving}
            />
          </Field>
        </div>
      </section>

      <section className="dashboard-panel">
        <h3>5 Whys</h3>
        <p className="placeholder-copy resources-hint">
          Ask why five times to dig into the root cause. Add rows if you need a 6Y, 7Y, or 8Y.
        </p>
        <div className="incr-five-whys">
          {form.five_whys.map((answer, index) => (
            <div key={`why-${index}`} className="incr-five-whys-row">
              <label className="incr-form-field incr-five-whys-field">
                <span>Why {index + 1}</span>
                <input
                  value={answer}
                  onChange={(e) => patchWhy(index, e.target.value)}
                  disabled={saving}
                  placeholder={`Why ${index + 1}…`}
                />
              </label>
              {index >= QUALITY_INCR_DEFAULT_WHY_COUNT ? (
                <button
                  type="button"
                  className="button-secondary rework-qa-btn"
                  disabled={saving}
                  onClick={() => removeWhyRow(index)}
                  aria-label={`Remove Why ${index + 1}`}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
          <div className="incr-five-whys-add">
            <button
              type="button"
              className="button-secondary"
              disabled={saving || form.five_whys.length >= QUALITY_INCR_MAX_WHY_COUNT}
              onClick={addWhyRow}
            >
              Add row
            </button>
            {form.five_whys.length >= QUALITY_INCR_MAX_WHY_COUNT ? (
              <span className="status-breakdown-note">Maximum {QUALITY_INCR_MAX_WHY_COUNT} whys.</span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="dashboard-panel">
        <h3>Disposition</h3>
        <div className="incr-form-grid">
          <Field label="Disposition">
            <select
              value={form.disposition}
              onChange={(e) => patch('disposition', e.target.value as QualityIncrFormState['disposition'])}
              disabled={saving}
            >
              <option value="">— Select —</option>
              {QUALITY_INCR_DISPOSITION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Final disposition" className="incr-form-field--wide">
            <input value={form.final_disposition} onChange={(e) => patch('final_disposition', e.target.value)} disabled={saving} />
          </Field>
          <Field label="Labor cost">
            <input value={form.labor_cost} onChange={(e) => patch('labor_cost', e.target.value)} disabled={saving} />
          </Field>
          <Field label="Material cost">
            <input value={form.material_cost} onChange={(e) => patch('material_cost', e.target.value)} disabled={saving} />
          </Field>
          <Field label="Root cause and corrective / preventive action" className="incr-form-field--wide">
            <textarea
              rows={4}
              value={form.root_cause_corrective_action}
              onChange={(e) => patch('root_cause_corrective_action', e.target.value)}
              disabled={saving}
            />
          </Field>
        </div>
      </section>

      <section className="dashboard-panel">
        <h3>Approvals</h3>
        <div className="incr-form-grid">
          <Field label="NCMR initiator">
            <input value={form.initiator_name} onChange={(e) => patch('initiator_name', e.target.value)} disabled={saving} />
          </Field>
          <Field label="Initiator date">
            <input type="date" value={form.initiator_date} onChange={(e) => patch('initiator_date', e.target.value)} disabled={saving} />
          </Field>
          <Field label="QC approval">
            <input value={form.qc_approval_name} onChange={(e) => patch('qc_approval_name', e.target.value)} disabled={saving} />
          </Field>
          <Field label="QC approval date">
            <input type="date" value={form.qc_approval_date} onChange={(e) => patch('qc_approval_date', e.target.value)} disabled={saving} />
          </Field>
          <Field label="Final approval / verified by">
            <input
              value={form.final_approval_name}
              onChange={(e) => patch('final_approval_name', e.target.value)}
              disabled={saving}
            />
          </Field>
          <Field label="Final approval date">
            <input
              type="date"
              value={form.final_approval_date}
              onChange={(e) => patch('final_approval_date', e.target.value)}
              disabled={saving}
            />
          </Field>
          <label className="incr-form-field incr-form-check">
            <input
              type="checkbox"
              checked={form.customer_signature_required}
              onChange={(e) => patch('customer_signature_required', e.target.checked)}
              disabled={saving}
            />
            <span>Customer signature required</span>
          </label>
          <Field label="Customer signature date">
            <input
              type="date"
              value={form.customer_signature_date}
              onChange={(e) => patch('customer_signature_date', e.target.value)}
              disabled={saving || !form.customer_signature_required}
            />
          </Field>
          <Field label="Notes" className="incr-form-field--wide">
            <textarea rows={3} value={form.notes} onChange={(e) => patch('notes', e.target.value)} disabled={saving} />
          </Field>
        </div>
      </section>

      <div className="new-job-actions" style={{ marginTop: '1rem' }}>
        <Link to="/quality-team" className="button-secondary">
          Cancel
        </Link>
        <button type="button" className="button-primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : incrNumber ? 'Save' : 'Save INCR'}
        </button>
      </div>
    </section>
  )
}
