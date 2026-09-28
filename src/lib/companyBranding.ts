import jsLogo from '../assets/js-logo.png'
import vsiLogo from '../assets/vsi-logo.png'
import {
  companyWorkflowKeyFromOrganization,
  type CompanyWorkflowKey,
} from '../constants/companyWorkflows'

const COMPANY_LOGOS: Record<CompanyWorkflowKey, string> = {
  'js-valve': jsLogo,
  vsi: vsiLogo,
}

export function companyLogoUrl(
  org?: { slug?: string | null; name?: string | null; id?: string | null; logo_url?: string | null } | null,
): string | null {
  if (org?.logo_url?.trim()) return org.logo_url.trim()
  if (!org) return null
  return COMPANY_LOGOS[companyWorkflowKeyFromOrganization(org)] ?? null
}

export function defaultCompanyLogoUrl(key: CompanyWorkflowKey): string {
  return COMPANY_LOGOS[key]
}
