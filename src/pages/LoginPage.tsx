import { useEffect, useState, type FormEvent } from 'react'
import logo from '../assets/js-logo.png'
import { getCurrentUserRole, getShopLoginStatus, signInWithUsername } from '../lib/auth'
import { supabase } from '../lib/supabase'

export type UserRole = 'admin' | 'manager' | 'technician'

interface LoginPageProps {
  onLogin: (options?: { localRole?: UserRole; username?: string }) => void | Promise<void>
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotLinkHovered, setForgotLinkHovered] = useState(false)

  const displayUsername = username.trim().toLowerCase()

  useEffect(() => {
    if (!forgotOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setForgotOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [forgotOpen])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedUsername = username.trim().toLowerCase()
    const enteredPassword = password.trim()
    const emailLocalPart = String(import.meta.env.VITE_GENERIC_ADMIN_EMAIL ?? '')
      .trim()
      .split('@')[0]
      .toLowerCase()
    const genericAdminUsername =
      String(import.meta.env.VITE_GENERIC_ADMIN_USERNAME ?? '').trim().toLowerCase() ||
      emailLocalPart ||
      'admin'
    const genericAdminPassword =
      String(import.meta.env.VITE_GENERIC_ADMIN_PASSWORD ?? '').trim() || 'change-me'
    const genericAdminEnabled =
      import.meta.env.DEV || import.meta.env.VITE_ENABLE_GENERIC_ADMIN_LOGIN === 'true'
    if (
      genericAdminEnabled &&
      normalizedUsername === genericAdminUsername &&
      enteredPassword === genericAdminPassword
    ) {
      await onLogin({ localRole: 'admin', username: 'Generic Admin' })
      return
    }

    if (!normalizedUsername) {
      setError('Username is required')
      return
    }

    setSaving(true)

    const { error: employeeSignInError } = await signInWithUsername(supabase, normalizedUsername, password)
    if (!employeeSignInError) {
      const { data: me, error: meError } = await supabase.auth.getUser()
      if (meError || !me.user) {
        setSaving(false)
        setError('Signed in, but could not load user profile')
        return
      }

      const { data: employeeRow } = await supabase
        .from('employees')
        .select('is_active')
        .eq('auth_user_id', me.user.id)
        .maybeSingle()

      if (employeeRow && !employeeRow.is_active) {
        await supabase.auth.signOut()
        setSaving(false)
        setError('Incorrect username or password')
        return
      }

      let role = String(me.user.user_metadata?.role ?? me.user.app_metadata?.role ?? '').toLowerCase()
      if (!role) {
        const profileRole = await getCurrentUserRole(me.user.id)
        if (profileRole === 'admin') role = 'admin'
      }
      if (!['admin', 'manager', 'supervisor', 'technician', 'tech', 'sales'].includes(role)) {
        await supabase.auth.signOut()
        setSaving(false)
        setError('Account has no app role. Ask an admin to verify your employee profile.')
        return
      }

      setSaving(false)
      await onLogin()
      return
    }

    const { data: technicianRow, error: technicianLookupError } = await supabase
      .from('technicians')
      .select('login_email,user_id')
      .eq('login_username', normalizedUsername)
      .eq('active', true)
      .maybeSingle()

    if (technicianLookupError || !technicianRow?.login_email) {
      setSaving(false)
      const loginStatus = await getShopLoginStatus(supabase, normalizedUsername)
      if (loginStatus === 'no_account') {
        setError('Your account has not been created yet. Ask Mike to set up your login.')
        return
      }
      setError('Incorrect username or password')
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: technicianRow.login_email,
      password,
    })
    setSaving(false)
    if (signInError) {
      const loginStatus = await getShopLoginStatus(supabase, normalizedUsername)
      if (loginStatus === 'no_account' || !technicianRow.user_id) {
        setError('Your account has not been created yet. Ask an admin to set up your login (Technicians → Reset password).')
        return
      }
      setError('Incorrect username or password')
      return
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
          placeholder="Shop username"
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
            tabIndex={-1}
          >
            {showPassword ? '🙈' : '👁'}
          </button>
        </div>
        {error ? <div className="login-error">{error}</div> : null}
        <button className="button-primary" type="submit" disabled={saving}>
          {saving ? 'Signing in…' : 'Sign in'}
        </button>
        <button
          type="button"
          style={{
            alignSelf: 'center',
            marginTop: 2,
            border: 0,
            background: 'transparent',
            color: '#64748b',
            fontSize: 13,
            cursor: 'pointer',
            textDecoration: forgotLinkHovered ? 'underline' : 'none',
            textUnderlineOffset: 2,
          }}
          onMouseEnter={() => setForgotLinkHovered(true)}
          onMouseLeave={() => setForgotLinkHovered(false)}
          onClick={() => setForgotOpen(true)}
        >
          Forgot your password?
        </button>
      </form>

      {forgotOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-forgot-title"
        >
          <div className="login-card" style={{ width: 'min(420px, 100%)' }}>
            <h2 id="login-forgot-title" style={{ margin: 0, fontSize: 20 }}>
              Forgot Your Password?
            </h2>
            <p style={{ margin: 0, color: '#64748b', lineHeight: 1.5 }}>
              To reset your password, contact the administrator.
            </p>
            <p style={{ margin: 0, color: '#64748b', lineHeight: 1.5 }}>
              Mike can reset it immediately from the Admin panel.
            </p>
            <p style={{ margin: 0, color: '#334155', lineHeight: 1.5 }}>
              {displayUsername ? (
                <>
                  Your username is: <strong>{displayUsername}</strong>
                </>
              ) : (
                <>Enter your shop username on the sign-in form before opening this help.</>
              )}
            </p>
            <button type="button" className="button-primary" onClick={() => setForgotOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
