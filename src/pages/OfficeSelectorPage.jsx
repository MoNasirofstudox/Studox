import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Spinner, MsgBox } from '../components/ui'
import { usePushNotifications } from '../hooks/usePushNotifications'

const OFFICE_MODULE_MAP = {
  registrar:                    { path:'/coredesk',  label:'Coredesk',    icon:'account_balance',   desc:'Governance, offices, authority' },
  deputy_registrar_academics:   { path:'/acadex',    label:'Acadex',      icon:'school',            desc:'Results approval chain' },
  central_exams_office:         { path:'/acadex',    label:'Acadex',      icon:'inbox',             desc:'Batch aggregation & forwarding' },
  quality_assurance:            { path:'/acadex',    label:'Acadex',      icon:'policy',            desc:'Parallel oversight & intervention' },
  academic_board_secretary:     { path:'/boarddesk', label:'Boarddesk',   icon:'gavel',             desc:'Academic Board sessions' },
  pre_academic_board_secretary: { path:'/boarddesk', label:'Boarddesk',   icon:'gavel',             desc:'Pre-Academic Board sessions' },
  dean:                         { path:'/acadex',    label:'Acadex',      icon:'corporate_fare',    desc:'Faculty results review' },
  head_of_department:           { path:'/acadex',    label:'Acadex',      icon:'group',             desc:'Department results & assignments' },
  departmental_exam_officer:    { path:'/acadex',    label:'Acadex',      icon:'fact_check',        desc:'Result verification' },
  lecturer:                     { path:'/desk',      label:'Course Desk', icon:'edit_note',         desc:'Score entry, materials, discussions' },
  bursary:                      { path:'/paydesk',   label:'Paydesk',     icon:'payments',          desc:'Fees, invoices, clearance' },
  academic_secretary:           { path:'/coredesk',  label:'Coredesk',   icon:'account_balance',   desc:'Governance' },
  exams_records_officer:        { path:'/acadex',    label:'Acadex',      icon:'fact_check',        desc:'Exams records' },
  school_officer:               { path:'/acadex',    label:'Acadex',      icon:'corporate_fare',    desc:'School results review' },
  chief_lecturer:               { path:'/desk',      label:'Course Desk', icon:'edit_note',         desc:'Score entry' },
  exams_officer:                { path:'/acadex',    label:'Acadex',      icon:'fact_check',        desc:'Exams management' },
  dean_of_studies:              { path:'/acadex',    label:'Acadex',      icon:'corporate_fare',    desc:'Studies oversight' },
}

// Desks visible to all authenticated users
const UNIVERSAL_DESKS = [
  { path:'/schedox', label:'Schedox',     icon:'calendar_today',        desc:'Timetable, rooms, calendar' },
  { path:'/desk',    label:'Course Desk', icon:'menu_book',             desc:'Materials, assignments, discussions' },
]

// Student-only shortcut
const STUDENT_DESK = { path:'/student', label:'Student Portal', icon:'person', desc:'Registration, results, transcript, clearance' }

function timeLeft(d) {
  if (!d) return null
  const diff = new Date(d) - Date.now()
  if (diff <= 0) return 'Expired'
  const days = Math.floor(diff / 86400000)
  if (days > 0) return `${days}d left`
  const hrs  = Math.floor(diff / 3600000)
  return `${hrs}h left`
}

export default function OfficeSelectorPage() {
  const { person, setOffice, signOut } = useAuth()
  const navigate = useNavigate()
  const [offices,  setOffices]  = useState([])
  const [isStudent,setIsStudent]= useState(false)
  const [loading,  setLoading]  = useState(true)
  const [msg,      setMsg]      = useState('')

  useEffect(() => { loadOffices() }, [])

  async function loadOffices() {
    setLoading(true)
    const [{ data: offData, error }, { data: enroll }] = await Promise.all([
      supabase.rpc('rpc_get_my_offices', { p_person_id: person.id }),
      supabase.from('student_enrollments')
        .select('id')
        .eq('student_id', person.id)
        .eq('status', 'active')
        .limit(1),
    ])
    if (error) setMsg(error.message)
    setOffices(offData || [])
    setIsStudent((enroll || []).length > 0)
    setLoading(false)
  }

  function selectOffice(o) {
    setOffice(o)
    const mod = OFFICE_MODULE_MAP[o.office_type]
    navigate(mod ? mod.path : '/coredesk')
  }

  const isSuperAdmin = person?.global_role === 'super_admin'

  // Push notifications
  const { supported: pushSupported, subscribed: pushSubscribed, subscribing, subscribe } = usePushNotifications(person?.id)

  // Dedupe universal desks — don't show if already reachable via office
  const officePaths = new Set(offices.map(o => OFFICE_MODULE_MAP[o.office_type]?.path).filter(Boolean))
  const extraDesks  = UNIVERSAL_DESKS.filter(d => !officePaths.has(d.path))

  return (
    <div className="min-h-screen bg-background">
      {/* TopBar */}
      <header className="bg-white border-b border-outline-variant flex justify-between items-center px-6 h-14 sticky top-0 z-10">
        <span className="font-black text-lg tracking-tighter text-on-surface">Studox OS</span>
        <div className="flex items-center gap-3">
          <span className="text-body-sm text-on-surface-variant hidden sm:block">
            {person.first_name} {person.last_name}
          </span>
          {isSuperAdmin && (
            <button onClick={() => navigate('/onboarding')} className="btn-secondary px-3 py-1.5 text-xs">
              + New Institution
            </button>
          )}
          <button onClick={signOut} className="btn-secondary px-3 py-1.5 text-xs">Sign Out</button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Identity monolith */}
        <div className="bg-primary-container text-white p-6 mb-8">
          <p className="text-label-sm uppercase tracking-widest opacity-60 mb-1">Studox OS</p>
          <h1 className="text-headline-lg font-black">{person.first_name} {person.last_name}</h1>
          <p className="text-body-sm opacity-70 mt-1">{person.email}</p>
          {isSuperAdmin && (
            <span className="inline-block mt-2 text-label-sm uppercase bg-white/20 px-2 py-0.5 font-bold">
              Super Admin
            </span>
          )}
        </div>

        <MsgBox msg={msg} />

        {loading ? <Spinner /> : (
          <div className="space-y-6">

            {/* Student Portal shortcut */}
            {isStudent && (
              <section>
                <p className="text-label-sm uppercase tracking-widest text-slate-400 mb-2">Student</p>
                <button
                  onClick={() => navigate(STUDENT_DESK.path)}
                  className="w-full card p-4 flex items-center gap-4 hover:border-primary-container transition-colors text-left group">
                  <div className="w-10 h-10 bg-primary-container flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-white">{STUDENT_DESK.icon}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-body-sm font-bold text-on-surface">{STUDENT_DESK.label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{STUDENT_DESK.desc}</p>
                  </div>
                  <span className="text-label-sm text-slate-400 group-hover:text-primary-container uppercase tracking-widest">
                    Open →
                  </span>
                </button>
              </section>
            )}

            {/* Office assignments */}
            {offices.length > 0 && (
              <section>
                <p className="text-label-sm uppercase tracking-widest text-slate-400 mb-2">
                  Office Assignments — {offices.length}
                </p>
                <div className="space-y-2">
                  {offices.map((o, i) => {
                    const mod      = OFFICE_MODULE_MAP[o.office_type]
                    const expLabel = timeLeft(o.expires_at)
                    const isExpired= expLabel === 'Expired'
                    return (
                      <button key={i}
                        onClick={() => !isExpired && selectOffice(o)}
                        disabled={isExpired}
                        className={`w-full card p-4 flex items-center gap-4 text-left group transition-colors
                          ${isExpired ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary-container'}`}>
                        <div className="w-10 h-10 bg-surface-container flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-on-surface-variant">
                            {mod?.icon || 'work'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-body-sm font-bold text-on-surface truncate">{o.office_name}</p>
                          <p className="text-[11px] text-on-surface-variant mt-0.5">{o.institution_name}</p>
                          {mod && <p className="text-[11px] text-slate-400 mt-0.5">{mod.desc}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`text-label-sm uppercase px-2 py-0.5 font-bold
                            ${o.authority_source === 'delegated' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                            {o.authority_source === 'delegated' ? 'Delegated' : 'Direct'}
                          </span>
                          {expLabel && (
                            <span className={`text-[10px] font-bold ${isExpired ? 'text-red-500' : 'text-amber-600'}`}>
                              {expLabel}
                            </span>
                          )}
                          {mod && !isExpired && (
                            <span className="text-label-sm text-slate-400 group-hover:text-primary-container uppercase tracking-widest">
                              {mod.label} →
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {/* No offices */}
            {offices.length === 0 && !isStudent && (
              <div className="card p-8 text-center">
                <p className="text-label-md uppercase tracking-widest text-on-surface-variant mb-2">No offices assigned</p>
                <p className="text-body-sm text-slate-400">
                  You have not been assigned to any office yet. Contact your institution's Registrar.
                </p>
              </div>
            )}

            {/* Universal desks */}
            {extraDesks.length > 0 && (
              <section>
                <p className="text-label-sm uppercase tracking-widest text-slate-400 mb-2">General</p>
                <div className="flex flex-wrap gap-2">
                  {extraDesks.map(d => (
                    <button key={d.path}
                      onClick={() => navigate(d.path)}
                      className="card px-4 py-3 flex items-center gap-2 hover:border-primary-container transition-colors group text-left">
                      <span className="material-symbols-outlined text-on-surface-variant text-base group-hover:text-primary-container">
                        {d.icon}
                      </span>
                      <div>
                        <p className="text-label-sm font-bold text-on-surface uppercase tracking-widest">{d.label}</p>
                        <p className="text-[10px] text-slate-400">{d.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Push notification opt-in */}
            {pushSupported && !pushSubscribed && (
              <div className="flex items-center justify-between gap-4 border border-outline-variant p-4">
                <div>
                  <p className="text-label-sm uppercase tracking-widest text-on-surface font-bold">Enable Notifications</p>
                  <p className="text-body-sm text-on-surface-variant mt-0.5">
                    Get notified about results, grades and payments.
                  </p>
                </div>
                <button onClick={subscribe} disabled={subscribing}
                  className="btn-primary shrink-0 px-4 py-2 text-xs">
                  {subscribing ? 'Enabling…' : 'Enable'}
                </button>
              </div>
            )}

            {/* Notifications panel */}
            <NotificationsPanel institutionId={offices[0]?.institution_id} personId={person.id} />

          </div>
        )}
      </main>
    </div>
  )
}

// ─── Inline notifications widget ─────────────────────────────
function NotificationsPanel({ institutionId, personId }) {
  const [events,  setEvents]  = useState([])
  const [loading, setLoading] = useState(true)
  const [open,    setOpen]    = useState(false)

  useEffect(() => {
    if (!institutionId || !personId) { setLoading(false); return }
    supabase.rpc('rpc_get_my_events', {
      p_institution_id: institutionId,
      p_person_id:      personId,
      p_limit:          20,
    }).then(({ data }) => { setEvents(data || []); setLoading(false) })
  }, [institutionId, personId])

  if (!institutionId) return null

  const EVENT_COLOR = {
    batch_published:   'text-green-500',
    batch_rejected:    'text-red-500',
    batch_qa_flagged:  'text-amber-500',
    payment_recorded:  'text-emerald-500',
    assignment_graded: 'text-blue-500',
  }

  function timeAgo(d) {
    if (!d) return ''
    const diff = Date.now() - new Date(d).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1)   return 'just now'
    if (m < 60)  return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24)  return `${h}h ago`
    return `${Math.floor(h/24)}d ago`
  }

  return (
    <section>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-left mb-2">
        <p className="text-label-sm uppercase tracking-widest text-slate-400">
          Recent Activity {events.length > 0 && `(${events.length})`}
        </p>
        <span className="material-symbols-outlined text-slate-400 text-base">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        loading ? <Spinner /> : events.length === 0
          ? <p className="text-body-sm text-slate-400 py-3">No recent activity.</p>
          : (
            <div className="space-y-1">
              {events.map(e => (
                <div key={e.id} className="flex items-start gap-2 py-2 border-b border-slate-100 last:border-0">
                  <span className={`material-symbols-outlined text-base shrink-0 mt-0.5 ${EVENT_COLOR[e.event_type] || 'text-slate-400'}`}>
                    circle
                  </span>
                  <div className="flex-1">
                    <p className="text-body-sm text-on-surface">
                      <span className="font-medium">{e.actor_name}</span>
                      {' '}<span className="text-slate-400">{e.event_type?.replace(/_/g,' ')}</span>
                    </p>
                    <p className="text-[11px] text-slate-400">{e.office_name} · {timeAgo(e.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )
      )}
    </section>
  )
}
