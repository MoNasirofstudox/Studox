import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { MsgBox } from '../../components/ui'

export default function SignUpPage() {
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [loading,   setLoading]   = useState(false)
  const [msg,       setMsg]       = useState('')
  const [done,      setDone]      = useState(false)

  async function signup() {
    if (!firstName || !lastName || !email || !password) {
      setMsg('All fields are required.'); return
    }
    if (password.length < 8) {
      setMsg('Password must be at least 8 characters.'); return
    }
    setLoading(true); setMsg('')

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { first_name: firstName, last_name: lastName } }
    })

    if (error) { setMsg(error.message); setLoading(false); return }

    if (data.user) {
      await supabase.from('persons').upsert({
        id: data.user.id,
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      })
    }

    setDone(true)
    setLoading(false)
  }

  if (done) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="max-w-sm w-full text-center">
        <div className="text-4xl mb-4">✉️</div>
        <h2 className="text-headline-md font-bold text-on-surface mb-2">Check your email</h2>
        <p className="text-body-md text-on-surface-variant mb-6">
          Confirmation link sent to <strong>{email}</strong>. Click it to activate your account.
        </p>
        <Link to="/" className="btn-primary inline-block px-8 py-3">Back to Sign In</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <span className="text-on-surface font-black text-xl tracking-tighter">Studox OS</span>
          <p className="text-on-surface-variant text-label-sm uppercase tracking-widest mt-0.5">Create Account</p>
        </div>

        <h1 className="text-headline-md font-bold text-on-surface mb-1">Create account</h1>
        <p className="text-body-sm text-on-surface-variant mb-8">
          You'll be assigned to your institution by your Registrar after signup.
        </p>

        <MsgBox msg={msg} />

        <div className="flex gap-3">
          <div className="field flex-1">
            <label className="label">First Name</label>
            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
              placeholder="Chidi" className="input" />
          </div>
          <div className="field flex-1">
            <label className="label">Last Name</label>
            <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
              placeholder="Okeke" className="input" />
          </div>
        </div>

        <div className="field">
          <label className="label">Email address</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@institution.edu.ng" className="input" />
        </div>

        <div className="field">
          <label className="label">Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Min. 8 characters" className="input" />
        </div>

        <button onClick={signup} disabled={loading}
          className={`w-full py-3 text-label-md uppercase tracking-wider font-bold transition-all ${loading ? 'btn-disabled' : 'btn-primary'}`}>
          {loading ? 'Creating account...' : 'Create Account'}
        </button>

        <p className="text-body-sm text-on-surface-variant text-center mt-6">
          Already have an account?{' '}
          <Link to="/" className="text-on-surface font-bold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
