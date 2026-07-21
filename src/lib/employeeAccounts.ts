import { supabase } from './supabase'

type AccountResult = { ok: true; user_id?: string } | { ok: false; error: string; needsDeploy?: boolean }

export type EmployeeAccountStatus = {
  employee_id: string
  last_sign_in_at: string | null
}

async function invokeManageEmployeeAccount(body: Record<string, unknown>): Promise<AccountResult> {
  const { data, error } = await supabase.functions.invoke('manage-employee-account', { body })
  if (error) {
    const msg = error.message || 'Account request failed'
    if (/failed to fetch|404|not found|function/i.test(msg)) {
      return { ok: false, error: msg, needsDeploy: true }
    }
    return { ok: false, error: msg }
  }
  const payload = (data ?? {}) as { error?: string; success?: boolean; user_id?: string }
  if (payload.error) {
    return { ok: false, error: payload.error }
  }
  return { ok: true, user_id: payload.user_id }
}

export async function createEmployeeAccount(options: {
  employee_id: string
  username: string
  password: string
  full_name: string
}): Promise<AccountResult> {
  return invokeManageEmployeeAccount({
    action: 'create',
    employee_id: options.employee_id,
    username: options.username,
    password: options.password,
    full_name: options.full_name,
  })
}

export async function resetEmployeePassword(options: {
  employee_id: string
  new_password: string
}): Promise<AccountResult> {
  return invokeManageEmployeeAccount({
    action: 'reset_password',
    employee_id: options.employee_id,
    new_password: options.new_password,
  })
}

export async function deactivateEmployeeAccount(employee_id: string): Promise<AccountResult> {
  return invokeManageEmployeeAccount({
    action: 'deactivate',
    employee_id,
  })
}

export async function loadEmployeeAccountStatus(employeeIds: string[]): Promise<EmployeeAccountStatus[]> {
  if (!employeeIds.length) return []

  const { data: rpcRows, error: rpcError } = await supabase.rpc('employee_last_sign_ins', {
    p_employee_ids: employeeIds,
  })

  if (!rpcError && Array.isArray(rpcRows)) {
    const byId = new Map<string, string | null>()
    for (const row of rpcRows as EmployeeAccountStatus[]) {
      byId.set(row.employee_id, row.last_sign_in_at ?? null)
    }
    return employeeIds.map((employee_id) => ({
      employee_id,
      last_sign_in_at: byId.get(employee_id) ?? null,
    }))
  }

  const { data, error } = await supabase.functions.invoke('manage-employee-account', {
    body: { action: 'status', employee_ids: employeeIds },
  })

  if (error) return employeeIds.map((employee_id) => ({ employee_id, last_sign_in_at: null }))

  const payload = (data ?? {}) as { rows?: EmployeeAccountStatus[] }
  const edgeRows = payload.rows ?? []
  const byId = new Map(edgeRows.map((row) => [row.employee_id, row.last_sign_in_at ?? null]))
  return employeeIds.map((employee_id) => ({
    employee_id,
    last_sign_in_at: byId.get(employee_id) ?? null,
  }))
}
