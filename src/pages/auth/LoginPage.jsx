import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { MsgBox } from '../../components/ui'

export default function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [msg,      setMsg]      = useState('')

  async function login() {
    if (!email || !password) { setMsg('Email and password are required.'); return }
    setLoading(true); setMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) { setMsg(error.message); setLoading(false) }
    // success → AuthContext handles session, App re-renders
  }

  function onKey(e) { if (e.key === 'Enter') login() }

  return (
    <div className="min-h-screen bg-primary-container flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-16 border-r border-slate-800">
        <div>
          <span className="text-white font-black text-2xl tracking-tighter">Studox OS</span>
          <p className="text-slate-400 text-label-sm uppercase tracking-widest mt-1">Institutional Infrastructure</p>
        </div>
        <div>
          <p className="text-white text-display font-black leading-none mb-6">Authority.<br/>Audit.<br/>Integrity.</p>
          <p className="text-slate-400 text-body-md max-w-sm">
            The governance infrastructure universities depend on to function — not just software they use.
          </p>
        </div>
        <div className="flex gap-8 text-slate-500 text-label-sm uppercase tracking-widest">
          <span>Office-based authority</span>
          <span>Immutable audit trail</span>
          <span>State machine workflows</span>
        </div>
      </div>

      {/* Right login panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8">
            <span className="text-on-surface font-black text-xl tracking-tighter">Studox OS</span>
            <p className="text-on-surface-variant text-label-sm uppercase tracking-widest mt-0.5">Institutional Infrastructure</p>
          </div>

          <h1 className="text-headline-md font-bold text-on-surface mb-1">Sign in</h1>
          <p className="text-body-sm text-on-surface-variant mb-8">Enter your institutional credentials</p>

          <MsgBox msg={msg} />

          <div className="field">
            <label className="label">Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={onKey}
              placeholder="you@institution.edu.ng"
              className="input"
              autoComplete="email"
            />
          </div>

          <div className="field">
            <label className="label">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={onKey}
              placeholder="••••••••"
              className="input"
              autoComplete="current-password"
            />
          </div>

          <button
            onClick={login}
            disabled={loading}
            className={`w-full py-3 text-label-md uppercase tracking-wider font-bold transition-all ${
              loading ? 'btn-disabled' : 'btn-primary'
            }`}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-body-sm text-on-surface-variant text-center mt-6">
            No account?{' '}
            <Link to="/signup" className="text-on-surface font-bold hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
