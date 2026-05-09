import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Spinner, Monolith, Notice, MsgBox, EmptyState,
  TopBar, AppShell, SidebarHeader, SidebarSection, NavItem
} from '../../components/ui'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const TIMES = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00']

function fmt(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
}
function fmtDT(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-NG', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
}
function timeAgo(d) {
  if (!d) return ''
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h/24)}d ago`
}

export default function StudentPortal() {
  const { person } = useAuth()
  const navigate   = useNavigate()
  const [ctx,     setCtx]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState('feed')

  useEffect(() => { loadCtx() }, [person])

  async function loadCtx() {
    if (!person) return
    setLoading(true)
    const { data } = await supabase.rpc('rpc_get_student_context', { p_person_id: person.id })
    setCtx((data||[])[0] || null)
    setLoading(false)
  }

  const topbar = (
    <TopBar appName="Studox OS" section="Student Portal"
      right={
        <div className="flex items-center gap-3">
          <span className="text-body-sm text-on-surface-variant hidden sm:block">
            {person?.first_name} {person?.last_name}
          </span>
          <button onClick={() => navigate('/')}
            className="text-label-sm uppercase tracking-widest text-slate-500 hover:text-slate-800 transition-colors">
            ← Hub
          </button>
        </div>
      }
    />
  )

  const sidebar = ctx ? (
    <>
      <SidebarHeader module="Student Portal" role={`${ctx.program_code} · L${ctx.current_level}`} />
      <SidebarSection label="My Studies">
        <NavItem icon="feed"              label="Feed"         active={tab==='feed'}         onClick={() => setTab('feed')} />
        <NavItem icon="app_registration"  label="Registration" active={tab==='registration'} onClick={() => setTab('registration')} />
        <NavItem icon="grade"             label="Results"      active={tab==='results'}      onClick={() => setTab('results')} />
        <NavItem icon="history_edu"       label="Transcript"   active={tab==='transcript'}   onClick={() => setTab('transcript')} />
        <NavItem icon="calendar_view_week" label="Timetable"   active={tab==='timetable'}    onClick={() => setTab('timetable')} />
        <NavItem icon="verified_user"     label="Clearance"    active={tab==='clearance'}    onClick={() => setTab('clearance')} />
      </SidebarSection>
    </>
  ) : null

  if (loading) return <AppShell header={topbar}><Spinner size="lg" /></AppShell>

  if (!ctx) return (
    <AppShell header={topbar}>
      <div className="max-w-lg mx-auto mt-16 text-center">
        <Monolith eyebrow="Student Portal" title="Not Enrolled"
          description="You are not enrolled in any active program." />
        <p className="text-body-sm text-slate-400 mt-4">Contact your institution's registry to be enrolled.</p>
        <button onClick={() => navigate('/')} className="btn-secondary mt-6">← Back to Hub</button>
      </div>
    </AppShell>
  )

  return (
    <AppShell header={topbar} sidebar={sidebar}>
      {tab === 'feed'         && <FeedTab         ctx={ctx} person={person} />}
      {tab === 'registration' && <RegistrationTab ctx={ctx} person={person} />}
      {tab === 'results'      && <ResultsTab      ctx={ctx} person={person} />}
      {tab === 'transcript'   && <TranscriptTab   ctx={ctx} person={person} />}
      {tab === 'timetable'    && <TimetableTab    ctx={ctx} person={person} />}
      {tab === 'clearance'    && <ClearanceTab    ctx={ctx} person={person} />}
    </AppShell>
  )
}

// ─── Feed Tab ─────────────────────────────────────────────────
function FeedTab({ ctx, person }) {
  const [feed,    setFeed]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.rpc('rpc_get_student_feed', {
      p_person_id:      person.id,
      p_institution_id: ctx.institution_id,
      p_limit:          40,
    }).then(({ data }) => { setFeed(data || []); setLoading(false) })
  }, [])

  const EVENT_ICON = {
    batch_published:   { icon:'check_circle',  color:'text-green-500' },
    assignment_graded: { icon:'grading',        color:'text-blue-500'  },
    payment_recorded:  { icon:'payments',       color:'text-emerald-500' },
    clearance_override:{ icon:'verified_user',  color:'text-purple-500' },
    batch_rejected:    { icon:'cancel',         color:'text-red-500'   },
  }

  return (
    <div>
      <Monolith
        eyebrow="Student Portal"
        title="My Feed"
        description={`${ctx.institution_name} · ${ctx.program_name}`}
      />

      <div className="mt-6">
        {loading ? <Spinner /> : feed.length === 0 ? (
          <EmptyState
            title="Nothing yet"
            subtitle="Events like published results, graded assignments and payment confirmations will appear here"
          />
        ) : (
          <div className="space-y-2">
            {feed.map(e => {
              const meta = EVENT_ICON[e.event_type] || { icon:'info', color:'text-slate-400' }
              return (
                <div key={e.id} className="card p-4 flex items-start gap-3">
                  <span className={`material-symbols-outlined text-xl shrink-0 mt-0.5 ${meta.color}`}>
                    {meta.icon}
                  </span>
                  <div className="flex-1">
                    <p className="text-body-sm text-on-surface font-medium">{e.summary}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {e.actor_name} · {timeAgo(e.created_at)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Registration Tab ─────────────────────────────────────────
function RegistrationTab({ ctx, person }) {
  const [semester,   setSemester]   = useState(null)
  const [offerings,  setOfferings]  = useState([])
  const [registered, setRegistered] = useState([])
  const [selected,   setSelected]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [msg,        setMsg]        = useState('')
  const [msgType,    setMsgType]    = useState('error')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: sem } = await supabase.rpc('rpc_get_current_semester_for_institution', {
      p_institution_id: ctx.institution_id,
    })
    const s = (sem||[])[0]
    setSemester(s)
    if (s) {
      const [{ data: avail }, { data: regs }] = await Promise.all([
        supabase.rpc('rpc_get_available_offerings', {
          p_enrollment_id: ctx.enrollment_id,
          p_semester_id:   s.id,
        }),
        supabase.rpc('rpc_get_my_registrations', {
          p_enrollment_id: ctx.enrollment_id,
          p_semester_id:   s.id,
        }),
      ])
      setOfferings(avail || [])
      setRegistered(regs || [])
    }
    setLoading(false)
  }

  function toggle(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function register() {
    if (!selected.length) return
    setSaving(true); setMsg('')
    const { data, error } = await supabase.rpc('rpc_student_register_courses', {
      p_enrollment_id: ctx.enrollment_id,
      p_offering_ids:  selected,
    })
    setSaving(false)
    if (error) { setMsg(error.message); setMsgType('error'); return }
    setMsgType('success')
    setMsg(`✓ ${data.registered} course(s) registered successfully.`)
    setSelected([])
    load()
  }

  const unregistered  = offerings.filter(o => !o.is_registered)
  const totalCredits  = registered.reduce((s, r) => s + (r.credit_units || 0), 0)
  const selectedCredits = offerings
    .filter(o => selected.includes(o.id))
    .reduce((s, o) => s + (o.credit_units || 0), 0)

  if (loading) return <Spinner />

  return (
    <div>
      <Monolith
        eyebrow="Student Portal"
        title="Course Registration"
        description={semester ? semester.label : 'No active semester'}
        stats={[
          { label: 'Registered', value: registered.length, color: 'text-green-400' },
          { label: 'Credits',    value: totalCredits,       color: 'text-blue-400'  },
        ]}
      />

      {!semester && (
        <Notice type="warning" icon="schedule" title="Registration closed" className="mt-6">
          No active semester. Registration will open when your institution sets a current semester.
        </Notice>
      )}

      {semester && (
        <>
          {registered.length > 0 && (
            <div className="mt-6">
              <p className="text-label-md uppercase tracking-widest text-slate-400 mb-3">
                Registered — {registered.length} course{registered.length !== 1 ? 's' : ''} · {totalCredits} credits
              </p>
              <div className="card overflow-hidden">
                <table className="data-table">
                  <thead><tr><th>Course</th><th>Level</th><th>Credits</th><th>Lecturer</th><th>Date</th></tr></thead>
                  <tbody>
                    {registered.map(r => (
                      <tr key={r.offering_id}>
                        <td className="font-medium">{r.course_code} — {r.course_name}</td>
                        <td>{r.level}</td>
                        <td>{r.credit_units}</td>
                        <td className="text-slate-500">{r.lecturer_name || '—'}</td>
                        <td className="text-slate-400">{fmt(r.registered_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {unregistered.length > 0 && (
            <div className="mt-6">
              <p className="text-label-md uppercase tracking-widest text-slate-400 mb-3">
                Available to Register
              </p>
              {msg && <MsgBox msg={msg} type={msgType} />}
              <div className="space-y-2">
                {unregistered.map(o => {
                  const isSel = selected.includes(o.id)
                  return (
                    <div key={o.id} onClick={() => toggle(o.id)}
                      className={`card p-3 flex items-center gap-3 cursor-pointer transition-colors
                        ${isSel ? 'border-primary-container bg-surface-container-low' : 'hover:border-slate-300'}`}>
                      <input type="checkbox" checked={isSel} readOnly
                        onClick={e => e.stopPropagation()} className="w-4 h-4 shrink-0" />
                      <div className="flex-1">
                        <p className="text-body-sm font-bold">{o.course_code} — {o.course_name}</p>
                        <p className="text-[11px] text-slate-400">
                          {o.dept_name} · Level {o.level} · {o.lecturer_name || 'Unassigned'}
                        </p>
                      </div>
                      <span className="text-label-sm text-slate-400 shrink-0">{o.credit_units}u</span>
                    </div>
                  )
                })}
              </div>

              {selected.length > 0 && (
                <button className="btn-primary w-full mt-4" onClick={register} disabled={saving}>
                  {saving
                    ? 'Registering…'
                    : `Register ${selected.length} Course${selected.length !== 1 ? 's' : ''} (${selectedCredits} credits)`}
                </button>
              )}
            </div>
          )}

          {unregistered.length === 0 && registered.length === 0 && (
            <EmptyState
              title="No offerings available"
              subtitle="Course offerings have not been set up for this semester yet"
              className="mt-6"
            />
          )}

          {unregistered.length === 0 && registered.length > 0 && (
            <Notice type="info" icon="check_circle" title="All available courses registered" className="mt-6">
              You are registered for all currently available courses this semester.
            </Notice>
          )}
        </>
      )}
    </div>
  )
}

// ─── Results Tab ──────────────────────────────────────────────
function ResultsTab({ ctx, person }) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.rpc('rpc_get_my_results', {
      p_person_id:      person.id,
      p_institution_id: ctx.institution_id,
    }).then(({ data }) => { setResults(data || []); setLoading(false) })
  }, [])

  const published  = results.filter(r => r.grade_point != null && r.credit_units)
  const totalPts   = published.reduce((s, r) => s + r.grade_point * r.credit_units, 0)
  const totalUnits = published.reduce((s, r) => s + r.credit_units, 0)
  const cgpa       = totalUnits > 0 ? (totalPts / totalUnits).toFixed(2) : null

  const grouped = results.reduce((acc, r) => {
    const k = `${r.session_name} — ${r.sem_label}`
    if (!acc[k]) acc[k] = []
    acc[k].push(r)
    return acc
  }, {})

  if (loading) return <Spinner />

  return (
    <div>
      <Monolith
        eyebrow="Student Portal"
        title="My Results"
        description={`${ctx.program_code} · Level ${ctx.current_level}`}
        stats={cgpa ? [
          { label: 'CGPA',    value: cgpa,          color: 'text-green-400' },
          { label: 'Credits', value: totalUnits,     color: 'text-blue-400'  },
          { label: 'Courses', value: published.length, color: 'text-amber-400' },
        ] : []}
      />

      {results.length === 0 ? (
        <EmptyState
          title="No published results"
          subtitle="Results appear here once published by your institution"
          className="mt-6"
        />
      ) : Object.entries(grouped).map(([label, rs]) => (
        <div key={label} className="mt-6">
          <p className="text-label-md uppercase tracking-widest text-slate-400 mb-3">{label}</p>
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr><th>Course</th><th>Code</th><th>CA</th><th>Exam</th><th>Total</th><th>Grade</th><th>Credits</th></tr>
              </thead>
              <tbody>
                {rs.map((r, i) => (
                  <tr key={i}>
                    <td>{r.course_name}</td>
                    <td className="font-mono text-xs text-slate-400">{r.course_code}</td>
                    <td>{r.ca_score ?? '—'}</td>
                    <td>{r.exam_score ?? '—'}</td>
                    <td className="font-bold">{r.total_score ?? '—'}</td>
                    <td>
                      <span className={`text-label-sm font-black uppercase px-2 py-0.5
                        ${r.grade === 'A' ? 'bg-green-50 text-green-700' :
                          r.grade === 'B' ? 'bg-blue-50 text-blue-700' :
                          r.grade === 'C' ? 'bg-amber-50 text-amber-700' :
                          r.grade === 'F' ? 'bg-red-50 text-red-700' :
                          'bg-slate-100 text-slate-600'}`}>
                        {r.grade || '—'}
                      </span>
                    </td>
                    <td>{r.credit_units}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Transcript Tab ───────────────────────────────────────────
function TranscriptTab({ ctx, person }) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.rpc('rpc_get_my_results', {
      p_person_id:      person.id,
      p_institution_id: ctx.institution_id,
    }).then(({ data }) => { setResults(data || []); setLoading(false) })
  }, [])

  const totalPts   = results.reduce((s, r) => s + (r.grade_point || 0) * (r.credit_units || 0), 0)
  const totalUnits = results.reduce((s, r) => s + (r.credit_units || 0), 0)
  const cgpa       = totalUnits > 0 ? (totalPts / totalUnits).toFixed(2) : null

  const grouped = results.reduce((acc, r) => {
    const k = `${r.session_name} — ${r.sem_label}`
    if (!acc[k]) acc[k] = []
    acc[k].push(r)
    return acc
  }, {})

  if (loading) return <Spinner />

  return (
    <div>
      <div className="bg-primary-container text-white p-6 mb-6">
        <p className="text-label-sm uppercase tracking-widest opacity-60 mb-1">Official Academic Transcript</p>
        <h2 className="text-headline-lg font-black mb-1">{ctx.institution_name}</h2>
        <p className="text-body-md opacity-80">{ctx.program_name} ({ctx.program_code})</p>
        <div className="flex flex-wrap gap-6 mt-3 text-body-sm opacity-70">
          <span>Matric: {ctx.matric_number || '—'}</span>
          <span>Level: {ctx.current_level}</span>
          <span>Dept: {ctx.dept_name}</span>
          {cgpa && <span className="font-black opacity-100 text-white">CGPA: {cgpa}</span>}
        </div>
      </div>

      {results.length === 0 ? (
        <EmptyState title="No results on transcript" subtitle="Published results will appear here" />
      ) : (
        <>
          {Object.entries(grouped).map(([label, rs]) => {
            const semPts   = rs.reduce((s, r) => s + (r.grade_point||0) * (r.credit_units||0), 0)
            const semUnits = rs.reduce((s, r) => s + (r.credit_units||0), 0)
            const gpa      = semUnits > 0 ? (semPts / semUnits).toFixed(2) : '—'
            return (
              <div key={label} className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-label-md uppercase tracking-widest text-slate-400">{label}</p>
                  <p className="text-label-md font-bold text-on-surface">GPA: {gpa}</p>
                </div>
                <div className="card overflow-hidden">
                  <table className="data-table">
                    <thead>
                      <tr><th>Course</th><th>Code</th><th>Credits</th><th>Grade</th><th>GP</th><th>Weighted</th></tr>
                    </thead>
                    <tbody>
                      {rs.map((r, i) => (
                        <tr key={i}>
                          <td>{r.course_name}</td>
                          <td className="font-mono text-xs text-slate-400">{r.course_code}</td>
                          <td>{r.credit_units}</td>
                          <td className="font-bold">{r.grade || '—'}</td>
                          <td>{r.grade_point ?? '—'}</td>
                          <td className="text-slate-400">
                            {r.grade_point != null ? (r.grade_point * r.credit_units).toFixed(1) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          <div className="card p-4 flex justify-between items-center bg-primary-container text-white">
            <span className="text-label-md uppercase tracking-widest">Cumulative GPA</span>
            <span className="text-2xl font-black">{cgpa || '—'}</span>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Timetable Tab ────────────────────────────────────────────
function TimetableTab({ ctx, person }) {
  const [semester, setSemester] = useState(null)
  const [slots,    setSlots]    = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    async function load() {
      const { data: sem } = await supabase.rpc('rpc_get_current_semester_for_institution', {
        p_institution_id: ctx.institution_id,
      })
      const s = (sem||[])[0]
      setSemester(s)
      if (s) {
        const { data } = await supabase.rpc('rpc_get_my_timetable', {
          p_person_id:      person.id,
          p_institution_id: ctx.institution_id,
          p_semester_id:    s.id,
        })
        setSlots(data || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const grid = {}
  DAYS.forEach(d => { grid[d] = {} })
  slots.forEach(s => {
    const t = s.start_time?.substring(0,5)
    if (grid[s.day] && t) grid[s.day][t] = s
  })

  // Find active time range
  const activeTimes = TIMES.filter(t => DAYS.some(d => grid[d]?.[t]))

  if (loading) return <Spinner />

  return (
    <div>
      <Monolith
        eyebrow="Student Portal"
        title="My Timetable"
        description={semester ? semester.label : 'No active semester'}
        stats={[{ label: 'Classes', value: slots.length, color: 'text-blue-400' }]}
      />

      {!semester && (
        <Notice type="warning" icon="schedule" title="No active semester" className="mt-6">
          Timetable will appear once your institution sets a current semester.
        </Notice>
      )}

      {semester && slots.length === 0 && (
        <EmptyState
          title="No scheduled classes"
          subtitle="Register for courses first, then check back once the timetable is published"
          className="mt-6"
        />
      )}

      {semester && slots.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table style={{ minWidth: 620 }} className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="text-left p-2 text-label-sm uppercase tracking-widest text-slate-400 w-16 border-b border-slate-200">Time</th>
                {DAYS.map(d => (
                  <th key={d} className="text-label-sm uppercase tracking-widest text-slate-600 p-2 border-b border-slate-200 min-w-[90px]">
                    {d.slice(0,3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(activeTimes.length ? activeTimes : TIMES).map(t => (
                <tr key={t} className="border-b border-slate-100">
                  <td className="text-label-sm text-slate-400 p-2 font-mono">{t}</td>
                  {DAYS.map(d => {
                    const s = grid[d]?.[t]
                    return (
                      <td key={d} className="p-1 align-top">
                        {s && (
                          <div className="border-l-2 border-primary-container bg-surface-container-low p-1.5 rounded-sm text-xs">
                            <p className="font-bold text-on-surface leading-tight">{s.course_code}</p>
                            <p className="text-slate-500 leading-tight truncate">{s.room_name || 'No room'}</p>
                            <p className="text-[10px] text-slate-400 leading-tight">
                              {s.start_time?.substring(0,5)}–{s.end_time?.substring(0,5)}
                            </p>
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Clearance Tab ────────────────────────────────────────────
function ClearanceTab({ ctx, person }) {
  const [clearances, setClearances] = useState([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    supabase.rpc('rpc_get_my_clearance', {
      p_person_id:      person.id,
      p_institution_id: ctx.institution_id,
    }).then(({ data }) => { setClearances(data || []); setLoading(false) })
  }, [])

  if (loading) return <Spinner />

  const current = clearances[0]

  return (
    <div>
      <Monolith
        eyebrow="Student Portal"
        title="Financial Clearance"
        description="Your fee payment and clearance status"
      />

      {clearances.length === 0 ? (
        <Notice type="warning" icon="info" title="No clearance records" className="mt-6">
          No invoice has been generated for your account yet. Contact the Bursary office.
        </Notice>
      ) : (
        <>
          {current && (
            <div className={`mt-6 p-5 flex items-center gap-4 border
              ${current.is_cleared ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <span className={`material-symbols-outlined text-5xl
                ${current.is_cleared ? 'text-green-500' : 'text-red-400'}`}>
                {current.is_cleared ? 'verified_user' : 'gpp_bad'}
              </span>
              <div>
                <p className={`text-label-md uppercase tracking-widest font-bold
                  ${current.is_cleared ? 'text-green-700' : 'text-red-700'}`}>
                  {current.is_cleared ? 'Financially Cleared' : 'Not Cleared'}
                </p>
                <p className="text-body-sm text-slate-500 mt-0.5">{current.session_name}</p>
                {current.override_reason && (
                  <p className="text-body-sm text-slate-400 mt-1">Note: {current.override_reason}</p>
                )}
                {current.cleared_at && (
                  <p className="text-body-sm text-slate-400">Cleared: {fmt(current.cleared_at)}</p>
                )}
                {!current.is_cleared && (
                  <p className="text-body-sm text-red-600 mt-2 font-medium">
                    Visit the Bursary office to complete payment and obtain clearance.
                  </p>
                )}
              </div>
            </div>
          )}

          {clearances.length > 1 && (
            <div className="mt-6">
              <p className="text-label-md uppercase tracking-widest text-slate-400 mb-3">History</p>
              <div className="card overflow-hidden">
                <table className="data-table">
                  <thead>
                    <tr><th>Session</th><th>Status</th><th>Cleared At</th><th>Note</th></tr>
                  </thead>
                  <tbody>
                    {clearances.map(c => (
                      <tr key={c.session_id}>
                        <td>{c.session_name}</td>
                        <td>
                          <span className={`text-label-sm uppercase px-2 py-0.5 font-bold
                            ${c.is_cleared ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {c.is_cleared ? 'Cleared' : 'Not Cleared'}
                          </span>
                        </td>
                        <td className="text-slate-400">{fmt(c.cleared_at)}</td>
                        <td className="text-slate-400 text-xs">{c.override_reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
