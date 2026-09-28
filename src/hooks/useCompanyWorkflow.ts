import { useMemo } from 'react'
import { getCompanyWorkflow, type CompanyWorkflowProfile } from '../constants/companyWorkflows'
import { useOrganization } from '../contexts/OrganizationContext'

/** Active company's shop statuses / work cells. Falls back to JS Valve when orgs are off. */
export function useCompanyWorkflow(): CompanyWorkflowProfile {
  const { orgsEnabled, activeOrganization } = useOrganization()
  return useMemo(() => {
    if (!orgsEnabled || !activeOrganization) return getCompanyWorkflow('js-valve')
    return getCompanyWorkflow(activeOrganization)
  }, [orgsEnabled, activeOrganization])
}
