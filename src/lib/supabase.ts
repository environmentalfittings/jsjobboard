import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigError =
  !url || !anonKey ? 'Missing Supabase env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY' : null

// Keep app booting so production can show a clear setup message instead of a blank page.
const safeUrl = url || 'https://example.supabase.co'
const safeAnonKey = anonKey || 'public-anon-placeholder-key'

export const supabase = createClient(safeUrl, safeAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Avoid creating multiple GoTrue clients that fight over the same web lock.
    storageKey: 'jsjb-supabase-auth',
  },
})
