import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { UserRole } from '../pages/LoginPage'
import { can, formatRolePillLabel, permissionDeniedReason, type AppPermission } from '../lib/roles'
import { isFeedbackEnabled } from '../lib/feedbackEnabled'
import { FeedbackButton } from './FeedbackButton'
import { useOrganization } from '../contexts/OrganizationContext'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import { companyLogoUrl } from '../lib/companyBranding'
import { CompanySwitcher } from './CompanySwitcher'
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

function NavDropdown({
  label,
  items,
  align = 'left',
  triggerClassName,
}: {
  label: ReactNode
  items: NavDropdownItem[]
  align?: 'left' | 'right'
  triggerClassName?: string
}) {
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
    <div className={`nav-dropdown${align === 'right' ? ' nav-dropdown--right' : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`nav-dropdown-trigger ${isActive ? 'active' : ''}${triggerClassName ? ` ${triggerClassName}` : ''}`}
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
                key={`${item.to}:${item.label}`}
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

function AccountMenu({
  username,
  roleLabel,
  isOrgSuperAdmin,
  onLogout,
  feedback,
}: {
  username: string
  roleLabel: string
  isOrgSuperAdmin: boolean
  onLogout: () => void
  feedback: ReactNode
}) {
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const location = useLocation()

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

  const displayName = username.trim() || roleLabel

  return (
    <div className="nav-dropdown nav-dropdown--right nav-account" ref={rootRef}>
      <button
        type="button"
        className={`nav-dropdown-trigger nav-account-trigger${open ? ' active' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        title={`${displayName} · ${roleLabel}`}
      >
        <span className="nav-account-name">{displayName}</span>
        <span className={`nav-account-role${isOrgSuperAdmin ? ' nav-account-role--superadmin' : ''}`}>
          {roleLabel}
        </span>
        <span className="nav-dropdown-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="nav-dropdown-menu nav-account-menu" id={menuId} role="menu">
          <div className="nav-account-summary">
            <strong>{displayName}</strong>
            <span>{roleLabel}</span>
          </div>
          {feedback}
          <button type="button" className="nav-dropdown-item nav-account-logout" role="menuitem" onClick={onLogout}>
            Logout
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function NavBar({ role, username, userId, onLogout }: NavBarProps) {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobileNav, setIsMobileNav] = useState(false)
  const mobilePanelId = useId()

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)')
    const sync = () => setIsMobileNav(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

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

  const shopItems: NavDropdownItem[] = [
    { to: '/job-board', label: 'Status board' },
    { to: '/calendar', label: 'Calendar' },
    { to: '/shop-tv', label: 'TV board' },
    { to: '/needed-parts', label: 'Needs parts' },
  ]

  const messagesMenu = userId ? <NavMessagesMenu userId={userId} username={username} /> : null
  const { orgsEnabled, activeOrganization, isOrgSuperAdmin } = useOrganization()
  const workflow = useCompanyWorkflow()
  const brandLogo = (orgsEnabled && companyLogoUrl(activeOrganization)) || logo
  const brandName = orgsEnabled && activeOrganization ? activeOrganization.name : 'JS Valve'
  const brandFull =
    orgsEnabled && activeOrganization
      ? `${activeOrganization.name} Job Board`
      : 'JS Valve Job Board'
  const brandLogoClass = workflow.key === 'vsi' ? 'brand-logo brand-logo--vsi' : 'brand-logo'
  const roleLabel = isOrgSuperAdmin ? 'Superadmin' : formatRolePillLabel(role)
  const accountUsername =
    username && !(isOrgSuperAdmin && /^superadmin$/i.test(username.trim())) ? username : roleLabel

  const feedbackControl =
    role !== 'viewer' && isFeedbackEnabled() ? (
      <div className="nav-account-feedback">
        <FeedbackButton username={username} role={role} />
      </div>
    ) : null

  return (
    <header className={`navbar${mobileOpen ? ' navbar--menu-open' : ''}`}>
      <div className="navbar-inner">
        <div className="brand">
          <img src={brandLogo} alt={`${brandName} logo`} className={brandLogoClass} />
          <span className="brand-text">
            <span className="brand-text-full">{brandFull}</span>
            <span className="brand-text-short">{brandName}</span>
          </span>
        </div>

        <div className="nav-top-actions">
          {isMobileNav ? messagesMenu : null}
          <button
            type="button"
            className="nav-menu-toggle"
            aria-expanded={mobileOpen}
            aria-controls={mobilePanelId}
            onClick={() => setMobileOpen((value) => !value)}
          >
            <span className="nav-menu-toggle-bars" aria-hidden>
              <span />
              <span />
              <span />
            </span>
            {mobileOpen ? 'Close' : 'Menu'}
          </button>
        </div>

        <nav className="nav-main-links" id={mobilePanelId} aria-label="Main">
          <NavLink to="/dashboard" className={navLinkClass} end>
            Dashboard
          </NavLink>
          <NavDropdown label="Shop" items={shopItems} />
          <RestrictedNavLink to="/new-job" role={role} permission="createJob">
            New job
          </RestrictedNavLink>
          <NavDropdown
            label="Quality"
            items={[
              { to: '/quality-team', label: 'ITP review & flags', end: true },
              { to: '/quality-team', label: 'INCRs' },
              {
                to: '/quality-team/mte-calibrations',
                label: 'MTE Calibrations',
                disabled: !can(role, 'manageLists'),
                disabledReason: permissionDeniedReason('manageLists'),
              },
            ]}
          />
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
          <CompanySwitcher />
          {!isMobileNav ? messagesMenu : null}
          <AccountMenu
            username={accountUsername}
            roleLabel={roleLabel}
            isOrgSuperAdmin={isOrgSuperAdmin}
            onLogout={onLogout}
            feedback={feedbackControl}
          />
        </div>
      </div>
    </header>
  )
}
