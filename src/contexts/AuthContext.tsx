import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import type { UserRole } from '../pages/LoginPage'
import { getProfileRole, resolveAppRole } from '../lib/auth'
import { normalizeEmployeeUsername } from '../lib/employeeAuth'
import { supabase } from '../lib/supabase'

const LOCAL_DEV_AUTH_KEY = 'js-job-board-local-dev-auth'

type AuthContextValue = {
  user: User | null
  username: string
  role: UserRole | null
  profileRole: string | null
  isAdmin: boolean
  loading: boolean
  handleLogin: (options?: { localRole?: UserRole; username?: string }) => Promise<void>
  handleLogout: () => Promise<void>
  refreshAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<UserRole | null>(null)
  const [profileRole, setProfileRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshAuth = useCallback(async () => {
    const localDevAuthEnabled =
      import.meta.env.DEV || import.meta.env.VITE_ENABLE_GENERIC_ADMIN_LOGIN === 'true'
    const localAuthRaw = localDevAuthEnabled ? window.localStorage.getItem(LOCAL_DEV_AUTH_KEY) : null
    if (localAuthRaw === 'admin') {
      setUser(null)
      setRole('admin')
      setProfileRole('admin')
      setUsername('Generic Admin')
      setLoading(false)
      return
    }

    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      setUser(null)
      setRole(null)
      setProfileRole(null)
      setUsername('')
      setLoading(false)
      return
    }

    const nextUser = data.user
    const nextProfileRole = await getProfileRole(nextUser.id)
    const metadataRole = String(nextUser.user_metadata?.role ?? nextUser.app_metadata?.role ?? '')

    const [{ data: employeeRow }, { data: technicianByUserId }] = await Promise.all([
      supabase.from('employees').select('full_name,username').eq('auth_user_id', nextUser.id).maybeSingle(),
      supabase.from('technicians').select('role,name,login_username').eq('user_id', nextUser.id).maybeSingle(),
    ])

    let technicianRow = technicianByUserId
    if (!technicianRow) {
      const emailLocal = nextUser.email?.split('@')[0]?.trim().toLowerCase() ?? ''
      const metadataUsername =
        typeof nextUser.user_metadata?.username === 'string'
          ? normalizeEmployeeUsername(nextUser.user_metadata.username)
          : ''
      const usernameCandidates = [
        ...new Set(
          [employeeRow?.username, metadataUsername, emailLocal]
            .map((value) => normalizeEmployeeUsername(String(value ?? '')))
            .filter(Boolean),
        ),
      ]
      for (const username of usernameCandidates) {
        const { data: byUsername } = await supabase
          .from('technicians')
          .select('role,name,login_username')
          .eq('login_username', username)
          .eq('active', true)
          .maybeSingle()
        if (byUsername) {
          technicianRow = byUsername
          break
        }
      }
    }

    const metadataUsername =
      typeof nextUser.user_metadata?.username === 'string'
        ? normalizeEmployeeUsername(nextUser.user_metadata.username)
        : ''
    const resolvedUsername = employeeRow?.username ?? technicianRow?.login_username ?? metadataUsername

    // Keep profiles.role in sync with technicians.role (shop source of truth).
    if (technicianRow?.role && nextUser.id) {
      const shopRole = String(technicianRow.role).trim().toLowerCase()
      const desiredProfileRole = shopRole === 'admin' ? 'admin' : 'viewer'
      if (nextProfileRole !== desiredProfileRole) {
        await supabase.from('profiles').update({ role: desiredProfileRole }).eq('id', nextUser.id)
      }
    }

    setUser(nextUser)
    setProfileRole(
      technicianRow?.role
        ? String(technicianRow.role).trim().toLowerCase() === 'admin'
          ? 'admin'
          : 'viewer'
        : nextProfileRole,
    )
    setRole(resolveAppRole(nextProfileRole, metadataRole, technicianRow?.role))
    setUsername(
      technicianRow?.name?.trim() ||
        employeeRow?.full_name?.trim() ||
        (nextUser.user_metadata?.name as string | undefined) ||
        (nextUser.user_metadata?.full_name as string | undefined) ||
        resolvedUsername ||
        nextUser.email ||
        '',
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    void refreshAuth()
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      // INITIAL_SESSION races with the refreshAuth() above under React Strict Mode and
      // used to trip gotrue's navigator lock timeout. Skip it — we already hydrate once.
      if (!active || event === 'INITIAL_SESSION') return
      void refreshAuth()
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [refreshAuth])

  const handleLogin = useCallback(
    async (options?: { localRole?: UserRole; username?: string }) => {
      if (options?.localRole === 'admin') {
        // Set local flag before signOut so onAuthStateChange/refreshAuth does not wipe Admin.
        window.localStorage.setItem(LOCAL_DEV_AUTH_KEY, 'admin')
        await supabase.auth.signOut()
        setUser(null)
        setRole('admin')
        setProfileRole('admin')
        setUsername(options.username ?? 'Generic Admin')
        setLoading(false)
        navigate('/dashboard', { replace: true })
        return
      }
      await refreshAuth()
      navigate('/dashboard', { replace: true })
    },
    [refreshAuth, navigate],
  )

  const handleLogout = useCallback(async () => {
    window.localStorage.removeItem(LOCAL_DEV_AUTH_KEY)
    await supabase.auth.signOut()
    setUser(null)
    setRole(null)
    setProfileRole(null)
    setUsername('')
    navigate('/login', { replace: true })
  }, [navigate])

  const value = useMemo(
    () => ({
      user,
      username,
      role,
      profileRole,
      // Shop Admin role (technicians / app role) — not profiles.role alone
      // (profiles often defaulted to admin for new Auth users).
      isAdmin: role === 'admin',
      loading,
      handleLogin,
      handleLogout,
      refreshAuth,
    }),
    [user, username, role, profileRole, loading, handleLogin, handleLogout, refreshAuth],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
