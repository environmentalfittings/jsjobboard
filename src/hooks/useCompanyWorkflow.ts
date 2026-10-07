import { useMemo } from 'react'
import { getCompanyWorkflow, type CompanyWorkflowProfile } from '../constants/companyWorkflows'
import { useOrganization } from '../contexts/OrganizationContext'

/** Active company's shop statuses / work cells. Falls back to JS Valve when no company is selected. */
export function useCompanyWorkflow(): CompanyWorkflowProfile {
  const { activeOrganization } = useOrganization()
  return useMemo(() => getCompanyWorkflow(activeOrganization), [activeOrganization])
}
