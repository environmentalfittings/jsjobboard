import { useEffect, useMemo, useState } from 'react'
import { getCompanyWorkflow, type CompanyWorkflowProfile } from '../constants/companyWorkflows'
import { useOrganization } from '../contexts/OrganizationContext'
import { overlayWorkflowProfile, subscribeStatusWorkflow } from '../lib/statusWorkflow'

/** Active company's shop statuses / work cells. Falls back to JS Valve when no company is selected. */
export function useCompanyWorkflow(): CompanyWorkflowProfile {
  const { activeOrganization } = useOrganization()
  const [workflowTick, setWorkflowTick] = useState(0)

  useEffect(() => subscribeStatusWorkflow(() => setWorkflowTick((tick) => tick + 1)), [])

  return useMemo(
    () => overlayWorkflowProfile(getCompanyWorkflow(activeOrganization)),
    [activeOrganization, workflowTick],
  )
}
