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
  LOCAL_DEV_ADMIN_USER_ID,
  listMembershipsForUser,
  listOrganizations,
  membershipIsSuperAdmin,
  pickActiveOrganization,
  resolveOrganizationsBackend,
  writeStoredActiveOrganizationId,
} from '../lib/organizations'
import type { Organization, OrganizationMembership } from '../types/organizations'

type OrganizationContextValue = {
  /** False when migration has not been run and local DEV fallback is off. */
  orgsEnabled: boolean
  /** True when using localStorage demo companies (Vite DEV, SQL not applied). */
  isLocalOrganizations: boolean
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
  const { user, role, isLocalDevAuth, loading: authLoading } = useAuth()
  const [orgsEnabled, setOrgsEnabled] = useState(false)
  const [isLocalOrganizations, setIsLocalOrganizations] = useState(false)
  const [loading, setLoading] = useState(true)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([])
  const [activeOrganization, setActiveOrganization] = useState<Organization | null>(null)

  const refreshOrganizations = useCallback(async () => {
    if (authLoading) return

    const signedIn = Boolean(user?.id) || (isLocalDevAuth && Boolean(role))
    if (!signedIn) {
      setOrgsEnabled(false)
      setIsLocalOrganizations(false)
      setOrganizations([])
      setMemberships([])
      setActiveOrganization(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const backend = await resolveOrganizationsBackend()
    if (backend === 'none') {
      setOrgsEnabled(false)
      setIsLocalOrganizations(false)
      setOrganizations([])
      setMemberships([])
      setActiveOrganization(null)
      setLoading(false)
      return
    }

    const membershipUserId = user?.id ?? (isLocalDevAuth ? LOCAL_DEV_ADMIN_USER_ID : '')
    const [orgResult, memberResult] = await Promise.all([
      listOrganizations(),
      listMembershipsForUser(membershipUserId),
    ])

    if (!orgResult.enabled || !memberResult.enabled) {
      setOrgsEnabled(false)
      setIsLocalOrganizations(false)
      setOrganizations([])
      setMemberships([])
      setActiveOrganization(null)
      setLoading(false)
      return
    }

    setOrgsEnabled(true)
    setIsLocalOrganizations(backend === 'local')
    setOrganizations(orgResult.data)
    setMemberships(memberResult.data)
    setActiveOrganization((prev) => {
      const next = pickActiveOrganization(memberResult.data, prev?.id ?? null)
      if (next) writeStoredActiveOrganizationId(next.id)
      return next
    })
    setLoading(false)
  }, [authLoading, user?.id, isLocalDevAuth, role])

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
      isLocalOrganizations,
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
      isLocalOrganizations,
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
