import { companyLogoUrl } from '../lib/companyBranding'
import { useOrganization } from '../contexts/OrganizationContext'

/** Header company name / switcher. Hidden when multi-company is not enabled. */
export function CompanySwitcher() {
  const {
    orgsEnabled,
    isLocalOrganizations,
    loading,
    memberships,
    activeOrganization,
    setActiveOrganizationId,
  } = useOrganization()

  if (!orgsEnabled || loading) return null
  if (!activeOrganization && memberships.length === 0) return null

  const localTitle = isLocalOrganizations ? ' (local demo)' : ''
  const activeLogo = companyLogoUrl(activeOrganization)

  if (memberships.length <= 1) {
    if (!activeOrganization) return null
    return (
      <div
        className="company-switcher company-switcher--single"
        title={`${activeOrganization.name}${localTitle}`}
      >
        {activeLogo ? (
          <img src={activeLogo} alt="" className="company-switcher-logo" />
        ) : null}
        <span className="company-switcher-name">{activeOrganization.name}</span>
      </div>
    )
  }

  return (
    <label className="company-switcher" title={isLocalOrganizations ? 'Local multi-company demo' : undefined}>
      {activeLogo ? <img src={activeLogo} alt="" className="company-switcher-logo" /> : null}
      <span className="company-switcher-label">Company</span>
      <select
        className="company-switcher-select"
        value={activeOrganization?.id ?? ''}
        aria-label="Active company"
        onChange={(e) => setActiveOrganizationId(e.target.value)}
      >
        {memberships.map((row) => (
          <option key={row.organization_id} value={row.organization_id}>
            {row.organization.name}
          </option>
        ))}
      </select>
    </label>
  )
}
