import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { UserRole } from '../pages/LoginPage'
import { can, formatRolePillLabel, permissionDeniedReason, type AppPermission } from '../lib/roles'
import { isFeedbackEnabled } from '../lib/feedbackEnabled'
import { FeedbackButton } from './FeedbackButton'
import { NavMessagesMenu } from './NavMessagesMenu'
import logo from '../assets/js-logo.png'

interface NavBarProps {
  role: UserRole
  username: string
  userId?: string | null
  onLogout: () => void
}

type NavDropdownItem = {
  to: string
  label: string
  end?: boolean
  extra?: ReactNode
  disabled?: boolean
  disabledReason?: string
}

function NavDropdown({ label, items }: { label: string; items: NavDropdownItem[] }) {
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const location = useLocation()

  const isActive = items.some((item) => {
    if (item.disabled) return false
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
          {items.map((item) =>
            item.disabled ? (
              <span
                key={item.to}
                role="menuitem"
                aria-disabled="true"
                className="nav-dropdown-item nav-item-disabled"
                title={item.disabledReason}
              >
                <span>{item.label}</span>
                {item.extra ?? null}
              </span>
            ) : (
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
            ),
          )}
        </div>
      ) : null}
    </div>
  )
}

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `nav-link ${isActive ? 'active' : ''}`
}

function RestrictedNavLink({
  to,
  role,
  permission,
  children,
}: {
  to: string
  role: UserRole
  permission: AppPermission
  children: ReactNode
}) {
  const allowed = can(role, permission)
  if (!allowed) {
    return (
      <span className="nav-link nav-item-disabled" title={permissionDeniedReason(permission)} aria-disabled="true">
        {children}
      </span>
    )
  }
  return (
    <NavLink to={to} className={navLinkClass}>
      {children}
    </NavLink>
  )
}

export function NavBar({ role, username, userId, onLogout }: NavBarProps) {
  const adminItems: NavDropdownItem[] = [
    {
      to: '/admin/manager-dashboard',
      label: 'Manager dashboard',
      disabled: !can(role, 'viewReports'),
      disabledReason: permissionDeniedReason('viewReports'),
    },
    {
      to: '/reports',
      label: 'Reports',
      disabled: !can(role, 'viewReports'),
      disabledReason: permissionDeniedReason('viewReports'),
    },
    { to: '/resources', label: 'Resources' },
    {
      to: '/admin/inventory',
      label: 'Customer Inventory',
      disabled: !can(role, 'openAdminTools'),
      disabledReason: permissionDeniedReason('openAdminTools'),
    },
    {
      to: '/technicians',
      label: 'Technicians',
      disabled: !can(role, 'manageTechnicians') && !can(role, 'openAdminTools'),
      disabledReason: permissionDeniedReason('manageTechnicians'),
    },
    {
      to: '/admin/employees',
      label: 'Employees',
    },
    {
      to: '/admin/lists',
      label: 'Manage lists',
      disabled: !can(role, 'manageLists'),
      disabledReason: permissionDeniedReason('manageLists'),
    },
    ...(isFeedbackEnabled()
      ? [
          {
            to: '/admin/feedback',
            label: 'Feedback inbox',
            disabled: !can(role, 'feedbackInbox'),
            disabledReason: permissionDeniedReason('feedbackInbox'),
          } satisfies NavDropdownItem,
        ]
      : []),
  ]

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div className="brand">
          <img src={logo} alt="JS Valve logo" className="brand-logo" />
          <span>JS Valve Job Board</span>
        </div>
        <nav className="nav-main-links" aria-label="Main">
          <NavLink to="/dashboard" className={navLinkClass}>
            Dashboard
          </NavLink>
          <NavLink to="/job-board" className={navLinkClass}>
            Status board
          </NavLink>
          <NavDropdown
            label="Quality Team"
            items={[
              { to: '/quality-team', label: 'ITP review & flags', end: true },
              {
                to: '/quality-team/mte-calibrations',
                label: 'MTE Calibrations',
                disabled: !can(role, 'manageLists'),
                disabledReason: permissionDeniedReason('manageLists'),
              },
            ]}
          />
          <RestrictedNavLink to="/new-job" role={role} permission="createJob">
            New job
          </RestrictedNavLink>
          <NavDropdown
            label="Valves"
            items={[
              { to: '/received-valves', label: 'Received valves' },
              { to: '/test-log-entry', label: 'Test log entry' },
              { to: '/valve-card-ticket', label: 'Valve card / ticket' },
            ]}
          />
          <NavDropdown label="Admin" items={adminItems} />
        </nav>
        <div className="nav-session">
          <FeedbackButton username={username} role={role} />
          {userId ? <NavMessagesMenu userId={userId} username={username} /> : null}
          <span className="username-pill">{username}</span>
          <span className="role-pill">{formatRolePillLabel(role)}</span>
          <button className="logout-button" type="button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}
