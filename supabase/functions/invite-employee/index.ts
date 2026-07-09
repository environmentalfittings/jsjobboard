import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type AuthStatus = 'linked' | 'invite_pending' | 'no_account'

function deriveAuthStatus(user: {
  last_sign_in_at?: string | null
  invited_at?: string | null
  email_confirmed_at?: string | null
} | null): AuthStatus {
  if (!user) return 'no_account'
  if (user.last_sign_in_at) return 'linked'
  return 'invite_pending'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: 'Server misconfigured' }, 500)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: callerData, error: callerError } = await callerClient.auth.getUser()
  const caller = callerData.user
  if (callerError || !caller) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  let body: {
    action?: string
    email?: string
    employee_id?: string
    full_name?: string
    employee_ids?: string[]
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (body.action === 'status') {
    const employeeIds = Array.isArray(body.employee_ids) ? body.employee_ids.map(String) : []
    if (!employeeIds.length) {
      return json({ rows: [] })
    }

    const { data: employees, error: employeesError } = await adminClient
      .from('employees')
      .select('id,auth_user_id')
      .in('id', employeeIds)

    if (employeesError) {
      return json({ error: employeesError.message }, 400)
    }

    const rows = await Promise.all(
      (employees ?? []).map(async (employee) => {
        if (!employee.auth_user_id) {
          return {
            employee_id: employee.id,
            email: null,
            last_sign_in_at: null,
            invited_at: null,
            status: 'no_account' as AuthStatus,
          }
        }

        const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(employee.auth_user_id)
        if (userError || !userData.user) {
          return {
            employee_id: employee.id,
            email: null,
            last_sign_in_at: null,
            invited_at: null,
            status: 'no_account' as AuthStatus,
          }
        }

        const user = userData.user
        return {
          employee_id: employee.id,
          email: user.email ?? null,
          last_sign_in_at: user.last_sign_in_at ?? null,
          invited_at: user.invited_at ?? null,
          status: deriveAuthStatus(user),
        }
      }),
    )

    return json({ rows })
  }

  const action = body.action === 'resend' ? 'resend' : 'invite'
  const employee_id = String(body.employee_id ?? '').trim()
  const full_name = String(body.full_name ?? '').trim()
  const employeeDomain = Deno.env.get('EMPLOYEE_LOGIN_EMAIL_DOMAIN') ?? 'jsvalve.com'

  if (!employee_id || !full_name) {
    return json({ error: 'employee_id and full_name are required' }, 400)
  }

  const { data: employeeRow, error: employeeError } = await adminClient
    .from('employees')
    .select('id,auth_user_id,username,full_name')
    .eq('id', employee_id)
    .maybeSingle()

  if (employeeError || !employeeRow) {
    return json({ error: employeeError?.message ?? 'Employee not found' }, 400)
  }

  const username = String(employeeRow.username ?? '').trim().toLowerCase()
  const email = String(body.email ?? '').trim() || `${username}@${employeeDomain}`

  if (!email || !username) {
    return json({ error: 'Employee username is required to build login email' }, 400)
  }

  let authUserId = employeeRow.auth_user_id as string | null
  const inviteMeta = { full_name, employee_id, username, role: 'admin' }

  if (action === 'resend' && authUserId) {
    const { error: resendError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: inviteMeta,
    })
    if (resendError) {
      return json({ error: resendError.message }, 400)
    }
  } else {
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: inviteMeta,
    })

    if (error) {
      return json({ error: error.message }, 400)
    }

    if (data.user) {
      authUserId = data.user.id
      await adminClient.from('employees').update({ auth_user_id: authUserId }).eq('id', employee_id)
    }
  }

  if (authUserId) {
    await adminClient.from('profiles').upsert({
      id: authUserId,
      employee_id,
      full_name,
      role: 'admin',
    })

    await adminClient.auth.admin.updateUserById(authUserId, {
      user_metadata: inviteMeta,
    })
  }

  return json({ success: true, email })
})
