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
  switchableOrganizations,
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
  /** Companies available in the header switcher (all orgs for Superadmin). */
  switchableOrganizations: Organization[]
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

    const isSuper = membershipIsSuperAdmin(memberResult.data)
    setOrgsEnabled(true)
    setIsLocalOrganizations(backend === 'local')
    setOrganizations(orgResult.data)
    setMemberships(memberResult.data)
    setActiveOrganization((prev) => {
      const next = pickActiveOrganization(memberResult.data, prev?.id ?? null, {
        organizations: orgResult.data,
        isSuperAdmin: isSuper,
      })
      if (next) writeStoredActiveOrganizationId(next.id)
      return next
    })
    setLoading(false)
  }, [authLoading, user?.id, isLocalDevAuth, role])

  useEffect(() => {
    void refreshOrganizations()
  }, [refreshOrganizations])

  const isOrgSuperAdmin = membershipIsSuperAdmin(memberships)
  const switchable = useMemo(
    () => switchableOrganizations(memberships, organizations, isOrgSuperAdmin),
    [memberships, organizations, isOrgSuperAdmin],
  )

  const setActiveOrganizationId = useCallback(
    (organizationId: string) => {
      const membership = memberships.find(
        (row) => row.organization_id === organizationId && row.can_access,
      )
      const match = membership?.organization ?? null
      if (!match) return
      setActiveOrganization(match)
      writeStoredActiveOrganizationId(match.id)
    },
    [memberships],
  )

  const value = useMemo<OrganizationContextValue>(
    () => ({
      orgsEnabled,
      isLocalOrganizations,
      loading,
      organizations,
      memberships,
      switchableOrganizations: switchable,
      activeOrganization,
      isOrgSuperAdmin,
      setActiveOrganizationId,
      refreshOrganizations,
    }),
    [
      orgsEnabled,
      isLocalOrganizations,
      loading,
      organizations,
      memberships,
      switchable,
      activeOrganization,
      isOrgSuperAdmin,
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
