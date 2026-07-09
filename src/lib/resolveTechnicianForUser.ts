import type { User } from '@supabase/supabase-js'
import { normalizeEmployeeUsername } from './employeeAuth'
import { supabase } from './supabase'
import type { Technician } from '../types'

const TECHNICIAN_SELECT =
  'id,name,employee_id,work_cell_specialties,group_team,active,user_id,login_email,created_at,updated_at'

export type ResolvedTechnicianProfile = {
  technician: Technician | null
  displayName: string
}

function displayNameFromUser(user: User): string {
  const metaName =
    (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
    (typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim()) ||
    ''
  if (metaName) return metaName

  const email = user.email?.trim()
  if (!email) return 'Technician'

  const localPart = email.split('@')[0]?.trim()
  if (localPart) return localPart

  return email
}

function usernameFromLoginEmail(email: string | null | undefined) {
  if (!email?.includes('@')) return ''
  return normalizeEmployeeUsername(email.split('@')[0] ?? '')
}

function parseTechnicianRow(raw: unknown): Technician | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'number') return null
  return raw as Technician
}

export async function resolveTechnicianForUser(user: User): Promise<ResolvedTechnicianProfile> {
  const { data: rpcRow, error: rpcError } = await supabase.rpc('get_my_technician_profile')
  if (!rpcError) {
    const technician = parseTechnicianRow(rpcRow)
    if (technician) {
      return {
        technician,
        displayName: technician.name?.trim() || displayNameFromUser(user),
      }
    }
  }

  const { data: byUserId, error: byUserIdError } = await supabase
    .from('technicians')
    .select(TECHNICIAN_SELECT)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!byUserIdError && byUserId) {
    return {
      technician: byUserId as Technician,
      displayName: (byUserId as Technician).name?.trim() || displayNameFromUser(user),
    }
  }

  const email = user.email?.trim().toLowerCase()
  if (email) {
    const { data: byEmail } = await supabase
      .from('technicians')
      .select(TECHNICIAN_SELECT)
      .ilike('login_email', email)
      .maybeSingle()

    if (byEmail) {
      return {
        technician: byEmail as Technician,
        displayName: (byEmail as Technician).name?.trim() || displayNameFromUser(user),
      }
    }
  }

  const metadataUsername =
    typeof user.user_metadata?.username === 'string' ? normalizeEmployeeUsername(user.user_metadata.username) : ''
  const usernameFromEmail = usernameFromLoginEmail(email)
  const usernameCandidates = [...new Set([metadataUsername, usernameFromEmail].filter(Boolean))]

  for (const username of usernameCandidates) {
    const { data: byUsername } = await supabase
      .from('technicians')
      .select(TECHNICIAN_SELECT)
      .eq('login_username', username)
      .maybeSingle()

    if (byUsername) {
      return {
        technician: byUsername as Technician,
        displayName: (byUsername as Technician).name?.trim() || displayNameFromUser(user),
      }
    }
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('full_name,username')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (employee?.full_name?.trim()) {
    return { technician: null, displayName: employee.full_name.trim() }
  }

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  if (profile?.full_name?.trim()) {
    return { technician: null, displayName: profile.full_name.trim() }
  }

  return { technician: null, displayName: displayNameFromUser(user) }
}
