import { NavLink } from 'react-router-dom'
import type { UserRole } from '../pages/LoginPage'
import logo from '../assets/js-logo.png'

interface NavBarProps {
  role: UserRole
  username: string
  onLogout: () => void
}

export function NavBar({ role, username, onLogout }: NavBarProps) {
  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div className="brand">
          <img src={logo} alt="JS Valve logo" className="brand-logo" />
          <span>JS Valve Job Board</span>
        </div>
        <div className="nav-main-links">
          {role === 'admin' ? (
            <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Dashboard
            </NavLink>
          ) : role === 'manager' || role === 'supervisor' ? (
            <NavLink to="/supervisor-dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Supervisor Dashboard
            </NavLink>
          ) : (
            <NavLink to="/my-work" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              My Work
            </NavLink>
          )}
          {role === 'admin' ? (
            <NavLink to="/new-job" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              New job <kbd className="nav-shortcut-kbd">N</kbd>
            </NavLink>
          ) : null}
          {role === 'admin' || role === 'manager' || role === 'supervisor' ? (
            <>
              <NavLink to="/job-board" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Status board
              </NavLink>
            </>
          ) : null}
          {role === 'admin' ? (
            <>
              <NavLink to="/test-log-entry" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Test log entry
              </NavLink>
              <NavLink to="/valve-card-ticket" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Valve card / ticket
              </NavLink>
              <NavLink to="/reports" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Reports
              </NavLink>
              <NavLink to="/resources" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Resources
              </NavLink>
              <NavLink to="/technicians" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Technicians
              </NavLink>
            </>
          ) : role === 'manager' ? (
            <NavLink to="/technicians" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Technicians
            </NavLink>
          ) : null}
          {role === 'admin' ? (
            <NavLink to="/admin/lists" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Manage lists
            </NavLink>
          ) : null}
        </div>
        <div className="nav-session">
          <span className="username-pill">{username}</span>
          <span className="role-pill">{role.charAt(0).toUpperCase() + role.slice(1)}</span>
          <button className="logout-button" type="button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}
