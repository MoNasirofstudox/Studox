import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession]       = useState(null)
  const [person,  setPerson]        = useState(null)
  const [office,  setOffice]        = useState(null) // active acting office
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadPerson(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setSession(session)
      if (session) loadPerson(session.user.id)
      else { setPerson(null); setOffice(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadPerson(userId) {
    const { data } = await supabase
      .from('persons')
      .select('id, email, first_name, last_name, global_role, is_active')
      .eq('id', userId)
      .maybeSingle()
    setPerson(data)
    setLoading(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null); setPerson(null); setOffice(null)
  }

  return (
    <AuthContext.Provider value={{ session, person, office, setOffice, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
