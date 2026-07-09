import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { ToastProvider } from './components/ToastNotification'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DashboardPage } from './pages/DashboardPage'
import { JobBoardPage } from './pages/JobBoardPage'
import { LoginPage } from './pages/LoginPage'
import { useEffect } from 'react'
import { ReportsPage } from './pages/ReportsPage'
import { TestLogEntryPage } from './pages/TestLogEntryPage'
import { ValveCardTicketPage } from './pages/ValveCardTicketPage'
import { NewJobPage } from './pages/NewJobPage'
import { AdminListsPage } from './pages/AdminListsPage'
import { AdminEmployeesPage } from './pages/AdminEmployeesPage'
import { AdminEmployeesPrintPage } from './pages/AdminEmployeesPrintPage'
import { ResourcesPage } from './pages/ResourcesPage'
import { TechniciansPage } from './pages/TechniciansPage'
import { MyWorkPage } from './pages/MyWorkPage'
import { SupervisorDashboardPage } from './pages/SupervisorDashboardPage'
import { ReceivedValvesPage } from './pages/ReceivedValvesPage'
import { TravelerPage } from './pages/TravelerPage'
import { ItpPage } from './pages/ItpPage'
import { CustomerLogin } from './pages/CustomerLogin'
import { CustomerPortal } from './pages/CustomerPortal'
import { CustomerTravelerView } from './pages/CustomerTravelerView'
import { TravelerInspectionPage } from './pages/TravelerInspectionPage'
import { FeedbackInboxPage } from './pages/FeedbackInboxPage'
import { MessagesPage } from './pages/MessagesPage'
import { canAccessEmployeesPage, canAccessTestLog, defaultHomePath, hasAdminAccess } from './lib/roles'

function AppRoutes() {
  const navigate = useNavigate()
  const { user, username, role, isAdmin, loading, handleLogin, handleLogout } = useAuth()

  useEffect(() => {
    if (!hasAdminAccess(role)) return
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
    <div className="app-shell">
      {loading ? null : role ? (
        <NavBar role={role} username={username} userId={user?.id ?? null} onLogout={() => void handleLogout()} />
      ) : null}
      <main className="page-content">
        {loading ? (
          <div className="loading">Checking login…</div>
        ) : (
          <Routes>
            <Route
              path="/login"
              element={role ? <Navigate to={defaultHomePath(role)} replace /> : <LoginPage onLogin={handleLogin} />}
            />
            <Route
              path="/"
              element={<Navigate to={role ? defaultHomePath(role) : user ? '/customer-portal' : '/login'} replace />}
            />
            <Route path="/customer-login" element={<CustomerLogin />} />
            <Route path="/customer-portal" element={user ? <CustomerPortal /> : <Navigate to="/customer-login" replace />} />
            <Route
              path="/customer-portal/traveler/:valveId"
              element={user ? <CustomerTravelerView /> : <Navigate to="/customer-login" replace />}
            />
            <Route
              path="/my-work"
              element={
                role === 'technician' ? (
                  <MyWorkPage user={user} onLogout={() => void handleLogout()} />
                ) : role ? (
                  <Navigate to={defaultHomePath(role)} replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/supervisor-dashboard"
              element={
                role === 'supervisor' ? (
                  <SupervisorDashboardPage user={user} appRole={role} onLogout={() => void handleLogout()} />
                ) : role ? (
                  <Navigate to={defaultHomePath(role)} replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/dashboard"
              element={
                hasAdminAccess(role) ? (
                  <DashboardPage />
                ) : role ? (
                  <Navigate to={defaultHomePath(role)} replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route path="/received-valves" element={hasAdminAccess(role) ? <ReceivedValvesPage /> : <Navigate to="/login" replace />} />
            <Route
              path="/new-job"
              element={hasAdminAccess(role) ? <NewJobPage role={role!} /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/job-board"
              element={
                role === 'admin' || role === 'manager' || role === 'supervisor' || role === 'sales' || role === 'technician' ? (
                  <JobBoardPage role={role ?? undefined} username={username} />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/jobs/:id"
              element={
                role === 'admin' || role === 'manager' || role === 'supervisor' || role === 'sales' || role === 'technician' ? (
                  <JobBoardPage role={role ?? undefined} username={username} />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/itp/:id"
              element={role === 'admin' || role === 'manager' || role === 'supervisor' ? <ItpPage /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/test-log-entry"
              element={
                canAccessTestLog(role) ? <TestLogEntryPage /> : role ? <Navigate to={defaultHomePath(role)} replace /> : <Navigate to="/login" replace />
              }
            />
            <Route path="/valve-card-ticket" element={hasAdminAccess(role) ? <ValveCardTicketPage /> : <Navigate to="/login" replace />} />
            <Route
              path="/traveler/:valveId/inspection"
              element={hasAdminAccess(role) ? <TravelerInspectionPage /> : <Navigate to="/login" replace />}
            />
            <Route path="/traveler/:valveId" element={hasAdminAccess(role) ? <TravelerPage /> : <Navigate to="/login" replace />} />
            <Route path="/reports" element={hasAdminAccess(role) ? <ReportsPage /> : <Navigate to="/login" replace />} />
            <Route path="/resources" element={hasAdminAccess(role) ? <ResourcesPage /> : <Navigate to="/login" replace />} />
            <Route path="/technicians" element={hasAdminAccess(role) ? <TechniciansPage /> : <Navigate to="/login" replace />} />
            <Route path="/admin/lists" element={hasAdminAccess(role) ? <AdminListsPage /> : <Navigate to="/login" replace />} />
            <Route
              path="/admin/employees"
              element={
                canAccessEmployeesPage(role) ? (
                  <AdminEmployeesPage isAdmin={isAdmin} />
                ) : role ? (
                  <Navigate to={defaultHomePath(role)} replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/admin/employees/print-usernames"
              element={hasAdminAccess(role) ? <AdminEmployeesPrintPage /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/messages"
              element={
                user && role ? (
                  <MessagesPage userId={user.id} username={username} homePath={defaultHomePath(role)} />
                ) : role ? (
                  <Navigate to={defaultHomePath(role)} replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route path="/admin/feedback" element={role === 'admin' ? <FeedbackInboxPage /> : <Navigate to="/login" replace />} />
          </Routes>
        )}
      </main>
    </div>
  )
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ToastProvider>
  )
}

export default App
