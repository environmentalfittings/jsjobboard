import { isLocalOrganizationsDevMode } from './localOrganizations'

/**
 * Local Vite DEV multi-company demo talks to the same Supabase project as
 * production. Automatic / scoped sync must never delete shared JS Valve rows.
 */
export function isLocalMultiCompanyDemo(): boolean {
  return isLocalOrganizationsDevMode()
}

/** True when destructive sync against shared shop tables must be skipped. */
export function blockSharedShopDeletes(): boolean {
  return isLocalOrganizationsDevMode()
}

export const SHARED_SHOP_DELETE_BLOCKED_MESSAGE =
  'Local multi-company demo will not delete live JS Valve data. Switch off the demo or use a separate Supabase project before destructive edits.'
