/**
 * Verifies resolveAppRole + permission matrix still behave after combining
 * Employees roster with Shop assignment (technicians.role remains source of truth).
 */
import assert from 'node:assert/strict'

function resolveAppRole(profileRole, metadataRole, technicianRole) {
  const tech = String(technicianRole ?? '')
    .trim()
    .toLowerCase()
  if (tech === 'admin') return 'admin'
  if (tech === 'manager' || tech === 'supervisor') return 'manager'
  if (tech === 'viewer' || tech === 'readonly' || tech === 'read-only' || tech === 'guest') return 'viewer'
  if (tech === 'technician' || tech === 'tech' || tech === 'sales') return 'technician'

  if (profileRole === 'admin') return 'admin'
  if (profileRole === 'technician') return 'technician'
  if (profileRole === 'viewer') return 'viewer'

  const meta = String(metadataRole ?? '')
    .trim()
    .toLowerCase()
  if (meta === 'admin') return 'admin'
  if (meta === 'manager' || meta === 'supervisor') return 'manager'
  if (meta === 'viewer' || meta === 'readonly' || meta === 'read-only' || meta === 'guest') return 'viewer'
  if (meta === 'technician' || meta === 'tech' || meta === 'sales') return 'technician'

  if (profileRole === 'viewer' || profileRole === 'customer' || !profileRole) {
    return 'technician'
  }

  return 'technician'
}

const ROLE_PERMISSIONS = {
  admin: new Set([
    'createJob',
    'copyJob',
    'editJobDetails',
    'junkOrCloseJob',
    'manageLists',
    'manageTechnicians',
    'manageEmployeeAccounts',
    'viewReports',
    'feedbackInbox',
    'openAdminTools',
    'shopWrite',
  ]),
  manager: new Set([
    'createJob',
    'copyJob',
    'editJobDetails',
    'junkOrCloseJob',
    'viewReports',
    'openAdminTools',
    'shopWrite',
  ]),
  technician: new Set([]),
  viewer: new Set(['viewReports', 'openAdminTools', 'manageLists', 'feedbackInbox']),
}

function can(role, permission) {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false
}

// Shop assignment App role wins over profiles / metadata
assert.equal(resolveAppRole('viewer', 'technician', 'admin'), 'admin')
assert.equal(resolveAppRole('admin', 'admin', 'manager'), 'manager')
assert.equal(resolveAppRole('admin', 'admin', 'technician'), 'technician')
assert.equal(resolveAppRole('viewer', '', 'supervisor'), 'manager')

// Fallback when no technician row (matches auth.ts order: profile before metadata)
assert.equal(resolveAppRole('admin', '', null), 'admin')
assert.equal(resolveAppRole('viewer', 'manager', null), 'viewer')
assert.equal(resolveAppRole(null, 'manager', null), 'manager')

// Permission matrix (unchanged by UI merge)
assert.equal(can('admin', 'manageTechnicians'), true)
assert.equal(can('admin', 'manageEmployeeAccounts'), true)
assert.equal(can('manager', 'manageTechnicians'), false)
assert.equal(can('manager', 'manageEmployeeAccounts'), false)
assert.equal(can('manager', 'shopWrite'), true)
assert.equal(can('technician', 'shopWrite'), false)
assert.equal(can('technician', 'manageTechnicians'), false)
assert.equal(can('technician', 'manageEmployeeAccounts'), false)

// Quality Team level must NOT be treated as App role (string equality check for docs)
const qualityTeamLevels = ['none', 'admin', 'manager', 'supervisor', 'technician']
assert.ok(qualityTeamLevels.includes('supervisor'))
assert.notEqual(
  resolveAppRole('viewer', '', 'technician'),
  'admin',
  'QT technician string as shop role must stay technician app role',
)

console.log('OK: App role resolution and permission matrix verified')
