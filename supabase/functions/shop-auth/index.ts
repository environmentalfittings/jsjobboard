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

function callerRole(user: { user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }) {
  return String(user.user_metadata?.role ?? user.app_metadata?.role ?? '').toLowerCase()
}

async function callerIsShopAdmin(
  adminClient: ReturnType<typeof createClient>,
  user: { id: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> },
) {
  if (callerRole(user) === 'admin') return true
  const [{ data: profile }, { data: tech }] = await Promise.all([
    adminClient.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    adminClient.from('technicians').select('role').eq('user_id', user.id).maybeSingle(),
  ])
  if (String(profile?.role ?? '').toLowerCase() === 'admin') return true
  if (String(tech?.role ?? '').toLowerCase() === 'admin') return true
  return false
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
  if (!(await callerIsShopAdmin(adminClient, caller))) {
    return json({ error: 'Only Admin can manage shop logins' }, 403)
  }

  let body: {
    action?: string
    email?: string
    password?: string
    userId?: string
    name?: string
    appRole?: string
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (body.action === 'create') {
    const email = String(body.email ?? '').trim()
    const password = String(body.password ?? '')
    const name = String(body.name ?? '').trim()
    const appRole = String(body.appRole ?? 'technician').trim()
    if (!email || !password) {
      return json({ error: 'email and password are required' }, 400)
    }
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: appRole, name },
    })
    if (error) {
      return json({ error: error.message }, 400)
    }
    return json({ userId: data.user?.id ?? null })
  }

  if (body.action === 'reset-password') {
    const userId = String(body.userId ?? '').trim()
    const password = String(body.password ?? '')
    if (!userId || !password) {
      return json({ error: 'userId and password are required' }, 400)
    }
    const { error } = await adminClient.auth.admin.updateUserById(userId, { password })
    if (error) {
      return json({ error: error.message }, 400)
    }
    return json({ ok: true })
  }

  if (body.action === 'ensure') {
    const email = String(body.email ?? '').trim()
    const password = String(body.password ?? '')
    const name = String(body.name ?? '').trim()
    const appRole = String(body.appRole ?? 'technician').trim()
    const userId = String(body.userId ?? '').trim()
    if (!email || !password) {
      return json({ error: 'email and password are required' }, 400)
    }
    if (userId) {
      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        password,
        user_metadata: { role: appRole, name },
      })
      if (error) {
        return json({ error: error.message }, 400)
      }
      return json({ userId, created: false })
    }
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: appRole, name },
    })
    if (error) {
      return json({ error: error.message }, 400)
    }
    return json({ userId: data.user?.id ?? null, created: true })
  }

  return json({ error: 'Unknown action' }, 400)
})
