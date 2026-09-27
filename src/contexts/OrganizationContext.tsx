import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import {
  detectOrganizationsEnabled,
  listMembershipsForUser,
  listOrganizations,
  membershipIsSuperAdmin,
  pickActiveOrganization,
  writeStoredActiveOrganizationId,
} from '../lib/organizations'
import type { Organization, OrganizationMembership } from '../types/organizations'

type OrganizationContextValue = {
  /** False when migration has not been run — app behaves as single-company. */
  orgsEnabled: boolean
  loading: boolean
  organizations: Organization[]
  memberships: OrganizationMembership[]
  activeOrganization: Organization | null
  isOrgSuperAdmin: boolean
  setActiveOrganizationId: (organizationId: string) => void
  refreshOrganizations: () => Promise<void>
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null)

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [orgsEnabled, setOrgsEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([])
  const [activeOrganization, setActiveOrganization] = useState<Organization | null>(null)

  const refreshOrganizations = useCallback(async () => {
    if (authLoading) return
    if (!user?.id) {
      setOrgsEnabled(false)
      setOrganizations([])
      setMemberships([])
      setActiveOrganization(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const enabled = await detectOrganizationsEnabled()
    if (!enabled) {
      setOrgsEnabled(false)
      setOrganizations([])
      setMemberships([])
      setActiveOrganization(null)
      setLoading(false)
      return
    }

    const [orgResult, memberResult] = await Promise.all([
      listOrganizations(),
      listMembershipsForUser(user.id),
    ])

    if (!orgResult.enabled || !memberResult.enabled) {
      setOrgsEnabled(false)
      setOrganizations([])
      setMemberships([])
      setActiveOrganization(null)
      setLoading(false)
      return
    }

    setOrgsEnabled(true)
    setOrganizations(orgResult.data)
    setMemberships(memberResult.data)
    setActiveOrganization((prev) => {
      const next = pickActiveOrganization(memberResult.data, prev?.id ?? null)
      if (next) writeStoredActiveOrganizationId(next.id)
      return next
    })
    setLoading(false)
  }, [authLoading, user?.id])

  useEffect(() => {
    void refreshOrganizations()
  }, [refreshOrganizations])

  const setActiveOrganizationId = useCallback(
    (organizationId: string) => {
      const match =
        memberships.find((row) => row.organization_id === organizationId)?.organization ??
        organizations.find((org) => org.id === organizationId) ??
        null
      if (!match) return
      // Only allow switching into orgs the user can access (super admins still need membership rows).
      const allowed = memberships.some((row) => row.organization_id === organizationId && row.can_access)
      if (!allowed) return
      setActiveOrganization(match)
      writeStoredActiveOrganizationId(match.id)
    },
    [memberships, organizations],
  )

  const value = useMemo<OrganizationContextValue>(
    () => ({
      orgsEnabled,
      loading,
      organizations,
      memberships,
      activeOrganization,
      isOrgSuperAdmin: membershipIsSuperAdmin(memberships),
      setActiveOrganizationId,
      refreshOrganizations,
    }),
    [
      orgsEnabled,
      loading,
      organizations,
      memberships,
      activeOrganization,
      setActiveOrganizationId,
      refreshOrganizations,
    ],
  )

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>
}

export function useOrganization() {
  const context = useContext(OrganizationContext)
  if (!context) {
    throw new Error('useOrganization must be used within OrganizationProvider')
  }
  return context
}
