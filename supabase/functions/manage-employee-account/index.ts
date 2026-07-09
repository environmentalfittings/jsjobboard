import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EMAIL_DOMAIN = Deno.env.get('EMPLOYEE_LOGIN_EMAIL_DOMAIN') ?? 'jsvalve.com'

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function toEmail(username: string) {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
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
  if (callerError || !callerData.user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  let body: {
    action?: string
    employee_id?: string
    username?: string
    password?: string
    new_password?: string
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
    if (!employeeIds.length) return json({ rows: [] })

    const { data: employees, error } = await adminClient
      .from('employees')
      .select('id,auth_user_id')
      .in('id', employeeIds)

    if (error) return json({ error: error.message }, 400)

    const rows = await Promise.all(
      (employees ?? []).map(async (employee) => {
        if (!employee.auth_user_id) {
          return { employee_id: employee.id, last_sign_in_at: null }
        }
        const { data: userData } = await adminClient.auth.admin.getUserById(employee.auth_user_id)
        return {
          employee_id: employee.id,
          last_sign_in_at: userData.user?.last_sign_in_at ?? null,
        }
      }),
    )

    return json({ rows })
  }

  const action = String(body.action ?? '')
  const employee_id = String(body.employee_id ?? '').trim()

  if (!employee_id) {
    return json({ error: 'employee_id is required' }, 400)
  }

  const { data: employeeRow, error: employeeError } = await adminClient
    .from('employees')
    .select('id,employee_no,username,full_name,auth_user_id')
    .eq('id', employee_id)
    .maybeSingle()

  if (employeeError || !employeeRow) {
    return json({ error: employeeError?.message ?? 'Employee not found' }, 400)
  }

  const username = String(body.username ?? employeeRow.username ?? '').trim().toLowerCase()
  const full_name = String(body.full_name ?? employeeRow.full_name ?? username).trim()
  const email = toEmail(username)

  if (action === 'create') {
    const password = String(body.password ?? '')
    if (!password || password.length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, 400)
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, username, employee_id, role: 'admin' },
    })

    if (error) return json({ error: error.message }, 400)
    if (!data.user) return json({ error: 'User was not created' }, 400)

    await adminClient.from('employees').update({ auth_user_id: data.user.id }).eq('id', employee_id)
    await adminClient.from('profiles').upsert({
      id: data.user.id,
      employee_id,
      full_name,
      role: 'admin',
    })

    const { data: existingTechnician } = await adminClient
      .from('technicians')
      .select('id')
      .eq('login_username', username)
      .maybeSingle()

    const technicianRow = {
      name: full_name,
      employee_id: employeeRow.employee_no,
      login_username: username,
      login_email: email,
      user_id: data.user.id,
      active: true,
      role: 'admin',
    }

    if (existingTechnician?.id) {
      await adminClient.from('technicians').update(technicianRow).eq('id', existingTechnician.id)
    } else {
      await adminClient.from('technicians').insert(technicianRow)
    }

    return json({ success: true, user_id: data.user.id })
  }

  if (action === 'reset_password') {
    const new_password = String(body.new_password ?? '')
    if (!new_password || new_password.length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, 400)
    }

    const authUserId = employeeRow.auth_user_id as string | null
    if (!authUserId) {
      return json({ error: 'No account found' }, 404)
    }

    const { error } = await adminClient.auth.admin.updateUserById(authUserId, { password: new_password })
    if (error) return json({ error: error.message }, 400)

    return json({ success: true })
  }

  if (action === 'deactivate') {
    const authUserId = employeeRow.auth_user_id as string | null
    if (authUserId) {
      await adminClient.auth.admin.updateUserById(authUserId, { ban_duration: '87600h' })
    }
    await adminClient.from('employees').update({ is_active: false }).eq('id', employee_id)

    return json({ success: true })
  }

  return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error'
    return json({ error: message }, 500)
  }
})
