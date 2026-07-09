import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserRole } from '../pages/LoginPage'
import { EMPLOYEE_LOGIN_EMAIL_DOMAIN, normalizeEmployeeUsername } from './employeeAuth'
import { supabase } from './supabase'

/** Load profile role from `profiles`. Defaults to `viewer` when missing. */
export async function getUserRole(client: SupabaseClient, userId: string): Promise<string> {
  const { data } = await client.from('profiles').select('role').eq('id', userId).single()
  return data?.role ?? 'viewer'
}

export async function getCurrentUserRole(userId: string): Promise<string> {
  return getUserRole(supabase, userId)
}

export async function getProfileRole(userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
  return data?.role ?? null
}

export function resolveAppRole(profileRole: string | null, metadataRole: string): UserRole {
  if (profileRole === 'admin') return 'admin'
  if (profileRole === 'technician') return 'technician'

  const meta = metadataRole.trim().toLowerCase()
  if (meta === 'admin') return 'admin'
  if (meta === 'manager') return 'manager'
  if (meta === 'supervisor') return 'supervisor'
  if (meta === 'technician' || meta === 'tech') return 'technician'
  if (meta === 'sales') return 'sales'

  if (profileRole === 'viewer' || profileRole === 'customer' || !profileRole) {
    return 'technician'
  }

  return 'technician'
}

/** Internal auth email — never shown in the UI. */
export function toSupabaseEmail(username: string) {
  return `${normalizeEmployeeUsername(username)}@${EMPLOYEE_LOGIN_EMAIL_DOMAIN}`
}

export function fromSupabaseEmail(email: string) {
  return email.replace(`@${EMPLOYEE_LOGIN_EMAIL_DOMAIN}`, '')
}

function shopLoginEmailCandidates(username: string, preferredEmail?: string | null) {
  const normalized = normalizeEmployeeUsername(username)
  const domains = [
    EMPLOYEE_LOGIN_EMAIL_DOMAIN,
    'jsvalve.com',
    String(import.meta.env.VITE_LOGIN_EMAIL_DOMAIN ?? '').trim(),
    'users.jsvalve.local',
  ].filter(Boolean)

  const emails = [
    preferredEmail?.trim().toLowerCase(),
    ...domains.map((domain) => `${normalized}@${domain}`),
  ].filter((value): value is string => Boolean(value && value.includes('@')))

  return [...new Set(emails)]
}

export async function resolveShopLoginEmail(client: SupabaseClient, username: string): Promise<string | null> {
  const { data, error } = await client.rpc('resolve_shop_login_email', {
    p_username: normalizeEmployeeUsername(username),
  })
  if (!error && typeof data === 'string' && data.includes('@')) {
    return data.trim().toLowerCase()
  }
  return null
}

export type ShopLoginStatus = 'not_found' | 'no_account' | 'inactive' | 'ready'

export async function getShopLoginStatus(
  client: SupabaseClient,
  username: string,
): Promise<ShopLoginStatus | null> {
  const { data, error } = await client.rpc('employee_shop_login_status', {
    p_username: normalizeEmployeeUsername(username),
  })
  if (error || typeof data !== 'string') return null
  if (data === 'not_found' || data === 'no_account' || data === 'inactive' || data === 'ready') {
    return data
  }
  return null
}

export async function signInWithUsername(client: SupabaseClient, username: string, password: string) {
  const normalized = normalizeEmployeeUsername(username)
  const preferredEmail = await resolveShopLoginEmail(client, normalized)
  const emails = shopLoginEmailCandidates(normalized, preferredEmail)

  let lastError: { message: string } | null = null
  for (const email of emails) {
    const { error } = await client.auth.signInWithPassword({ email, password })
    if (!error) return { error: null }
    lastError = error
  }

  return { error: lastError }
}

export const MIN_EMPLOYEE_PASSWORD_LENGTH = 8

export function validateEmployeePassword(password: string, confirm?: string): string | null {
  if (password.length < MIN_EMPLOYEE_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_EMPLOYEE_PASSWORD_LENGTH} characters`
  }
  if (confirm !== undefined && password !== confirm) {
    return 'Passwords do not match'
  }
  return null
}
