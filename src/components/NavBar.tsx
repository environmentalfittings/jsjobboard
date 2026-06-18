import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { UserRole } from '../pages/LoginPage'
import logo from '../assets/js-logo.png'

interface NavBarProps {
  role: UserRole
  username: string
  onLogout: () => void
}

type NavDropdownItem = {
  to: string
  label: string
  end?: boolean
  extra?: ReactNode
}

function NavDropdown({ label, items }: { label: string; items: NavDropdownItem[] }) {
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const location = useLocation()

  const isActive = items.some((item) => {
    if (item.end) return location.pathname === item.to
    return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
  })

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="nav-dropdown" ref={rootRef}>
      <button
        type="button"
        className={`nav-dropdown-trigger ${isActive ? 'active' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <span className="nav-dropdown-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="nav-dropdown-menu" id={menuId} role="menu">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              role="menuitem"
              className={({ isActive: linkActive }) => `nav-dropdown-item ${linkActive ? 'active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <span>{item.label}</span>
              {item.extra ?? null}
            </NavLink>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `nav-link ${isActive ? 'active' : ''}`
}

export function NavBar({ role, username, onLogout }: NavBarProps) {
  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div className="brand">
          <img src={logo} alt="JS Valve logo" className="brand-logo" />
          <span>JS Valve Job Board</span>
        </div>
        <nav className="nav-main-links" aria-label="Main">
          {role === 'admin' ? (
            <>
              <NavLink to="/dashboard" className={navLinkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/job-board" className={navLinkClass}>
                Status board
              </NavLink>
              <NavDropdown
                label="Valves"
                items={[
                  { to: '/received-valves', label: 'Received valves' },
                  { to: '/test-log-entry', label: 'Test log entry' },
                  { to: '/valve-card-ticket', label: 'Valve card / ticket' },
                ]}
              />
              <NavDropdown
                label="Admin"
                items={[
                  { to: '/reports', label: 'Reports' },
                  { to: '/resources', label: 'Resources' },
                  { to: '/technicians', label: 'Technicians' },
                  { to: '/admin/lists', label: 'Manage lists' },
                ]}
              />
            </>
          ) : role === 'manager' || role === 'supervisor' ? (
            <>
              <NavLink to="/supervisor-dashboard" className={navLinkClass}>
                Supervisor dashboard
              </NavLink>
              <NavLink to="/job-board" className={navLinkClass}>
                Status board
              </NavLink>
              {role === 'manager' ? (
                <NavLink to="/technicians" className={navLinkClass}>
                  Technicians
                </NavLink>
              ) : null}
            </>
          ) : (
            <NavLink to="/my-work" className={navLinkClass}>
              My Work
            </NavLink>
          )}
        </nav>
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
