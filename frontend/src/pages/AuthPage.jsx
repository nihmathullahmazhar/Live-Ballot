import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import InkX from '../components/InkX'
import { Eyebrow, Rule, Spinner } from '../components/ui'
import { useToast } from '../components/Toast'
import { supabase, isConfigured } from '../lib/supabase'

export default function AuthPage() {
  const nav = useNavigate()
  const toast = useToast()
  const [mode, setMode] = useState('signup') // 'signup' | 'login'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!email.trim() || password.length < 6)
      return toast('Enter an email and a password of at least 6 characters', 'error')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
        if (error) throw error
        if (data.session) { toast('Account created', 'success'); nav('/dashboard') }
        else { setCheckEmail(true) }   // email confirmation is on
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        toast('Logged in', 'success'); nav('/dashboard')
      }
    } catch (err) {
      toast(err.message || 'Authentication failed', 'error')
    } finally { setBusy(false) }
  }

  if (checkEmail) {
    return (
      <Layout>
        <div className="panel p-8 max-w-md mx-auto text-center">
          <div className="text-violet flex justify-center"><InkX size={48} /></div>
          <h1 className="font-display font-900 text-2xl uppercase mt-3">Confirm your email</h1>
          <p className="text-ink/75 mt-2 text-sm">
            We sent a confirmation link to <span className="font-mono">{email}</span>. Click it,
            then come back and log in.
          </p>
          <button className="btn btn-primary mt-5" onClick={() => { setCheckEmail(false); setMode('login') }}>
            Back to log in
          </button>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="panel p-8 max-w-md mx-auto">
        <div className="text-ballot"><InkX size={34} /></div>
        <Eyebrow>Organiser access</Eyebrow>
        <h1 className="font-display font-900 text-3xl uppercase mt-1">
          {mode === 'signup' ? 'Create your account' : 'Log in'}
        </h1>
        <p className="text-ink/70 text-sm mt-2">
          {mode === 'signup'
            ? 'Email + password. Come back and log in from any device.'
            : 'Welcome back — enter your email and password.'}
        </p>

        {!isConfigured && (
          <p className="text-ballot text-sm mt-3">Supabase isn't configured yet (.env).</p>
        )}

        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block">
            <span className="font-display font-700 uppercase text-sm">Email</span>
            <input className="input mt-1" type="email" autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <label className="block">
            <span className="font-display font-700 uppercase text-sm">Password</span>
            <input className="input mt-1" type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 6 characters" />
          </label>
          <button className="btn btn-primary w-full text-lg" disabled={busy} type="submit">
            {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Log in'}
          </button>
          {busy && <Spinner />}
        </form>

        <Rule />
        <div className="text-sm text-center">
          {mode === 'signup' ? (
            <button className="underline underline-offset-4 hover:text-violet" onClick={() => setMode('login')}>
              Already have an account? Log in
            </button>
          ) : (
            <button className="underline underline-offset-4 hover:text-violet" onClick={() => setMode('signup')}>
              New here? Create an account
            </button>
          )}
        </div>
        <Link to="/" className="block text-center text-xs text-faint mt-4 hover:text-ink">Back to home</Link>
      </div>
    </Layout>
  )
}