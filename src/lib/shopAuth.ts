import { supabase } from './supabase'

type ShopAuthResult =
  | { ok: true; userId: string | null; created?: boolean }
  | { ok: false; error: string; needsDeploy?: boolean }

async function invokeShopAuth(body: Record<string, unknown>): Promise<ShopAuthResult> {
  const { data, error } = await supabase.functions.invoke('shop-auth', { body })
  if (error) {
    const msg = error.message || 'Shop auth request failed'
    if (/failed to fetch|404|not found|function/i.test(msg)) {
      return {
        ok: false,
        error: msg,
        needsDeploy: true,
      }
    }
    return { ok: false, error: msg }
  }
  const payload = (data ?? {}) as { error?: string; userId?: string | null; created?: boolean }
  if (payload.error) {
    return { ok: false, error: payload.error }
  }
  return { ok: true, userId: payload.userId ?? null, created: payload.created }
}

export async function ensureShopLogin(options: {
  email: string
  password: string
  name: string
  appRole: string
  userId?: string | null
}): Promise<ShopAuthResult> {
  return invokeShopAuth({
    action: 'ensure',
    email: options.email,
    password: options.password,
    name: options.name,
    appRole: options.appRole,
    userId: options.userId ?? undefined,
  })
}

export async function resetShopPassword(options: { userId: string; password: string }): Promise<ShopAuthResult> {
  const result = await invokeShopAuth({
    action: 'reset-password',
    userId: options.userId,
    password: options.password,
  })
  if (!result.ok) return result
  return { ok: true, userId: options.userId }
}
