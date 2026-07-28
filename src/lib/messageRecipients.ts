import { normalizeEmployeeUsername } from './employeeAuth'
import { supabase } from './supabase'
import type { Employee } from '../types/employees'

export type MessageRecipient = {
  key: string
  authUserId: string
  fullName: string
}

type TechnicianRecipientRow = {
  id: number
  name: string
  employee_id: string | null
  user_id: string | null
  login_username: string | null
  active: boolean
}

export async function loadTechniciansForMessages(): Promise<TechnicianRecipientRow[]> {
  const { data, error } = await supabase
    .from('technicians')
    .select('id,name,employee_id,user_id,login_username,active')
    .eq('active', true)

  if (error) return []
  return (data as TechnicianRecipientRow[] | null) ?? []
}

/**
 * Message "To" list: active employees who can receive mail (auth user id).
 * Uses employees.auth_user_id, with technicians.user_id as fallback when the roster link is missing.
 */
export function buildMessageRecipients(
  employees: Employee[],
  technicians: TechnicianRecipientRow[],
  currentUserId: string,
): MessageRecipient[] {
  const map = new Map<string, MessageRecipient>()

  const techByEmployeeNo = new Map<string, TechnicianRecipientRow>()
  const techByUsername = new Map<string, TechnicianRecipientRow>()
  for (const tech of technicians) {
    if (!tech.active || !tech.user_id) continue
    const employeeNo = tech.employee_id?.trim()
    if (employeeNo) techByEmployeeNo.set(employeeNo, tech)
    const login = tech.login_username?.trim()
    if (login) techByUsername.set(normalizeEmployeeUsername(login), tech)
  }

  for (const employee of employees) {
    if (!employee.is_active) continue

    let authUserId = employee.auth_user_id
    if (!authUserId) {
      const tech =
        techByEmployeeNo.get(employee.employee_no.trim()) ??
        techByUsername.get(normalizeEmployeeUsername(employee.username))
      authUserId = tech?.user_id ?? null
    }

    if (!authUserId || authUserId === currentUserId) continue

    map.set(authUserId, {
      key: employee.id,
      authUserId,
      fullName: employee.full_name.trim() || 'Employee',
    })
  }

  for (const tech of technicians) {
    if (!tech.active || !tech.user_id || tech.user_id === currentUserId) continue
    if (map.has(tech.user_id)) continue
    map.set(tech.user_id, {
      key: `technician-${tech.id}`,
      authUserId: tech.user_id,
      fullName: tech.name.trim() || 'Employee',
    })
  }

  return [...map.values()].sort((a, b) => a.fullName.localeCompare(b.fullName))
}

export function messageRecipientName(
  recipients: MessageRecipient[],
  authUserId: string | null | undefined,
): string | null {
  if (!authUserId) return null
  return recipients.find((row) => row.authUserId === authUserId)?.fullName ?? null
}
