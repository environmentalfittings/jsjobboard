import { useState, type FormEvent } from 'react'
import logo from '../assets/js-logo.png'
import { supabase } from '../lib/supabase'

export type UserRole = 'admin' | 'manager' | 'supervisor' | 'technician'

interface LoginPageProps {
  onLogin: (options?: { localRole?: UserRole; username?: string }) => void | Promise<void>
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedEmail = email.trim()
    const genericAdminEnabled = import.meta.env.VITE_ENABLE_GENERIC_ADMIN_LOGIN === 'true'
    const genericAdminEmail = String(import.meta.env.VITE_GENERIC_ADMIN_EMAIL ?? '').trim().toLowerCase()
    const genericAdminPassword = String(import.meta.env.VITE_GENERIC_ADMIN_PASSWORD ?? '')
    if (
      genericAdminEnabled &&
      genericAdminEmail &&
      genericAdminPassword &&
      normalizedEmail.toLowerCase() === genericAdminEmail &&
      password === genericAdminPassword
    ) {
      await onLogin({ localRole: 'admin', username: 'Generic Admin' })
      return
    }

    setSaving(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })
    setSaving(false)
    if (signInError) {
      setError(signInError.message || 'Sign in failed')
      return
    }
    const { data: me, error: meError } = await supabase.auth.getUser()
    const role = String(me.user?.user_metadata?.role ?? me.user?.app_metadata?.role ?? '').toLowerCase()
    if (meError || !me.user) {
      setError(meError?.message || 'Signed in, but could not load user profile')
      return
    }
    if (!['admin', 'manager', 'supervisor', 'technician', 'tech'].includes(role)) {
      await supabase.auth.signOut()
      setError('Account has no app role. Set user metadata role to admin/manager/supervisor/technician.')
      return
    }
    await onLogin()
  }

  return (
    <section className="login-page">
      <form className="login-card" onSubmit={submit}>
        <img src={logo} alt="JS Valve logo" className="login-logo" />
        <h1>JS Valve Job Board</h1>
        <p>Sign in with your shop login.</p>
        <label htmlFor="email-input">Email</label>
        <input
          id="email-input"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            setError('')
          }}
          placeholder="name@shop.com"
          autoComplete="email"
        />
        <label htmlFor="password-input">Password</label>
        <input
          id="password-input"
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
            setError('')
          }}
          placeholder="Enter password"
          autoComplete="current-password"
        />
        {error ? <div className="login-error">{error}</div> : null}
        <button className="button-primary" type="submit" disabled={saving}>
          {saving ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </section>
  )
}
