import type { SupabaseClient } from '@supabase/supabase-js'
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

/** Internal auth email — never shown in the UI. */
export function toSupabaseEmail(username: string) {
  return `${normalizeEmployeeUsername(username)}@${EMPLOYEE_LOGIN_EMAIL_DOMAIN}`
}

export function fromSupabaseEmail(email: string) {
  return email.replace(`@${EMPLOYEE_LOGIN_EMAIL_DOMAIN}`, '')
}

export async function signInWithUsername(client: SupabaseClient, username: string, password: string) {
  return client.auth.signInWithPassword({
    email: toSupabaseEmail(username),
    password,
  })
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
