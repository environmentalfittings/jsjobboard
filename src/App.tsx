import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { ToastProvider } from './components/ToastNotification'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DashboardPage } from './pages/DashboardPage'
import { JobBoardPage } from './pages/JobBoardPage'
import { LoginPage } from './pages/LoginPage'
import { useEffect } from 'react'
import { ReportsPage } from './pages/ReportsPage'
import { StatusPrioritiesPage } from './pages/StatusPrioritiesPage'
import { TestLogEntryPage } from './pages/TestLogEntryPage'
import { ValveCardTicketPage } from './pages/ValveCardTicketPage'
import { NewJobPage } from './pages/NewJobPage'
import { AdminListsPage } from './pages/AdminListsPage'
import { AdminEmployeesPage } from './pages/AdminEmployeesPage'
import { AdminEmployeesPrintPage } from './pages/AdminEmployeesPrintPage'
import { ResourcesPage } from './pages/ResourcesPage'
import { TechniciansPage } from './pages/TechniciansPage'
import { MyWorkPage } from './pages/MyWorkPage'
import { ReceivedValvesPage } from './pages/ReceivedValvesPage'
import { TravelerPage } from './pages/TravelerPage'
import { ItpPage } from './pages/ItpPage'
import { CustomerLogin } from './pages/CustomerLogin'
import { CustomerPortal } from './pages/CustomerPortal'
import { CustomerTravelerView } from './pages/CustomerTravelerView'
import { TravelerInspectionPage } from './pages/TravelerInspectionPage'
import { FeedbackInboxPage } from './pages/FeedbackInboxPage'
import { MessagesPage } from './pages/MessagesPage'
import { ManagerDashboardPage } from './pages/ManagerDashboardPage'
import { can, canAccessEmployeesPage, canAccessTestLog, defaultHomePath, isShopRole } from './lib/roles'

function ShopRoute({ children }: { children: React.ReactNode }) {
  const { role } = useAuth()
  if (!role) return <Navigate to="/login" replace />
  if (!isShopRole(role)) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  const navigate = useNavigate()
  const { user, username, role, loading, handleLogin, handleLogout } = useAuth()

  useEffect(() => {
    if (!can(role, 'createJob')) return
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
      {loading ? null : role && isShopRole(role) ? (
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
                <ShopRoute>
                  <MyWorkPage user={user} onLogout={() => void handleLogout()} />
                </ShopRoute>
              }
            />
            <Route
              path="/supervisor-dashboard"
              element={<Navigate to={role ? defaultHomePath(role) : '/login'} replace />}
            />
            <Route
              path="/dashboard"
              element={
                <ShopRoute>
                  <DashboardPage />
                </ShopRoute>
              }
            />
            <Route
              path="/status-priorities"
              element={
                <ShopRoute>
                  <StatusPrioritiesPage />
                </ShopRoute>
              }
            />
            <Route
              path="/received-valves"
              element={
                <ShopRoute>
                  <ReceivedValvesPage />
                </ShopRoute>
              }
            />
            <Route
              path="/new-job"
              element={
                can(role, 'createJob') && role ? (
                  <NewJobPage role={role} />
                ) : role ? (
                  <Navigate to={defaultHomePath(role)} replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/job-board"
              element={
                <ShopRoute>
                  <JobBoardPage role={role ?? undefined} username={username} />
                </ShopRoute>
              }
            />
            <Route
              path="/jobs/:id"
              element={
                <ShopRoute>
                  <JobBoardPage role={role ?? undefined} username={username} />
                </ShopRoute>
              }
            />
            <Route
              path="/itp/:id"
              element={
                <ShopRoute>
                  <ItpPage />
                </ShopRoute>
              }
            />
            <Route
              path="/test-log-entry"
              element={
                canAccessTestLog(role) ? (
                  <TestLogEntryPage />
                ) : role ? (
                  <Navigate to={defaultHomePath(role)} replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/valve-card-ticket"
              element={
                <ShopRoute>
                  <ValveCardTicketPage />
                </ShopRoute>
              }
            />
            <Route
              path="/traveler/:valveId/inspection"
              element={
                <ShopRoute>
                  <TravelerInspectionPage />
                </ShopRoute>
              }
            />
            <Route
              path="/traveler/:valveId"
              element={
                <ShopRoute>
                  <TravelerPage />
                </ShopRoute>
              }
            />
            <Route
              path="/admin/manager-dashboard"
              element={
                can(role, 'viewReports') ? (
                  <ManagerDashboardPage />
                ) : role ? (
                  <Navigate to={defaultHomePath(role)} replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/reports"
              element={
                can(role, 'viewReports') ? (
                  <ReportsPage />
                ) : role ? (
                  <Navigate to={defaultHomePath(role)} replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/resources"
              element={
                <ShopRoute>
                  <ResourcesPage />
                </ShopRoute>
              }
            />
            <Route
              path="/technicians"
              element={
                can(role, 'manageTechnicians') || can(role, 'openAdminTools') ? (
                  <TechniciansPage />
                ) : role ? (
                  <Navigate to={defaultHomePath(role)} replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/admin/lists"
              element={
                can(role, 'manageLists') ? (
                  <AdminListsPage />
                ) : role ? (
                  <Navigate to={defaultHomePath(role)} replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/admin/employees"
              element={
                canAccessEmployeesPage(role) ? (
                  <AdminEmployeesPage isAdmin={can(role, 'manageEmployeeAccounts')} />
                ) : role ? (
                  <Navigate to={defaultHomePath(role)} replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/admin/employees/print-usernames"
              element={
                can(role, 'manageEmployeeAccounts') ? (
                  <AdminEmployeesPrintPage />
                ) : role ? (
                  <Navigate to={defaultHomePath(role)} replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
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
            <Route
              path="/admin/feedback"
              element={
                can(role, 'feedbackInbox') ? (
                  <FeedbackInboxPage />
                ) : role ? (
                  <Navigate to={defaultHomePath(role)} replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
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
