import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import logo from '../assets/js-logo.png'
import { supabase } from '../lib/supabase'

export function CustomerLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) return
      const { data: portalUser } = await supabase
        .from('customer_portal_users')
        .select('id')
        .eq('auth_user_id', data.user.id)
        .maybeSingle()
      if (portalUser) {
        navigate('/customer-portal', { replace: true })
      }
    })()
  }, [navigate])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setError('Email is required')
      return
    }
    if (!password) {
      setError('Password is required')
      return
    }
    setSaving(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })
    if (signInError) {
      setSaving(false)
      setError(signInError.message || 'Sign in failed')
      return
    }

    const { data: me, error: meError } = await supabase.auth.getUser()
    if (meError || !me.user) {
      setSaving(false)
      setError(meError?.message || 'Signed in, but could not load your account')
      return
    }

    const { data: portalUser, error: portalError } = await supabase
      .from('customer_portal_users')
      .select('id')
      .eq('auth_user_id', me.user.id)
      .maybeSingle()

    setSaving(false)
    if (portalError || !portalUser) {
      await supabase.auth.signOut()
      setError('Your account is not set up for portal access. Please contact J~S Machine and Valve.')
      return
    }

    navigate('/customer-portal', { replace: true })
  }

  return (
    <section className="login-page">
      <form className="login-card" onSubmit={submit}>
        <img src={logo} alt="JS Valve logo" className="login-logo" />
        <h1>Customer Portal</h1>
        <p>Sign in to view traveler progress for your jobs.</p>
        <label htmlFor="customer-email-input">Email</label>
        <input
          id="customer-email-input"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            setError('')
          }}
          placeholder="you@company.com"
          autoComplete="email"
        />
        <label htmlFor="customer-password-input">Password</label>
        <div className="password-input-wrap">
          <input
            id="customer-password-input"
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
