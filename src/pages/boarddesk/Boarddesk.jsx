import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Spinner, Monolith, Notice, MsgBox, EmptyState,
  Modal, ConfirmDialog, ButtonRow, Table,
  TopBar, AppShell, SidebarHeader, SidebarSection, NavItem, AuthorityTag,
  PageHeader
} from '../../components/ui'

function fmt(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
}
function fmtN(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-NG')
}

const DECISION_COLOR = {
  approved: 'bg-green-50 text-green-700',
  rejected:  'bg-red-50 text-red-700',
  deferred:  'bg-amber-50 text-amber-700',
}
const COMMITTEE_LABEL = {
  pre_academic_board: 'Pre-Academic Board',
  academic_board:     'Academic Board',
}

function StageBadge({ stage }) {
  const map = {
    draft:              'bg-slate-100 text-slate-600',
    pre_academic_board: 'bg-indigo-50 text-indigo-700',
    academic_board:     'bg-slate-200 text-slate-800',
    published:          'bg-green-100 text-green-900',
  }
  const cls = map[stage] || 'bg-slate-100 text-slate-600'
  return (
    <span className={`text-label-sm uppercase tracking-wider px-2 py-0.5 font-bold ${cls}`}>
      {stage?.replace(/_/g, ' ')}
    </span>
  )
}

export default function Boarddesk() {
  const { person } = useAuth()
  const navigate = useNavigate()
  const [offices, setOffices] = useState([])
  const [office,  setOffice]  = useState(null)
  const [view,    setView]    = useState('committees')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadOffices() }, [person])

  async function loadOffices() {
    if (!person) return
    setLoading(true)
    const { data } = await supabase.rpc('rpc_get_my_offices', { p_person_id: person.id })
    setOffices(data || [])
    setOffice((data || [])[0] || null)
    setLoading(false)
  }

  const institutionId = office?.institution_id

  const sidebar = office ? (
    <>
      <SidebarHeader module="Boarddesk" role={office.office_name} />
      <SidebarSection label="Board">
        <NavItem icon="ballot"          label="Committees"     active={view==='committees'} onClick={() => setView('committees')} />
        <NavItem icon="event_note"      label="Sessions"       active={view==='sessions'}   onClick={() => setView('sessions')} />
        <NavItem icon="pending_actions" label="Awaiting Board" active={view==='awaiting'}   onClick={() => setView('awaiting')} />
      </SidebarSection>
      <AuthorityTag officeName={office.office_name} source={office.authority_source} />
    </>
  ) : null

  const topbar = (
    <TopBar appName="Studox OS" section="Boarddesk"
      right={
        <button onClick={() => navigate('/')}
          className="text-label-sm uppercase tracking-widest text-slate-500 hover:text-slate-800 transition-colors">
          ← All Desks
        </button>
      }
    />
  )

  if (loading) return <AppShell header={topbar}><Spinner size="lg" /></AppShell>

  if (!office || !institutionId) return (
    <AppShell header={topbar}>
      <div className="max-w-lg mx-auto mt-16 text-center">
        <p className="text-headline-md font-bold text-on-surface mb-2">No office found</p>
        <p className="text-body-sm text-on-surface-variant">You need an office assignment to access Boarddesk.</p>
        <button onClick={() => navigate('/')} className="btn-secondary mt-6">← Back</button>
      </div>
    </AppShell>
  )

  return (
    <AppShell header={topbar} sidebar={sidebar}>
      {view === 'committees' && <CommitteesView institutionId={institutionId} office={office} person={person} />}
      {view === 'sessions'   && <SessionsView   institutionId={institutionId} office={office} person={person} />}
      {view === 'awaiting'   && <AwaitingView   institutionId={institutionId} />}
    </AppShell>
  )
}

// ─── Committees ──────────────────────────────────────────────
function CommitteesView({ institutionId, office, person }) {
  const [committees, setCommittees] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [sel,        setSel]        = useState(null)
  const [members,    setMembers]    = useState([])
  const [memLoading, setMemLoading] = useState(false)
  const [offices,    setOffices]    = useState([])
  const [persons,    setPersons]    = useState([])
  const [showAdd,    setShowAdd]    = useState(false)
  const [addPerson,  setAddPerson]  = useState('')
  const [addOffice,  setAddOffice]  = useState('')
  const [addRole,    setAddRole]    = useState('member')
  const [saving,     setSaving]     = useState(false)
  const [msg,        setMsg]        = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    await supabase.rpc('rpc_ensure_committees', { p_institution_id: institutionId })
    const { data } = await supabase.rpc('rpc_get_committees', { p_institution_id: institutionId })
    setCommittees(data || [])
    setLoading(false)
  }, [institutionId])

  useEffect(() => { load() }, [load])

  async function selectCommittee(c) {
    setSel(c); setMemLoading(true)
    const [{ data: mems }, { data: ofs }, { data: prs }] = await Promise.all([
      supabase.rpc('rpc_get_committee_members', { p_committee_id: c.id }),
      supabase.from('offices').select('id,name').eq('institution_id', institutionId).eq('is_active', true).order('name'),
      supabase.from('persons').select('id,first_name,last_name').eq('is_active', true).order('last_name'),
    ])
    setMembers(mems || []); setOffices(ofs || []); setPersons(prs || [])
    setMemLoading(false)
  }

  async function addMember() {
    if (!addPerson || !addOffice) { setMsg('Person and office required.'); return }
    setSaving(true); setMsg('')
    const { data } = await supabase.rpc('rpc_add_committee_member', {
      p_committee_id: sel.id, p_person_id: addPerson,
      p_office_id: addOffice, p_role: addRole,
    })
    setSaving(false)
    if (data?.success === false) { setMsg(data.error); return }
    setShowAdd(false); setAddPerson(''); setAddOffice(''); setAddRole('member')
    selectCommittee(sel)
  }

  async function removeMember(id) {
    await supabase.rpc('rpc_remove_committee_member', { p_member_id: id })
    selectCommittee(sel)
  }

  if (loading) return <Spinner />

  if (sel) return (
    <div>
      <button onClick={() => setSel(null)}
        className="text-label-sm uppercase tracking-widest text-slate-400 hover:text-slate-700 mb-6 flex items-center gap-1">
        <span className="material-symbols-outlined text-base">arrow_back</span> All Committees
      </button>

      <Monolith
        eyebrow={COMMITTEE_LABEL[sel.committee_type] || sel.committee_type}
        title={sel.name}
        description={`${sel.member_count || 0} active members · ${sel.session_count || 0} sessions`}
        actions={<button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Member</button>}
      />

      {msg && <MsgBox msg={msg} />}

      {showAdd && (
        <div className="card p-5 mt-6">
          <p className="text-label-md uppercase tracking-widest mb-4">Add Member</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Person</label>
              <select className="input" value={addPerson} onChange={e => setAddPerson(e.target.value)}>
                <option value="">Select person</option>
                {persons.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Office</label>
              <select className="input" value={addOffice} onChange={e => setAddOffice(e.target.value)}>
                <option value="">Select office</option>
                {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Role</label>
              <select className="input" value={addRole} onChange={e => setAddRole(e.target.value)}>
                <option value="chair">Chair</option>
                <option value="secretary">Secretary</option>
                <option value="member">Member</option>
              </select>
            </div>
          </div>
          <ButtonRow>
            <button className="btn-secondary" onClick={() => { setShowAdd(false); setMsg('') }}>Cancel</button>
            <button className="btn-primary" onClick={addMember} disabled={saving}>{saving ? 'Adding…' : 'Add Member'}</button>
          </ButtonRow>
        </div>
      )}

      <div className="mt-6">
        {memLoading ? <Spinner /> : members.length === 0
          ? <EmptyState title="No members" subtitle="Add members above" />
          : (
            <div className="card overflow-hidden">
              <table className="data-table">
                <thead><tr><th>Name</th><th>Office</th><th>Role</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {members.map(m => (
                    <tr key={m.id}>
                      <td className="font-medium">{m.person_name}</td>
                      <td className="text-slate-500">{m.office_name}</td>
                      <td>
                        <span className={`text-label-sm uppercase px-2 py-0.5 font-bold ${
                          m.role_in_committee === 'chair' ? 'bg-primary-container text-white' :
                          m.role_in_committee === 'secretary' ? 'bg-secondary-container text-on-secondary-container' :
                          'bg-slate-100 text-slate-600'}`}>
                          {m.role_in_committee}
                        </span>
                      </td>
                      <td>
                        <span className={`text-label-sm uppercase px-2 py-0.5 ${m.is_active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {m.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        {m.is_active && (
                          <button className="text-label-sm text-red-500 hover:text-red-700" onClick={() => removeMember(m.id)}>Remove</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  )

  return (
    <div>
      <Monolith eyebrow="Boarddesk" title="Committees" description="Manage board membership" />
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        {committees.map(c => (
          <div key={c.id} onClick={() => selectCommittee(c)}
            className="card p-6 cursor-pointer hover:border-primary-container transition-colors">
            <p className="text-label-sm uppercase tracking-widest text-slate-400 mb-1">{COMMITTEE_LABEL[c.committee_type] || c.committee_type}</p>
            <h3 className="text-headline-md font-bold text-on-surface mb-3">{c.name}</h3>
            <div className="flex gap-4 text-body-sm text-slate-500">
              <span>{fmtN(c.member_count)} members</span>
              <span>·</span>
              <span>{fmtN(c.session_count)} sessions</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Sessions ────────────────────────────────────────────────
function SessionsView({ institutionId, office, person }) {
  const [committees,    setCommittees]    = useState([])
  const [selCommittee,  setSelCommittee]  = useState(null)
  const [sessions,      setSessions]      = useState([])
  const [selSession,    setSelSession]    = useState(null)
  const [detail,        setDetail]        = useState(null)
  const [batches,       setBatches]       = useState([])
  const [loading,       setLoading]       = useState(true)
  const [sesLoading,    setSesLoading]    = useState(false)
  const [detLoading,    setDetLoading]    = useState(false)
  const [showCreate,    setShowCreate]    = useState(false)
  const [showRes,       setShowRes]       = useState(false)
  const [sesDate,       setSesDate]       = useState('')
  const [sesRef,        setSesRef]        = useState('')
  const [agenda,        setAgenda]        = useState('')
  const [saving,        setSaving]        = useState(false)
  const [msg,           setMsg]           = useState('')
  const [resBatch,      setResBatch]      = useState('')
  const [resDecision,   setResDecision]   = useState('approved')
  const [resText,       setResText]       = useState('')
  const [resSaving,     setResSaving]     = useState(false)
  const [resMsg,        setResMsg]        = useState('')

  useEffect(() => {
    async function init() {
      await supabase.rpc('rpc_ensure_committees', { p_institution_id: institutionId })
      const { data } = await supabase.rpc('rpc_get_committees', { p_institution_id: institutionId })
      setCommittees(data || [])
      if (data?.length) setSelCommittee(data[0])
      setLoading(false)
    }
    init()
  }, [institutionId])

  useEffect(() => {
    if (!selCommittee) return
    loadSessions()
    supabase.rpc('rpc_get_board_batches', {
      p_institution_id: institutionId,
      p_committee_type: selCommittee.committee_type,
    }).then(({ data }) => setBatches(data || []))
  }, [selCommittee])

  async function loadSessions() {
    setSesLoading(true)
    const { data } = await supabase.rpc('rpc_get_sessions', { p_committee_id: selCommittee.id })
    setSessions(data || [])
    setSesLoading(false)
  }

  async function loadDetail(s) {
    setSelSession(s); setDetLoading(true)
    const { data } = await supabase.rpc('rpc_get_session_detail', { p_session_id: s.id })
    setDetail(data); setDetLoading(false)
  }

  async function createSession() {
    if (!sesDate) { setMsg('Date required.'); return }
    setSaving(true); setMsg('')
    const { error } = await supabase.rpc('rpc_create_session', {
      p_committee_id:       selCommittee.id,
      p_session_date:       sesDate,
      p_session_ref:        sesRef,
      p_agenda:             agenda,
      p_recorded_by_person: person.id,
      p_recorded_by_office: office.office_id,
    })
    setSaving(false)
    if (error) { setMsg(error.message); return }
    setShowCreate(false); setSesDate(''); setSesRef(''); setAgenda('')
    loadSessions()
  }

  async function toggleAttendance(personId, present) {
    await supabase.rpc('rpc_toggle_attendance', {
      p_session_id: selSession.id, p_person_id: personId, p_present: !present,
    })
    loadDetail(selSession)
  }

  async function recordResolution() {
    if (!resBatch || !resText.trim()) { setResMsg('Batch and resolution text required.'); return }
    setResSaving(true); setResMsg('')
    const { error } = await supabase.rpc('rpc_record_resolution', {
      p_person_id: person.id, p_session_id: selSession.id,
      p_batch_id: resBatch, p_decision: resDecision, p_resolution_text: resText.trim(),
    })
    setResSaving(false)
    if (error) { setResMsg(error.message); return }
    setShowRes(false); setResBatch(''); setResDecision('approved'); setResText('')
    loadDetail(selSession)
  }

  async function submitSession() {
    await supabase.rpc('rpc_submit_session', { p_session_id: selSession.id })
    loadDetail(selSession); loadSessions()
  }

  if (loading) return <Spinner />

  // ── Detail view ──
  if (selSession && detail) {
    const s = detail.session || {}
    const att = detail.attendance || []
    const res = detail.resolutions || []
    const isSubmitted = !!s.submitted_at

    return (
      <div>
        <button onClick={() => { setSelSession(null); setDetail(null) }}
          className="text-label-sm uppercase tracking-widest text-slate-400 hover:text-slate-700 mb-6 flex items-center gap-1">
          <span className="material-symbols-outlined text-base">arrow_back</span> Sessions
        </button>

        {detLoading ? <Spinner /> : (
          <>
            <Monolith
              eyebrow={s.committee_name}
              title={s.session_ref || `Session — ${fmt(s.session_date)}`}
              description={`${fmt(s.session_date)} · Recorded by ${s.recorder_name}`}
              stats={[
                { label: 'Present',     value: att.filter(a => a.present).length, color: 'text-green-400' },
                { label: 'Resolutions', value: res.length,                        color: 'text-blue-400'  },
              ]}
              actions={!isSubmitted && (
                <div className="flex gap-2 mt-2">
                  <button className="btn-primary"   onClick={() => setShowRes(true)}>+ Record Resolution</button>
                  <button className="btn-secondary" onClick={submitSession}>Finalise Session</button>
                </div>
              )}
            />

            {isSubmitted && (
              <Notice type="info" icon="verified" title="Session Finalised" className="mt-4">
                Finalised {fmt(s.submitted_at)}. No further changes can be made.
              </Notice>
            )}

            {s.agenda && (
              <div className="card p-5 mt-6">
                <p className="text-label-sm uppercase tracking-widest text-slate-400 mb-2">Agenda</p>
                <p className="text-body-md text-on-surface whitespace-pre-wrap">{s.agenda}</p>
              </div>
            )}

            {/* Attendance */}
            <div className="mt-6">
              <p className="text-label-md uppercase tracking-widest text-slate-400 mb-3">Attendance</p>
              {att.length === 0
                ? <EmptyState title="No members seeded" subtitle="Add members to the committee first" />
                : (
                  <div className="card overflow-hidden">
                    <table className="data-table">
                      <thead><tr><th>Name</th><th>Office</th><th>Board Role</th><th>Present</th></tr></thead>
                      <tbody>
                        {att.map(a => (
                          <tr key={a.id}>
                            <td className="font-medium">{a.person_name}</td>
                            <td className="text-slate-500">{a.office_name}</td>
                            <td><span className="text-label-sm uppercase text-slate-400">{a.role_in_committee || '—'}</span></td>
                            <td>
                              <button
                                disabled={isSubmitted}
                                onClick={() => toggleAttendance(a.person_id, a.present)}
                                className={`text-label-sm uppercase px-3 py-1 font-bold transition-colors
                                  ${a.present ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}
                                  ${isSubmitted ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                                {a.present ? '✓ Present' : 'Absent'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>

            {/* Resolutions */}
            <div className="mt-8">
              <p className="text-label-md uppercase tracking-widest text-slate-400 mb-3">Resolutions</p>
              {res.length === 0
                ? <EmptyState title="No resolutions recorded" subtitle="Use Record Resolution above" />
                : (
                  <div className="space-y-3">
                    {res.map(r => (
                      <div key={r.id} className="card p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className={`text-label-sm uppercase px-2 py-0.5 font-bold ${DECISION_COLOR[r.decision] || 'bg-slate-100 text-slate-600'}`}>
                                {r.decision}
                              </span>
                              {r.batch_dept && <span className="text-label-sm text-slate-400">{r.batch_dept}</span>}
                            </div>
                            <p className="text-body-md text-on-surface">{r.resolution_text}</p>
                            <p className="text-body-sm text-slate-400 mt-2">{fmt(r.created_at)}</p>
                          </div>
                          {r.batch_stage && <StageBadge stage={r.batch_stage} />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            {showRes && (
              <Modal title="Record Resolution" subtitle="Document the board's deliberation outcome" onClose={() => setShowRes(false)} maxWidth="560px">
                <MsgBox msg={resMsg} />
                <div className="space-y-4">
                  <div>
                    <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Result Batch *</label>
                    <select className="input" value={resBatch} onChange={e => setResBatch(e.target.value)}>
                      <option value="">Select batch</option>
                      {batches.map(b => (
                        <option key={b.id} value={b.id}>{b.dept_name} ({b.dept_code}) — {b.sem_label}</option>
                      ))}
                    </select>
                    {batches.length === 0 && <p className="text-body-sm text-slate-400 mt-1">No batches at this board stage.</p>}
                  </div>
                  <div>
                    <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Decision *</label>
                    <select className="input" value={resDecision} onChange={e => setResDecision(e.target.value)}>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="deferred">Deferred</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Resolution Text *</label>
                    <textarea className="input resize-none" rows={4} value={resText} onChange={e => setResText(e.target.value)}
                      placeholder="e.g. The Board approved results for CSC Dept, 2024/2025 First Semester." />
                  </div>
                </div>
                <ButtonRow>
                  <button className="btn-secondary" onClick={() => setShowRes(false)}>Cancel</button>
                  <button className="btn-primary" onClick={recordResolution} disabled={resSaving}>
                    {resSaving ? 'Recording…' : 'Record Resolution'}
                  </button>
                </ButtonRow>
              </Modal>
            )}
          </>
        )}
      </div>
    )
  }

  // ── Sessions list ──
  return (
    <div>
      <Monolith eyebrow="Boarddesk" title="Sessions" description="Record offline board deliberations and resolutions" />

      <div className="flex gap-2 mt-6 mb-4">
        {committees.map(c => (
          <button key={c.id} onClick={() => setSelCommittee(c)}
            className={`text-label-sm uppercase tracking-widest px-4 py-2 border transition-colors
              ${selCommittee?.id === c.id
                ? 'border-primary-container bg-primary-container text-white'
                : 'border-outline-variant text-slate-500 hover:border-slate-400'}`}>
            {COMMITTEE_LABEL[c.committee_type] || c.name}
          </button>
        ))}
        <button className="btn-primary ml-auto" onClick={() => setShowCreate(true)}>+ New Session</button>
      </div>

      {msg && <MsgBox msg={msg} />}

      {showCreate && (
        <div className="card p-5 mb-6">
          <p className="text-label-md uppercase tracking-widest mb-4">New Session — {selCommittee?.name}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Date *</label>
              <input type="date" className="input" value={sesDate} onChange={e => setSesDate(e.target.value)} />
            </div>
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Reference No.</label>
              <input className="input" value={sesRef} onChange={e => setSesRef(e.target.value)} placeholder="e.g. AB/2025/004" />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Agenda</label>
            <textarea className="input resize-none" rows={3} value={agenda} onChange={e => setAgenda(e.target.value)}
              placeholder="1. Approval of minutes&#10;2. Result batches for deliberation" />
          </div>
          <ButtonRow>
            <button className="btn-secondary" onClick={() => { setShowCreate(false); setMsg('') }}>Cancel</button>
            <button className="btn-primary" onClick={createSession} disabled={saving}>{saving ? 'Creating…' : 'Create Session'}</button>
          </ButtonRow>
        </div>
      )}

      {sesLoading ? <Spinner /> : sessions.length === 0
        ? <EmptyState title="No sessions yet" subtitle="Create a session to begin recording deliberations" />
        : (
          <div className="space-y-2">
            {sessions.map(s => (
              <div key={s.id} onClick={() => loadDetail(s)}
                className="card p-4 flex items-center gap-4 cursor-pointer hover:border-primary-container transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="text-body-md font-bold text-on-surface">{s.session_ref || fmt(s.session_date)}</p>
                    {s.submitted_at
                      ? <span className="text-label-sm uppercase bg-green-50 text-green-700 px-2 py-0.5 font-bold">Finalised</span>
                      : <span className="text-label-sm uppercase bg-amber-50 text-amber-700 px-2 py-0.5 font-bold">Draft</span>}
                  </div>
                  <p className="text-body-sm text-slate-500">
                    {fmt(s.session_date)} · {s.attendance_count} present · {s.resolution_count} resolution{s.resolution_count !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className="material-symbols-outlined text-slate-400">chevron_right</span>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

// ─── Awaiting View ───────────────────────────────────────────
function AwaitingView({ institutionId }) {
  const [preBoard, setPreBoard] = useState([])
  const [acBoard,  setAcBoard]  = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: pre }, { data: ac }] = await Promise.all([
        supabase.rpc('rpc_get_board_batches', { p_institution_id: institutionId, p_committee_type: 'pre_academic_board' }),
        supabase.rpc('rpc_get_board_batches', { p_institution_id: institutionId, p_committee_type: 'academic_board' }),
      ])
      setPreBoard(pre || []); setAcBoard(ac || [])
      setLoading(false)
    }
    load()
  }, [institutionId])

  if (loading) return <Spinner />

  return (
    <div>
      <Monolith
        eyebrow="Boarddesk"
        title="Awaiting Board Review"
        description="Result batches currently at board stages"
        stats={[
          { label: 'Pre-Board', value: preBoard.length, color: 'text-indigo-400' },
          { label: 'Ac. Board', value: acBoard.length,  color: 'text-blue-400'   },
        ]}
      />

      <Notice type="info" icon="info" title="Option C — Secretary Records" className="mt-6">
        Board deliberations happen offline. The secretary records attendance and resolutions under <strong>Sessions</strong>.
        Each approved resolution advances the batch automatically.
      </Notice>

      <div className="mt-8 space-y-8">
        {[
          { label: 'Pre-Academic Board', batches: preBoard, color: 'bg-indigo-50 text-indigo-700' },
          { label: 'Academic Board',     batches: acBoard,  color: 'bg-slate-200 text-slate-800'  },
        ].map(({ label, batches, color }) => (
          <div key={label}>
            <p className="text-label-md uppercase tracking-widest text-slate-400 mb-3">{label} — {batches.length}</p>
            {batches.length === 0
              ? <div className="card p-5 text-center"><p className="text-body-sm text-slate-400">No batches at this stage</p></div>
              : (
                <div className="card overflow-hidden">
                  <table className="data-table">
                    <thead><tr><th>Department</th><th>Faculty</th><th>Semester</th><th>Results</th><th>Stage</th><th>Updated</th></tr></thead>
                    <tbody>
                      {batches.map(b => (
                        <tr key={b.id}>
                          <td className="font-medium">{b.dept_name} <span className="text-slate-400">({b.dept_code})</span></td>
                          <td className="text-slate-500">{b.faculty_name || '—'}</td>
                          <td className="text-slate-500">{b.sem_label}</td>
                          <td>{fmtN(b.result_count)}</td>
                          <td><span className={`text-label-sm uppercase px-2 py-0.5 font-bold ${color}`}>{b.current_stage?.replace(/_/g,' ')}</span></td>
                          <td className="text-slate-400">{fmt(b.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        ))}
      </div>
    </div>
  )
}
