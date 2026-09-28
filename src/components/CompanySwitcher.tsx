import { companyLogoUrl } from '../lib/companyBranding'
import { useOrganization } from '../contexts/OrganizationContext'

/** Header company name / switcher. Hidden when multi-company is not enabled. */
export function CompanySwitcher() {
  const {
    orgsEnabled,
    isLocalOrganizations,
    loading,
    switchableOrganizations,
    activeOrganization,
    isOrgSuperAdmin,
    setActiveOrganizationId,
  } = useOrganization()

  if (!orgsEnabled || loading) return null
  if (!activeOrganization && switchableOrganizations.length === 0) return null

  const localTitle = isLocalOrganizations
    ? ' (local demo — will not delete live JS Valve data)'
    : ''
  const activeLogo = companyLogoUrl(activeOrganization)
  const label = isOrgSuperAdmin ? 'Company (Superadmin)' : 'Company'

  if (switchableOrganizations.length <= 1) {
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
        {isOrgSuperAdmin ? <span className="company-switcher-superadmin-tag">Superadmin</span> : null}
      </div>
    )
  }

  return (
    <label
      className="company-switcher"
      title={
        isOrgSuperAdmin
          ? 'Superadmin — switch between all companies'
          : isLocalOrganizations
            ? 'Local multi-company demo'
            : undefined
      }
    >
      {activeLogo ? <img src={activeLogo} alt="" className="company-switcher-logo" /> : null}
      <span className="company-switcher-label">{label}</span>
      <select
        className="company-switcher-select"
        value={activeOrganization?.id ?? ''}
        aria-label="Active company"
        onChange={(e) => setActiveOrganizationId(e.target.value)}
      >
        {switchableOrganizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
    </label>
  )
}
