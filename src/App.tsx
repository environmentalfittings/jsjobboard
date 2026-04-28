import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { ToastProvider } from './components/ToastNotification'
import { DashboardPage } from './pages/DashboardPage'
import { JobBoardPage } from './pages/JobBoardPage'
import { LoginPage, type UserRole } from './pages/LoginPage'
import { useEffect, useState } from 'react'
import { ReportsPage } from './pages/ReportsPage'
import { TestLogEntryPage } from './pages/TestLogEntryPage'
import { ValveCardTicketPage } from './pages/ValveCardTicketPage'
import { NewJobPage } from './pages/NewJobPage'
import { AdminListsPage } from './pages/AdminListsPage'
import { ResourcesPage } from './pages/ResourcesPage'
import { TechniciansPage } from './pages/TechniciansPage'
import { MyWorkPage } from './pages/MyWorkPage'
import { SupervisorDashboardPage } from './pages/SupervisorDashboardPage'
import { supabase } from './lib/supabase'
import type { User } from '@supabase/supabase-js'

const LOCAL_DEV_AUTH_KEY = 'js-job-board-local-dev-auth'

function App() {
  const navigate = useNavigate()
  const [role, setRole] = useState<UserRole | null>(null)
  const [username, setUsername] = useState<string>('')
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [user, setUser] = useState<User | null>(null)

  const refreshAuth = async () => {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      const localDevAuthEnabled = import.meta.env.VITE_ENABLE_GENERIC_ADMIN_LOGIN === 'true'
      const localAuthRaw = localDevAuthEnabled ? window.localStorage.getItem(LOCAL_DEV_AUTH_KEY) : null
      if (localAuthRaw === 'admin') {
        setUser(null)
        setRole('admin')
        setUsername('Generic Admin')
      } else {
        setUser(null)
        setRole(null)
        setUsername('')
      }
      setLoadingAuth(false)
      return
    }
    const nextUser = data.user
    setUser(nextUser)
    const metaRole = String(nextUser.user_metadata?.role ?? nextUser.app_metadata?.role ?? '').toLowerCase()
    const resolvedRole: UserRole | null =
      metaRole === 'admin'
        ? 'admin'
        : metaRole === 'manager'
          ? 'manager'
          : metaRole === 'supervisor'
            ? 'supervisor'
            : metaRole === 'technician' || metaRole === 'tech'
              ? 'technician'
              : null
    setRole(resolvedRole)
    setUsername(
      (nextUser.user_metadata?.name as string | undefined) ||
        (nextUser.user_metadata?.full_name as string | undefined) ||
        nextUser.email ||
        '',
    )
    setLoadingAuth(false)
  }

  useEffect(() => {
    void refreshAuth()
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void refreshAuth()
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const handleLogin = async (options?: { localRole?: UserRole; username?: string }) => {
    if (options?.localRole === 'admin') {
      window.localStorage.setItem(LOCAL_DEV_AUTH_KEY, 'admin')
      setUser(null)
      setRole('admin')
      setUsername(options.username ?? 'Generic Admin')
      setLoadingAuth(false)
      return
    }
    await refreshAuth()
  }

  const handleLogout = async () => {
    window.localStorage.removeItem(LOCAL_DEV_AUTH_KEY)
    await supabase.auth.signOut()
    setUser(null)
    setRole(null)
    setUsername('')
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    if (!role || role !== 'admin') return
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.key === 'n' || e.key === 'N')) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const active = document.activeElement
      if (active) {
        const tag = active.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      }
      navigate('/new-job')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [role, navigate])

  return (
    <ToastProvider>
      <div className="app-shell">
        {loadingAuth ? null : role ? <NavBar role={role} username={username} onLogout={() => void handleLogout()} /> : null}
        <main className="page-content">
          {loadingAuth ? (
            <div className="loading">Checking login…</div>
          ) : (
            <Routes>
              <Route
                path="/login"
                element={
                  role ? (
                    <Navigate
                      to={role === 'admin' ? '/dashboard' : role === 'technician' ? '/my-work' : '/supervisor-dashboard'}
                      replace
                    />
                  ) : (
                    <LoginPage onLogin={handleLogin} />
                  )
                }
              />
              <Route
                path="/"
                element={
                  <Navigate
                    to={
                      role
                        ? role === 'admin'
                          ? '/dashboard'
                          : role === 'technician'
                            ? '/my-work'
                            : '/supervisor-dashboard'
                        : '/login'
                    }
                    replace
                  />
                }
              />
              <Route
                path="/my-work"
                element={
                  role === 'technician' ? (
                    <MyWorkPage user={user} onLogout={() => void handleLogout()} />
                  ) : role ? (
                    <Navigate to={role === 'admin' ? '/dashboard' : '/supervisor-dashboard'} replace />
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/supervisor-dashboard"
                element={
                  role === 'manager' || role === 'supervisor' ? (
                    <SupervisorDashboardPage
                      user={user}
                      appRole={role}
                      onLogout={() => void handleLogout()}
                    />
                  ) : role ? (
                    <Navigate to={role === 'admin' ? '/dashboard' : '/my-work'} replace />
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/dashboard"
                element={role === 'admin' ? <DashboardPage /> : role ? <Navigate to={role === 'technician' ? '/my-work' : '/supervisor-dashboard'} replace /> : <Navigate to="/login" replace />}
              />
              <Route path="/new-job" element={role === 'admin' ? <NewJobPage role={role} /> : <Navigate to="/login" replace />} />
              <Route path="/job-board" element={role === 'admin' || role === 'manager' || role === 'supervisor' ? <JobBoardPage /> : <Navigate to="/login" replace />} />
              <Route path="/jobs/:id" element={role === 'admin' || role === 'manager' || role === 'supervisor' ? <JobBoardPage /> : <Navigate to="/login" replace />} />
              <Route path="/test-log-entry" element={role === 'admin' ? <TestLogEntryPage /> : <Navigate to="/login" replace />} />
              <Route path="/valve-card-ticket" element={role === 'admin' ? <ValveCardTicketPage /> : <Navigate to="/login" replace />} />
              <Route path="/reports" element={role === 'admin' ? <ReportsPage /> : <Navigate to="/login" replace />} />
              <Route path="/resources" element={role === 'admin' ? <ResourcesPage /> : <Navigate to="/login" replace />} />
              <Route path="/technicians" element={role === 'admin' || role === 'manager' ? <TechniciansPage /> : <Navigate to="/login" replace />} />
              <Route path="/admin/lists" element={role === 'admin' ? <AdminListsPage /> : <Navigate to="/login" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </ToastProvider>
  )
}

export default App
