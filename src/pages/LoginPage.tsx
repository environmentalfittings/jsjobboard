import { useState, type FormEvent } from 'react'
import logo from '../assets/js-logo.png'
import { getCurrentUserRole, signInWithUsername } from '../lib/auth'
import { supabase } from '../lib/supabase'

export type UserRole = 'admin' | 'manager' | 'supervisor' | 'technician' | 'sales'

interface LoginPageProps {
  onLogin: (options?: { localRole?: UserRole; username?: string }) => void | Promise<void>
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedUsername = username.trim().toLowerCase()
    const genericAdminEnabled = import.meta.env.VITE_ENABLE_GENERIC_ADMIN_LOGIN === 'true'
    const genericAdminUsername = String(import.meta.env.VITE_GENERIC_ADMIN_USERNAME ?? '').trim().toLowerCase()
    const genericAdminPassword = String(import.meta.env.VITE_GENERIC_ADMIN_PASSWORD ?? '')
    if (
      genericAdminEnabled &&
      genericAdminUsername &&
      genericAdminPassword &&
      normalizedUsername === genericAdminUsername &&
      password === genericAdminPassword
    ) {
      await onLogin({ localRole: 'admin', username: 'Generic Admin' })
      return
    }

    if (!normalizedUsername) {
      setError('Username is required')
      return
    }

    setSaving(true)

    const { data: employeeRow, error: employeeLookupError } = await supabase
      .from('employees')
      .select('username,auth_user_id,is_active')
      .eq('username', normalizedUsername)
      .maybeSingle()

    if (employeeLookupError && !/employees/i.test(employeeLookupError.message)) {
      setSaving(false)
      setError('Incorrect username or password')
      return
    }

    if (employeeRow) {
      if (!employeeRow.is_active) {
        setSaving(false)
        setError('Incorrect username or password')
        return
      }
      if (!employeeRow.auth_user_id) {
        setSaving(false)
        setError('Your account has not been created yet. Ask Mike to set up your login.')
        return
      }

      const { error: signInError } = await signInWithUsername(supabase, normalizedUsername, password)
      setSaving(false)
      if (signInError) {
        setError('Incorrect username or password')
        return
      }
    } else {
      const { data: technicianRow, error: technicianLookupError } = await supabase
        .from('technicians')
        .select('login_email,user_id')
        .eq('login_username', normalizedUsername)
        .eq('active', true)
        .maybeSingle()

      if (technicianLookupError || !technicianRow?.login_email) {
        setSaving(false)
        setError('Incorrect username or password')
        return
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: technicianRow.login_email,
        password,
      })
      setSaving(false)
      if (signInError) {
        setError('Incorrect username or password')
        return
      }
    }

    const { data: me, error: meError } = await supabase.auth.getUser()
    if (meError || !me.user) {
      setError('Signed in, but could not load user profile')
      return
    }

    let role = String(me.user.user_metadata?.role ?? me.user.app_metadata?.role ?? '').toLowerCase()
    if (!role) {
      const profileRole = await getCurrentUserRole(me.user.id)
      if (profileRole === 'admin') role = 'admin'
    }
    if (!['admin', 'manager', 'supervisor', 'technician', 'tech', 'sales'].includes(role)) {
      await supabase.auth.signOut()
      setError('Account has no app role. Ask an admin to verify your employee profile.')
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
        <label htmlFor="username-input">Username</label>
        <input
          id="username-input"
          type="text"
          value={username}
          onChange={(event) => {
            setUsername(event.target.value)
            setError('')
          }}
          placeholder="e.g. ghensley"
          autoComplete="username"
        />
        <label htmlFor="password-input">Password</label>
        <div className="password-input-wrap">
          <input
            id="password-input"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              setError('')
            }}
            placeholder="Enter password"
            autoComplete="current-password"
          />
          <button
            type="button"
            className="password-toggle-btn"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? '🙈' : '👁'}
          </button>
        </div>
        {error ? <div className="login-error">{error}</div> : null}
        <button className="button-primary" type="submit" disabled={saving}>
          {saving ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </section>
  )
}
