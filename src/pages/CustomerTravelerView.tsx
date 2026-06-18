import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import logo from '../assets/js-logo.png'
import { useToast } from '../components/ToastNotification'
import { getTravelerSections } from '../hooks/useTraveler'
import { supabase } from '../lib/supabase'
import type { TravelerSectionStatus } from '../types/traveler'

type CustomerPortalUser = {
  id: string
  customer_name: string
}

type TravelerRow = {
  id: string
  valve_id: string
  valve_type_id: string | null
  is_complete: boolean
  updated_at: string
}

type SectionData = {
  basicInfo: Record<string, unknown> | null
  valveSelection: Record<string, unknown> | null
  valveSpecs: Record<string, unknown> | null
  welding: Record<string, unknown> | null
  otherParts: Record<string, unknown> | null
  partsOrdered: Record<string, unknown> | null
  testingQc: Record<string, unknown> | null
  attachments: Array<{ id: string; file_type: string; file_name: string; file_url: string; uploaded_at: string }>
}

const SECTION_DEFS: Array<{ key: string; label: string }> = [
  { key: 'basic_info', label: 'Basic Information' },
  { key: 'valve_selection', label: 'Valve Selection' },
  { key: 'valve_specs', label: 'Valve Specifications' },
  { key: 'welding', label: 'Welding' },
  { key: 'other_parts', label: 'Other Parts Required' },
  { key: 'parts_ordered', label: 'Parts Ordered' },
  { key: 'testing_qc', label: 'Testing & Quality Checklist' },
]

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function normalizeKey(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())
}

function renderReadonlyData(data: Record<string, unknown> | null) {
  if (!data) return <p className="status-breakdown-note">No data found.</p>
  const skip = new Set(['id', 'traveler_id', 'valve_id', 'created_at', 'updated_at', 'is_complete', 'is_na', 'submitted_at'])
  const rows = Object.entries(data).filter(([key]) => !skip.has(key))
  if (rows.length === 0) return <p className="status-breakdown-note">No fields to display.</p>
  return (
    <dl className="customer-readonly-grid">
      {rows.map(([key, value]) => (
        <div key={key}>
          <dt>{normalizeKey(key)}</dt>
          <dd>
            {typeof value === 'object' && value !== null ? (
              <pre>{JSON.stringify(value, null, 2)}</pre>
            ) : value === null || value === '' ? (
              '-'
            ) : (
              String(value)
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function CustomerTravelerView() {
  const { valveId } = useParams<{ valveId: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [portalUser, setPortalUser] = useState<CustomerPortalUser | null>(null)
  const [traveler, setTraveler] = useState<TravelerRow | null>(null)
  const [sectionStatus, setSectionStatus] = useState<TravelerSectionStatus[]>([])
  const [sectionData, setSectionData] = useState<SectionData>({
    basicInfo: null,
    valveSelection: null,
    valveSpecs: null,
    welding: null,
    otherParts: null,
    partsOrdered: null,
    testingQc: null,
    attachments: [],
  })

  useEffect(() => {
    if (!valveId) {
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      const { data: me } = await supabase.auth.getUser()
      if (!me.user) {
        navigate('/customer-login', { replace: true })
        return
      }

      const { data: customer, error: customerError } = await supabase
        .from('customer_portal_users')
        .select('id,customer_name')
        .eq('auth_user_id', me.user.id)
        .maybeSingle()
      if (customerError || !customer) {
        await supabase.auth.signOut()
        navigate('/customer-login', { replace: true })
        return
      }
      if (cancelled) return
      setPortalUser(customer as CustomerPortalUser)

      const { data: basicInfo, error: basicError } = await supabase
        .from('traveler_basic_info')
        .select('*')
        .eq('valve_id', valveId)
        .eq('customer', customer.customer_name)
        .maybeSingle()

      if (basicError || !basicInfo) {
        showToast('Traveler not found or not available for your account.')
        navigate('/customer-portal', { replace: true })
        return
      }
      if (cancelled) return

      const { data: travelerRow, error: travelerError } = await supabase
        .from('travelers')
        .select('id,valve_id,valve_type_id,is_complete,updated_at')
        .eq('valve_id', valveId)
        .maybeSingle()
      if (travelerError || !travelerRow) {
        showToast('Could not load traveler record.')
        navigate('/customer-portal', { replace: true })
        return
      }
      if (cancelled) return
      const travelerData = travelerRow as TravelerRow
      setTraveler(travelerData)

      const [statuses, selection, specs, welding, otherParts, partsOrdered, testingQc, attachments] = await Promise.all([
        getTravelerSections(travelerData.id),
        supabase.from('traveler_valve_selection').select('*').eq('traveler_id', travelerData.id).maybeSingle(),
        supabase.from('traveler_valve_specs').select('*').eq('traveler_id', travelerData.id).maybeSingle(),
        supabase.from('traveler_welding').select('*').eq('traveler_id', travelerData.id).maybeSingle(),
        supabase.from('traveler_other_parts').select('*').eq('traveler_id', travelerData.id).maybeSingle(),
        supabase.from('traveler_parts_ordered').select('*').eq('traveler_id', travelerData.id).maybeSingle(),
        supabase.from('traveler_testing_qc').select('*').eq('traveler_id', travelerData.id).maybeSingle(),
        supabase
          .from('traveler_attachments')
          .select('id,file_type,file_name,file_url,uploaded_at')
          .eq('traveler_id', travelerData.id)
          .order('uploaded_at', { ascending: false }),
      ])

      if (cancelled) return
      setSectionStatus(statuses)
      setSectionData({
        basicInfo: basicInfo as Record<string, unknown>,
        valveSelection: (selection.data ?? null) as Record<string, unknown> | null,
        valveSpecs: (specs.data ?? null) as Record<string, unknown> | null,
        welding: (welding.data ?? null) as Record<string, unknown> | null,
        otherParts: (otherParts.data ?? null) as Record<string, unknown> | null,
        partsOrdered: (partsOrdered.data ?? null) as Record<string, unknown> | null,
        testingQc: (testingQc.data ?? null) as Record<string, unknown> | null,
        attachments: (attachments.data ?? []) as SectionData['attachments'],
      })
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [valveId, navigate, showToast])

  const doneCount = useMemo(
    () => sectionStatus.filter((section) => section.is_complete || section.is_na).length,
    [sectionStatus],
  )
  const statusByKey = useMemo(() => new Map(sectionStatus.map((status) => [status.section, status])), [sectionStatus])

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/customer-login', { replace: true })
  }

  const sectionContent = (key: string) => {
    if (key === 'basic_info') return sectionData.basicInfo
    if (key === 'valve_selection') return sectionData.valveSelection
    if (key === 'valve_specs') return sectionData.valveSpecs
    if (key === 'welding') return sectionData.welding
    if (key === 'other_parts') return sectionData.otherParts
    if (key === 'parts_ordered') return sectionData.partsOrdered
    return sectionData.testingQc
  }

  if (loading) {
    return (
      <section className="dashboard-page">
        <header className="customer-portal-header">
          <div className="brand">
            <img src={logo} alt="JS Valve logo" className="brand-logo" />
            <span>JS Customer Portal</span>
          </div>
          <button className="logout-button" type="button" onClick={() => void logout()}>
            Logout
          </button>
        </header>
        <section className="dashboard-panel">
          <p className="status-breakdown-note">Loading traveler view...</p>
        </section>
      </section>
    )
  }

  if (!traveler || !portalUser) {
    return null
  }

  return (
    <section className="dashboard-page">
      <header className="customer-portal-header">
        <div className="brand">
          <img src={logo} alt="JS Valve logo" className="brand-logo" />
          <span>JS Customer Portal</span>
        </div>
        <button className="logout-button" type="button" onClick={() => void logout()}>
          Logout
        </button>
      </header>

      <section className="dashboard-panel traveler-page-panel">
        <div className="dashboard-title-row">
          <h2 className="dashboard-title">{`Traveler ${traveler.valve_id}`}</h2>
          <span className="status-breakdown-note">{portalUser.customer_name}</span>
        </div>
        <p className="status-breakdown-note">{`${doneCount} of 7 sections complete`}</p>

        {sectionData.attachments.length > 0 ? (
          <div className="traveler-basic-card">
            <h4 className="traveler-basic-subtitle">Attachments</h4>
            <ul className="traveler-attachment-list">
              {sectionData.attachments.map((file) => (
                <li key={file.id}>
                  <a href={file.file_url} target="_blank" rel="noreferrer">
                    {file.file_name}
                  </a>{' '}
                  <span className="status-breakdown-note">{`(${file.file_type})`}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {SECTION_DEFS.map((section) => {
          const status = statusByKey.get(section.key)
          const isDone = Boolean(status?.is_complete || status?.is_na)
          return (
            <article key={section.key} className="traveler-basic-card">
              <div className="traveler-section-head-row">
                <h4 className="traveler-basic-subtitle">{section.label}</h4>
                <span className={isDone ? 'traveler-signoff-done' : 'status-breakdown-note'}>
                  {isDone
                    ? `Complete${status?.tech_initials ? ` — ${status.tech_initials}` : ''}${status?.submitted_at ? ` — ${formatDateTime(status.submitted_at)}` : ''}`
                    : 'Pending'}
                </span>
              </div>
              {isDone ? renderReadonlyData(sectionContent(section.key)) : <p className="status-breakdown-note">Pending</p>}
            </article>
          )
        })}
      </section>
    </section>
  )
}
