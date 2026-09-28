import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOrganization } from '../contexts/OrganizationContext'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import {
  cloneConfig,
  defaultStatusWorkflowForCompany,
  loadStatusWorkflowConfig,
  saveStatusWorkflowConfig,
  type StatusWorkflowConfig,
  type WorkflowStage,
} from '../lib/statusWorkflow'

interface ShopWorkflowAdminPanelProps {
  showToast: (message: string) => void
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= items.length) return items
  const copy = [...items]
  const [item] = copy.splice(index, 1)
  copy.splice(nextIndex, 0, item)
  return copy
}

export function ShopWorkflowAdminPanel({ showToast }: ShopWorkflowAdminPanelProps) {
  const { activeOrganization } = useOrganization()
  const workflow = useCompanyWorkflow()
  const companyKey = workflow.key
  const statusCatalog = useMemo(() => [...workflow.statusOrder], [workflow.statusOrder])
  const defaults = useMemo(() => defaultStatusWorkflowForCompany(companyKey), [companyKey])

  const [draft, setDraft] = useState<StatusWorkflowConfig>(() => cloneConfig(defaults))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0)

  const load = useCallback(async () => {
    setLoading(true)
    const config = await loadStatusWorkflowConfig(companyKey)
    setDraft(cloneConfig(config))
    setExpandedIndex(0)
    setLoading(false)
  }, [companyKey])

  useEffect(() => {
    void load()
  }, [load])

  const assignedStatuses = useMemo(() => {
    const set = new Set<string>()
    for (const stage of draft.stages) {
      for (const status of stage.statuses) set.add(status)
    }
    for (const status of draft.neutrals) set.add(status)
    return set
  }, [draft])

  const unassignedStatuses = useMemo(
    () => statusCatalog.filter((status) => !assignedStatuses.has(status)),
    [assignedStatuses, statusCatalog],
  )

  const updateStage = (index: number, patch: Partial<WorkflowStage>) => {
    setDraft((prev) => {
      const stages = prev.stages.map((stage, i) => (i === index ? { ...stage, ...patch } : stage))
      return { ...prev, stages }
    })
  }

  const toggleStageStatus = (stageIndex: number, status: string, checked: boolean) => {
    setDraft((prev) => {
      const stages = prev.stages.map((stage, i) => {
        if (i === stageIndex) {
          const statuses = checked
            ? stage.statuses.includes(status)
              ? stage.statuses
              : [...stage.statuses, status]
            : stage.statuses.filter((s) => s !== status)
          return { ...stage, statuses }
        }
        // A status can only belong to one stage
        if (checked) return { ...stage, statuses: stage.statuses.filter((s) => s !== status) }
        return stage
      })
      // VSI keeps Staging Area / Hold / Quarantine as both stages and rework neutrals.
      const neutrals =
        checked && companyKey !== 'vsi' ? prev.neutrals.filter((s) => s !== status) : prev.neutrals
      return { stages, neutrals }
    })
  }

  const toggleNeutral = (status: string, checked: boolean) => {
    setDraft((prev) => {
      if (checked) {
        if (companyKey === 'vsi') {
          return {
            ...prev,
            neutrals: prev.neutrals.includes(status) ? prev.neutrals : [...prev.neutrals, status],
          }
        }
        return {
          stages: prev.stages.map((stage) => ({
            ...stage,
            statuses: stage.statuses.filter((s) => s !== status),
          })),
          neutrals: prev.neutrals.includes(status) ? prev.neutrals : [...prev.neutrals, status],
        }
      }
      return { ...prev, neutrals: prev.neutrals.filter((s) => s !== status) }
    })
  }

  const addStage = () => {
    setDraft((prev) => ({
      ...prev,
      stages: [
        ...prev.stages,
        { key: `stage_${prev.stages.length + 1}`, label: 'New stage', statuses: [] },
      ],
    }))
    setExpandedIndex(draft.stages.length)
  }

  const removeStage = (index: number) => {
    if (draft.stages.length <= 1) {
      showToast('Keep at least one workflow stage')
      return
    }
    setDraft((prev) => ({
      ...prev,
      stages: prev.stages.filter((_, i) => i !== index),
    }))
    setExpandedIndex(null)
  }

  const handleSave = async () => {
    if (draft.stages.some((s) => !s.label.trim())) {
      showToast('Every stage needs a name')
      return
    }
    setSaving(true)
    const { error } = await saveStatusWorkflowConfig(draft, companyKey)
    setSaving(false)
    if (error) {
      showToast(`Could not save workflow: ${error.message}`)
      return
    }
    setDraft(cloneConfig(await loadStatusWorkflowConfig(companyKey)))
    showToast(
      companyKey === 'vsi'
        ? 'VSI shop workflow saved (local demo)'
        : 'Shop workflow saved',
    )
  }

  const handleResetDefaults = () => {
    setDraft(cloneConfig(defaultStatusWorkflowForCompany(companyKey)))
    setExpandedIndex(0)
    showToast(
      companyKey === 'vsi'
        ? 'Draft reset to VSI defaults (Incoming → Quarantine) — click Save to apply'
        : 'Draft reset to defaults — click Save to apply',
    )
  }

  if (loading) {
    return <p className="job-muted">Loading shop workflow…</p>
  }

  return (
    <div className="shop-workflow-admin">
      <p className="placeholder-copy">
        {activeOrganization ? (
          <>
            Editing workflow for <strong>{activeOrganization.name}</strong>
            {companyKey === 'vsi' ? ' (departments RV / CV / UL)' : ''}.{' '}
          </>
        ) : null}
        This order is used to detect <strong>rework</strong> (backward status moves). Cards may skip stages. Moving to
        an earlier stage requires a reason. Hold / waiting statuses listed below do not count as forward or reverse.
      </p>

      {unassignedStatuses.length > 0 ? (
        <p className="job-muted shop-workflow-unassigned">
          Not mapped (won&apos;t count for rework): {unassignedStatuses.join(', ')}
        </p>
      ) : null}

      <div className="shop-workflow-toolbar">
        <button type="button" className="button-secondary admin-list-btn" onClick={addStage}>
          Add stage
        </button>
        <button type="button" className="button-secondary admin-list-btn" onClick={handleResetDefaults}>
          Reset to defaults
        </button>
        <button type="button" className="button-primary" onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : 'Save workflow'}
        </button>
      </div>

      <ol className="shop-workflow-stage-list">
        {draft.stages.map((stage, index) => {
          const expanded = expandedIndex === index
          return (
            <li key={`${stage.key}-${index}`} className="shop-workflow-stage-card">
              <div className="shop-workflow-stage-head">
                <span className="shop-workflow-stage-order">{index + 1}</span>
                <input
                  className="shop-workflow-stage-label"
                  value={stage.label}
                  onChange={(e) => updateStage(index, { label: e.target.value })}
                  aria-label={`Stage ${index + 1} name`}
                />
                <span className="job-muted shop-workflow-stage-count">
                  {stage.statuses.length} status{stage.statuses.length === 1 ? '' : 'es'}
                </span>
                <div className="shop-workflow-stage-actions">
                  <button
                    type="button"
                    className="button-secondary admin-list-btn"
                    disabled={index === 0}
                    onClick={() =>
                      setDraft((prev) => ({ ...prev, stages: moveItem(prev.stages, index, -1) }))
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="button-secondary admin-list-btn"
                    disabled={index === draft.stages.length - 1}
                    onClick={() =>
                      setDraft((prev) => ({ ...prev, stages: moveItem(prev.stages, index, 1) }))
                    }
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="button-secondary admin-list-btn"
                    onClick={() => setExpandedIndex(expanded ? null : index)}
                  >
                    {expanded ? 'Hide' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="button-secondary admin-list-btn danger"
                    onClick={() => removeStage(index)}
                  >
                    Remove
                  </button>
                </div>
              </div>
              {expanded ? (
                <div className="shop-workflow-status-grid">
                  {statusCatalog.map((status) => {
                    const checked = stage.statuses.includes(status)
                    const inOtherStage = draft.stages.some((s, i) => i !== index && s.statuses.includes(status))
                    const takenElsewhere =
                      !checked && (inOtherStage || (companyKey !== 'vsi' && draft.neutrals.includes(status)))
                    return (
                      <label key={status} className={`shop-workflow-status-option${takenElsewhere ? ' muted' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleStageStatus(index, status, e.target.checked)}
                        />
                        <span>
                          {status}
                          {takenElsewhere ? ' (elsewhere)' : ''}
                        </span>
                      </label>
                    )
                  })}
                </div>
              ) : stage.statuses.length > 0 ? (
                <p className="shop-workflow-stage-summary">{stage.statuses.join(' · ')}</p>
              ) : (
                <p className="job-muted shop-workflow-stage-summary">No statuses assigned</p>
              )}
            </li>
          )
        })}
      </ol>

      <div className="shop-workflow-neutrals">
        <h4>Hold / exception statuses</h4>
        <p className="job-muted">
          {companyKey === 'vsi'
            ? 'Staging Area (waiting on parts / customer approval), Hold, and Quarantine do not count as rework by themselves.'
            : 'Entering or leaving these does not count as rework by itself (Waiting, On Hold, Outsourced, Junked, etc.).'}
        </p>
        <div className="shop-workflow-status-grid">
          {statusCatalog.map((status) => {
            const checked = draft.neutrals.includes(status)
            const inStage = draft.stages.some((s) => s.statuses.includes(status))
            return (
              <label key={status} className={`shop-workflow-status-option${inStage && !checked ? ' muted' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggleNeutral(status, e.target.checked)}
                />
                <span>
                  {status}
                  {inStage && !checked ? ' (in a stage)' : ''}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      <div className="shop-workflow-toolbar">
        <button type="button" className="button-primary" onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : 'Save workflow'}
        </button>
      </div>
    </div>
  )
}
