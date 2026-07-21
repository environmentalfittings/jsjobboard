import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BasicInfoSection } from '../components/traveler/BasicInfoSection'
import { OtherPartsSection } from '../components/traveler/OtherPartsSection'
import { PartsOrderedSection } from '../components/traveler/PartsOrderedSection'
import { TestingQCSection } from '../components/traveler/TestingQCSection'
import { ValveSelectionSection } from '../components/traveler/ValveSelectionSection'
import { ValveSpecsSection } from '../components/traveler/ValveSpecsSection'
import { WeldingSection } from '../components/traveler/WeldingSection'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import { getOrCreateTraveler, getTravelerBasicInfo, getTravelerSections, prefillTravelerBasicInfoFromValve } from '../hooks/useTraveler'
import { canWriteShop } from '../lib/roles'
import type { Traveler, TravelerBasicInfo, TravelerSectionStatus } from '../types/traveler'

type TravelerSectionDef = {
  key: string
  label: string
}

const TRAVELER_SECTIONS: TravelerSectionDef[] = [
  { key: 'basic_info', label: 'Basic Information' },
  { key: 'valve_selection', label: 'Valve Selection' },
  { key: 'valve_specs', label: 'Valve Specifications' },
  { key: 'welding', label: 'Welding' },
  { key: 'other_parts', label: 'Other Parts Required' },
  { key: 'parts_ordered', label: 'Parts Ordered' },
  { key: 'testing_qc', label: 'Testing & Quality Checklist' },
]

function formatSubmittedAt(value: string | null) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

function statusMeta(section: TravelerSectionStatus | undefined) {
  if (section?.is_complete) {
    return { icon: '✅', className: 'traveler-status-complete' }
  }
  if (section?.is_na) {
    return { icon: '🚫', className: 'traveler-status-na' }
  }
  return { icon: '⭕', className: 'traveler-status-pending' }
}

export function TravelerPage() {
  const { valveId } = useParams<{ valveId: string }>()
  const { showToast } = useToast()
  const { role } = useAuth()
  const canWrite = canWriteShop(role)
  const [loading, setLoading] = useState(true)
  const [traveler, setTraveler] = useState<Traveler | null>(null)
  const [basicInfo, setBasicInfo] = useState<TravelerBasicInfo | null>(null)
  const [sectionStatus, setSectionStatus] = useState<TravelerSectionStatus[]>([])
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    Object.fromEntries(TRAVELER_SECTIONS.map((section) => [section.key, false])),
  )

  const refreshSections = async (targetTravelerId: string) => {
    const [statuses, latestBasicInfo] = await Promise.all([
      getTravelerSections(targetTravelerId),
      getTravelerBasicInfo(targetTravelerId),
    ])
    setSectionStatus(statuses)
    setBasicInfo(latestBasicInfo)
    if (valveId) {
      const latestTraveler = await getOrCreateTraveler(valveId)
      setTraveler(latestTraveler)
    }
  }

  useEffect(() => {
    if (!valveId) {
      setLoading(false)
      return
    }
    const normalizedValveId = decodeURIComponent(valveId).trim()
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const row = await getOrCreateTraveler(normalizedValveId)
        if (cancelled) return
        setTraveler(row)
        try {
          await prefillTravelerBasicInfoFromValve(row.id, normalizedValveId)
          await refreshSections(row.id)
        } catch (error) {
          if (!cancelled) {
            showToast(error instanceof Error ? error.message : 'Could not refresh traveler sections')
          }
        }
      } catch (error) {
        if (!cancelled) {
          showToast(error instanceof Error ? error.message : 'Could not load traveler')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [valveId, showToast])

  const statusBySection = useMemo(() => {
    return new Map(sectionStatus.map((section) => [section.section, section]))
  }, [sectionStatus])

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const customerName = basicInfo?.customer?.trim() || 'Unknown customer'
  const travelerCompleteStatus = statusBySection.get('testing_qc')
  const travelerCompleteLabel =
    traveler?.is_complete && travelerCompleteStatus?.tech_initials
      ? `${travelerCompleteStatus.tech_initials} — ${formatSubmittedAt(travelerCompleteStatus.submitted_at)}`
      : traveler?.is_complete
        ? formatSubmittedAt(travelerCompleteStatus?.submitted_at ?? null)
        : ''

  const renderSectionContent = (sectionKey: string) => {
    if (!traveler || !valveId) return null
    switch (sectionKey) {
      case 'basic_info':
        return (
          <BasicInfoSection
            travelerId={traveler.id}
            valveId={valveId}
            valveTypeId={traveler.valve_type_id ?? ''}
            onComplete={() => void refreshSections(traveler.id)}
          />
        )
      case 'valve_selection':
        return (
          <ValveSelectionSection
            travelerId={traveler.id}
            valveId={valveId}
            onComplete={() => void refreshSections(traveler.id)}
          />
        )
      case 'valve_specs':
        return (
          <ValveSpecsSection
            travelerId={traveler.id}
            valveId={valveId}
            valveTypeId={traveler.valve_type_id ?? ''}
            onComplete={() => void refreshSections(traveler.id)}
          />
        )
      case 'welding':
        return <WeldingSection travelerId={traveler.id} valveId={valveId} onComplete={() => void refreshSections(traveler.id)} />
      case 'other_parts':
        return <OtherPartsSection travelerId={traveler.id} valveId={valveId} onComplete={() => void refreshSections(traveler.id)} />
      case 'parts_ordered':
        return <PartsOrderedSection travelerId={traveler.id} valveId={valveId} onComplete={() => void refreshSections(traveler.id)} />
      case 'testing_qc':
        return <TestingQCSection travelerId={traveler.id} valveId={valveId} onComplete={() => void refreshSections(traveler.id)} />
      default:
        return null
    }
  }

  if (loading) {
    return (
      <section className="dashboard-page">
        <div className="dashboard-title-row">
          <h2 className="dashboard-title">Traveler</h2>
        </div>
        <section className="dashboard-panel">
          <p className="status-breakdown-note">Loading traveler...</p>
        </section>
      </section>
    )
  }

  if (!valveId || !traveler) {
    return (
      <section className="dashboard-page">
        <div className="dashboard-title-row">
          <h2 className="dashboard-title">Traveler</h2>
        </div>
        <section className="dashboard-panel">
          <p className="status-breakdown-note">Traveler could not be loaded.</p>
        </section>
      </section>
    )
  }

  return (
    <section className="dashboard-page">
      <div className="dashboard-title-row">
        <h2 className="dashboard-title">{`Traveler — ${valveId} — ${customerName}`}</h2>
        <div className="traveler-page-actions">
          <Link
            to={`/traveler/${encodeURIComponent(valveId)}/inspection`}
            className="button-primary"
          >
            Inspection checklist
          </Link>
          <button type="button" className="button-secondary" onClick={() => showToast('Generate PDF coming soon')}>
            Generate PDF
          </button>
          <button type="button" className="button-secondary" onClick={() => showToast('View as Customer coming soon')}>
            View as Customer
          </button>
        </div>
      </div>

      <section className="dashboard-panel traveler-page-panel">
        {traveler?.is_complete ? (
          <div className="traveler-overall-complete-banner">{`✅ Traveler Complete${travelerCompleteLabel ? ` — ${travelerCompleteLabel}` : ''}`}</div>
        ) : null}
        {!canWrite ? (
          <p className="placeholder-copy">View only — ask an Admin or Manager to change traveler data.</p>
        ) : null}
        <div className="traveler-breadcrumb">{`Dashboard > Valve card / ticket > Traveler ${valveId}`}</div>
        <h3 className="traveler-valve-id">{valveId}</h3>

        <div className="traveler-accordion-list">
          {TRAVELER_SECTIONS.map((section) => {
            const status = statusBySection.get(section.key)
            const { icon, className } = statusMeta(status)
            const submittedDate = formatSubmittedAt(status?.submitted_at ?? null)
            return (
              <article key={section.key} className="traveler-accordion-item">
                <button
                  type="button"
                  className="traveler-accordion-button"
                  onClick={() => toggleSection(section.key)}
                >
                  <span className={`traveler-status-icon ${className}`} aria-hidden>
                    {icon}
                  </span>
                  <span className="traveler-section-name">{section.label}</span>
                  <span className="traveler-section-meta">
                    {status?.is_complete && status.tech_initials
                      ? `${status.tech_initials}${submittedDate ? ` · ${submittedDate}` : ''}`
                      : ''}
                  </span>
                  <span className="traveler-section-chevron" aria-hidden>
                    {openSections[section.key] ? '▾' : '▸'}
                  </span>
                </button>
                {openSections[section.key] ? (
                  <div className="traveler-accordion-content">
                    {canWrite ? (
                      renderSectionContent(section.key)
                    ) : (
                      <fieldset disabled className="shop-view-only-fieldset">
                        {renderSectionContent(section.key)}
                      </fieldset>
                    )}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      </section>
    </section>
  )
}
