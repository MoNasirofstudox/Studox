import { useState, useEffect } from 'react'
import AuditViewer from './AuditViewer'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Spinner, Monolith, Notice, MsgBox, EmptyState,
  Card, Modal, ConfirmDialog, ButtonRow,
  TopBar, AppShell, SidebarHeader, SidebarSection, NavItem, AuthorityTag,
  Badge, AuthorityBadge, PageHeader, Field, Input, Select, Textarea, Table
} from '../../components/ui'

const NAV = [
  { id: 'offices',      label: 'Offices',        icon: 'account_balance' },
  { id: 'assignments',  label: 'Assignments',     icon: 'badge' },
  { id: 'delegations',  label: 'Delegations',     icon: 'swap_horiz' },
  { id: 'capabilities', label: 'Capabilities',    icon: 'lock' },
  { id: 'audit',        label: 'Audit Log',       icon: 'history' },
]

export default function Coredesk() {
  const { person, office, signOut } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('offices')

  if (!office) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-label-md uppercase tracking-widest text-on-surface-variant mb-2">No office selected</p>
          <button onClick={() => navigate('/')} className="btn-secondary px-4 py-2 text-xs">← Select Office</button>
        </div>
      </div>
    )
  }

  const sidebar = (
    <>
      <SidebarHeader module="Coredesk" role="Governance" />
      <SidebarSection>
        {NAV.map(n => (
          <NavItem key={n.id} icon={n.icon} label={n.label} active={tab === n.id} onClick={() => setTab(n.id)} />
        ))}
      </SidebarSection>
      <AuthorityTag officeName={office.office_name} source={office.authority_source} />
    </>
  )

  const topbar = (
    <TopBar
      section="Coredesk · Governance"
      right={
        <div className="flex items-center gap-3">
          <span className="text-label-sm uppercase tracking-widest text-on-surface-variant hidden md:block">
            {office.institution_name}
          </span>
          <button onClick={() => navigate('/')} className="btn-secondary px-3 py-1.5 text-xs">Switch Office</button>
          <button onClick={signOut} className="btn-secondary px-3 py-1.5 text-xs">Sign Out</button>
        </div>
      }
    />
  )

  return (
    <AppShell header={topbar} sidebar={sidebar}>
      <div className="max-w-5xl mx-auto">
        {tab === 'offices'      && <OfficesTab      office={office} person={person} />}
        {tab === 'assignments'  && <AssignmentsTab  office={office} person={person} />}
        {tab === 'delegations'  && <DelegationsTab  office={office} person={person} />}
        {tab === 'capabilities' && <CapabilitiesTab office={office} person={person} />}
        {tab === 'audit'        && <AuditViewer institutionId={office.institution_id} />}
      </div>
    </AppShell>
  )
}

// ─── Offices Tab ─────────────────────────────────────────────
function OfficesTab({ office, person }) {
  const [offices,  setOffices]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name,     setName]     = useState('')
  const [type,     setType]     = useState('')
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('offices')
      .select('id, office_type, name, is_active, faculty_id, department_id, faculties(name), departments(name)')
      .eq('institution_id', office.institution_id)
      .order('office_type')
    setOffices(data || [])
    setLoading(false)
  }

  async function addOffice() {
    if (!name || !type) { setMsg('Name and type are required.'); return }
    setSaving(true); setMsg('')
    const { error } = await supabase.from('offices').insert({
      institution_id: office.institution_id,
      office_type: type,
      name: name.trim(),
    })
    setSaving(false)
    if (error) { setMsg(error.message); return }
    setName(''); setType(''); setShowForm(false); load()
  }

  const stats = [
    { label: 'Total',    value: offices.length },
    { label: 'Active',   value: offices.filter(o => o.is_active).length, color: 'text-green-400' },
    { label: 'Inactive', value: offices.filter(o => !o.is_active).length, color: 'text-slate-400' },
  ]

  return (
    <div>
      <Monolith eyebrow="Coredesk · Registry" title="Institutional Offices"
        description="Permanent authority units. Offices outlive any person assigned to them."
        stats={stats} />

      <div className="mt-6">
        <PageHeader title="All Offices"
          action={
            <button onClick={() => setShowForm(s => !s)} className="btn-primary px-4 py-2 text-xs">
              {showForm ? 'Cancel' : '+ Add Office'}
            </button>
          }
        />

        {showForm && (
          <Card className="mb-4">
            <div className="p-4 space-y-0">
              <MsgBox msg={msg} />
              <div className="flex gap-4">
                <div className="field flex-1">
                  <label className="label">Office Name <span className="text-red-500">*</span></label>
                  <Input value={name} onChange={setName} placeholder="e.g. HOD, Computer Science" />
                </div>
                <div className="field flex-1">
                  <label className="label">Office Type <span className="text-red-500">*</span></label>
                  <input type="text" value={type} onChange={e => setType(e.target.value)}
                    placeholder="e.g. head_of_department" className="input" />
                  <p className="text-[11px] text-slate-400 mt-1">Use snake_case. Must match capability grant office_type.</p>
                </div>
              </div>
              <ButtonRow>
                <button onClick={() => setShowForm(false)} className="btn-secondary px-4 py-2 text-xs">Cancel</button>
                <button onClick={addOffice} disabled={saving}
                  className={saving ? 'btn-disabled px-4 py-2 text-xs' : 'btn-primary px-4 py-2 text-xs'}>
                  {saving ? 'Adding...' : 'Add Office'}
                </button>
              </ButtonRow>
            </div>
          </Card>
        )}

        {loading ? <Spinner /> : offices.length === 0 ? (
          <EmptyState title="No offices" subtitle="Offices are created during institution onboarding." />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Scope</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {offices.map(o => (
                    <tr key={o.id}>
                      <td className="font-bold text-on-surface">{o.name}</td>
                      <td className="text-mono text-xs text-on-surface-variant">{o.office_type}</td>
                      <td className="text-body-sm text-on-surface-variant">
                        {o.departments?.name ? `Dept: ${o.departments.name}` :
                         o.faculties?.name   ? `Faculty: ${o.faculties.name}` : 'Institution'}
                      </td>
                      <td>
                        <span className={`badge ${o.is_active ? 'badge-active' : 'badge-draft'}`}>
                          {o.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

// ─── Assignments Tab ──────────────────────────────────────────
function AssignmentsTab({ office, person }) {
  const [assignments, setAssignments] = useState([])
  const [offices,     setOffices]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [selOffice,   setSelOffice]   = useState('')
  const [search,      setSearch]      = useState('')
  const [personRes,   setPersonRes]   = useState([])
  const [selPerson,   setSelPerson]   = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [msg,         setMsg]         = useState('')
  const [confirm,     setConfirm]     = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [aRes, oRes] = await Promise.all([
      supabase.from('office_assignments')
        .select('id, started_at, ended_at, is_active, offices(name, office_type), persons(first_name, last_name, email)')
        .eq('offices.institution_id', office.institution_id)
        .eq('is_active', true)
        .order('started_at', { ascending: false }),
      supabase.from('offices').select('id, name, office_type')
        .eq('institution_id', office.institution_id).eq('is_active', true).order('name')
    ])
    setAssignments(aRes.data || [])
    setOffices(oRes.data || [])
    setLoading(false)
  }

  async function searchPersons(q) {
    setSearch(q); setSelPerson(null)
    if (!q || q.length < 2) { setPersonRes([]); return }
    const { data } = await supabase.from('persons')
      .select('id, first_name, last_name, email')
      .or(`email.ilike.%${q}%,first_name.ilike.%${q}%`)
      .limit(5)
    setPersonRes(data || [])
  }

  async function assign() {
    if (!selOffice || !selPerson) { setMsg('Select an office and a person.'); return }
    setSaving(true); setMsg('')
    const { error } = await supabase.from('office_assignments').insert({
      office_id: selOffice, person_id: selPerson.id, assigned_by: person.id
    })
    setSaving(false)
    if (error) { setMsg(error.message); return }
    setSelOffice(''); setSearch(''); setSelPerson(null); setShowForm(false); load()
  }

  async function endAssignment(id) {
    await supabase.from('office_assignments')
      .update({ is_active: false, ended_at: new Date().toISOString() }).eq('id', id)
    setConfirm(null); load()
  }

  return (
    <div>
      <Monolith eyebrow="Coredesk · Governance" title="Office Assignments"
        description="Time-bound person → office links. Ending an assignment does not delete the office."
        stats={[{ label: 'Active', value: assignments.length }]} />

      <div className="mt-6">
        <PageHeader title="Active Assignments"
          action={
            <button onClick={() => setShowForm(s => !s)} className="btn-primary px-4 py-2 text-xs">
              {showForm ? 'Cancel' : '+ Assign Person'}
            </button>
          }
        />

        {showForm && (
          <Card className="mb-4">
            <div className="p-4 space-y-0">
              <MsgBox msg={msg} />
              <div className="field">
                <label className="label">Office <span className="text-red-500">*</span></label>
                <select value={selOffice} onChange={e => setSelOffice(e.target.value)} className="input">
                  <option value="">Select office...</option>
                  {offices.map(o => <option key={o.id} value={o.id}>{o.name} ({o.office_type})</option>)}
                </select>
              </div>
              <div className="field relative">
                <label className="label">Person <span className="text-red-500">*</span></label>
                {selPerson ? (
                  <div className="p-3 bg-green-50 border border-green-200 flex items-center justify-between">
                    <div>
                      <span className="text-body-sm font-bold text-green-800">{selPerson.first_name} {selPerson.last_name}</span>
                      <span className="text-[11px] text-green-600 ml-2">{selPerson.email}</span>
                    </div>
                    <button onClick={() => { setSelPerson(null); setSearch('') }} className="text-slate-400 hover:text-red-500">✕</button>
                  </div>
                ) : (
                  <>
                    <input type="text" value={search} onChange={e => searchPersons(e.target.value)}
                      placeholder="Search by name or email..." className="input" />
                    {personRes.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-outline-variant shadow-lift z-10 mt-0.5">
                        {personRes.map(p => (
                          <div key={p.id} onClick={() => { setSelPerson(p); setPersonRes([]); setSearch(`${p.first_name} ${p.last_name}`) }}
                            className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0">
                            <p className="text-body-sm font-bold">{p.first_name} {p.last_name}</p>
                            <p className="text-[11px] text-on-surface-variant">{p.email}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <ButtonRow>
                <button onClick={() => setShowForm(false)} className="btn-secondary px-4 py-2 text-xs">Cancel</button>
                <button onClick={assign} disabled={saving}
                  className={saving ? 'btn-disabled px-4 py-2 text-xs' : 'btn-primary px-4 py-2 text-xs'}>
                  {saving ? 'Assigning...' : 'Assign'}
                </button>
              </ButtonRow>
            </div>
          </Card>
        )}

        {confirm && (
          <ConfirmDialog title="End Assignment"
            message={`End this person's assignment? They will immediately lose authority under this office.`}
            danger confirmLabel="End Assignment"
            onConfirm={() => endAssignment(confirm)}
            onCancel={() => setConfirm(null)} />
        )}

        {loading ? <Spinner /> : assignments.length === 0 ? (
          <EmptyState title="No active assignments" />
        ) : (
          <Card>
            <table className="data-table">
              <thead><tr><th>Person</th><th>Office</th><th>Since</th><th>End</th></tr></thead>
              <tbody>
                {assignments.map(a => (
                  <tr key={a.id}>
                    <td>
                      <p className="font-bold text-on-surface">{a.persons?.first_name} {a.persons?.last_name}</p>
                      <p className="text-[11px] text-on-surface-variant">{a.persons?.email}</p>
                    </td>
                    <td>
                      <p className="text-body-sm font-bold">{a.offices?.name}</p>
                      <p className="text-mono-sm text-on-surface-variant">{a.offices?.office_type}</p>
                    </td>
                    <td className="text-body-sm text-on-surface-variant">
                      {new Date(a.started_at).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })}
                    </td>
                    <td>
                      <button onClick={() => setConfirm(a.id)} className="btn-danger px-3 py-1 text-xs">End</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  )
}

// ─── Delegations Tab ──────────────────────────────────────────
function DelegationsTab({ office, person }) {
  const [delegations, setDelegations] = useState([])
  const [offices,     setOffices]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [selOffice,   setSelOffice]   = useState('')
  const [search,      setSearch]      = useState('')
  const [personRes,   setPersonRes]   = useState([])
  const [selPerson,   setSelPerson]   = useState(null)
  const [level,       setLevel]       = useState('2')
  const [expiresAt,   setExpiresAt]   = useState('')
  const [reason,      setReason]      = useState('')
  const [saving,      setSaving]      = useState(false)
  const [msg,         setMsg]         = useState('')
  const [confirm,     setConfirm]     = useState(null)

  const LEVEL_LABELS = {
    '1': 'Level 1 — Read & Draft',
    '2': 'Level 2 — Submit',
    '3': 'Level 3 — Limited Approve',
    '4': 'Level 4 — Full Authority',
  }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [dRes, oRes] = await Promise.all([
      supabase.from('office_delegations')
        .select('id, delegation_level, expires_at, reason, is_active, offices(name, office_type), persons!office_delegations_delegate_person_id_fkey(first_name, last_name, email), grantor:persons!office_delegations_granted_by_fkey(first_name, last_name)')
        .eq('offices.institution_id', office.institution_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      supabase.from('offices').select('id, name, office_type')
        .eq('institution_id', office.institution_id).eq('is_active', true).order('name')
    ])
    setDelegations(dRes.data || [])
    setOffices(oRes.data || [])
    setLoading(false)
  }

  async function searchPersons(q) {
    setSearch(q); setSelPerson(null)
    if (!q || q.length < 2) { setPersonRes([]); return }
    const { data } = await supabase.from('persons')
      .select('id, first_name, last_name, email')
      .or(`email.ilike.%${q}%,first_name.ilike.%${q}%`).limit(5)
    setPersonRes(data || [])
  }

  async function grant() {
    if (!selOffice || !selPerson || !expiresAt || !reason) {
      setMsg('All fields are required.'); return
    }
    setSaving(true); setMsg('')
    const { error } = await supabase.rpc('rpc_grant_delegation', {
      p_granting_person: person.id,
      p_office_id:       selOffice,
      p_delegate_person: selPerson.id,
      p_level:           parseInt(level),
      p_expires_at:      new Date(expiresAt).toISOString(),
      p_reason:          reason.trim(),
    })
    setSaving(false)
    if (error) { setMsg(error.message); return }
    setSelOffice(''); setSearch(''); setSelPerson(null); setLevel('2'); setExpiresAt(''); setReason('')
    setShowForm(false); load()
  }

  async function revoke(id) {
    await supabase.rpc('rpc_revoke_delegation', {
      p_revoking_person: person.id,
      p_delegation_id:   id,
      p_reason:          'Revoked via Coredesk',
    })
    setConfirm(null); load()
  }

  const expiring = delegations.filter(d => {
    const hrs = (new Date(d.expires_at) - Date.now()) / 3600000
    return hrs > 0 && hrs < 48
  })

  return (
    <div>
      <Monolith eyebrow="Coredesk · Authority" title="Delegations"
        description="Scoped, time-bound authority grants. All delegation events are permanently logged."
        stats={[
          { label: 'Active',   value: delegations.length },
          { label: 'Expiring', value: expiring.length, color: 'text-amber-400' },
        ]} />

      {expiring.length > 0 && (
        <div className="mt-4">
          <Notice type="warning" icon="schedule" title={`${expiring.length} delegation${expiring.length > 1 ? 's' : ''} expiring within 48 hours`}>
            Review and renew or let them expire naturally.
          </Notice>
        </div>
      )}

      <div className="mt-6">
        <PageHeader title="Active Delegations"
          action={
            <button onClick={() => setShowForm(s => !s)} className="btn-primary px-4 py-2 text-xs">
              {showForm ? 'Cancel' : '+ Grant Delegation'}
            </button>
          }
        />

        {showForm && (
          <Card className="mb-4">
            <div className="p-4">
              <Notice type="neutral" icon="gavel" title="Authority Event">
                Granting a delegation is permanently logged to the audit record.
              </Notice>
              <div className="mt-4 space-y-0">
                <MsgBox msg={msg} />
                <div className="flex gap-4">
                  <div className="field flex-1">
                    <label className="label">Delegating Office <span className="text-red-500">*</span></label>
                    <select value={selOffice} onChange={e => setSelOffice(e.target.value)} className="input">
                      <option value="">Select office...</option>
                      {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                  <div className="field flex-1">
                    <label className="label">Delegation Level <span className="text-red-500">*</span></label>
                    <select value={level} onChange={e => setLevel(e.target.value)} className="input">
                      {Object.entries(LEVEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field relative">
                  <label className="label">Delegate Person <span className="text-red-500">*</span></label>
                  {selPerson ? (
                    <div className="p-3 bg-green-50 border border-green-200 flex items-center justify-between">
                      <span className="text-body-sm font-bold text-green-800">{selPerson.first_name} {selPerson.last_name} — {selPerson.email}</span>
                      <button onClick={() => { setSelPerson(null); setSearch('') }} className="text-slate-400 hover:text-red-500">✕</button>
                    </div>
                  ) : (
                    <>
                      <input type="text" value={search} onChange={e => searchPersons(e.target.value)}
                        placeholder="Search by name or email..." className="input" />
                      {personRes.length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-white border border-outline-variant shadow-lift z-10 mt-0.5">
                          {personRes.map(p => (
                            <div key={p.id} onClick={() => { setSelPerson(p); setPersonRes([]); setSearch(`${p.first_name} ${p.last_name}`) }}
                              className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0">
                              <p className="text-body-sm font-bold">{p.first_name} {p.last_name}</p>
                              <p className="text-[11px] text-on-surface-variant">{p.email}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="flex gap-4">
                  <div className="field flex-1">
                    <label className="label">Expires At <span className="text-red-500">*</span></label>
                    <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="input" />
                    <p className="text-[11px] text-slate-400 mt-1">Cannot be open-ended.</p>
                  </div>
                  <div className="field flex-1">
                    <label className="label">Reason / Context <span className="text-red-500">*</span></label>
                    <input type="text" value={reason} onChange={e => setReason(e.target.value)}
                      placeholder="e.g. HOD on medical leave 01–07 May" className="input" />
                  </div>
                </div>
                <ButtonRow>
                  <button onClick={() => setShowForm(false)} className="btn-secondary px-4 py-2 text-xs">Cancel</button>
                  <button onClick={grant} disabled={saving}
                    className={saving ? 'btn-disabled px-4 py-2 text-xs' : 'btn-primary px-4 py-2 text-xs'}>
                    {saving ? 'Granting...' : 'Grant Delegation'}
                  </button>
                </ButtonRow>
              </div>
            </div>
          </Card>
        )}

        {confirm && (
          <ConfirmDialog title="Revoke Delegation"
            message="Revoke this delegation immediately? The delegate loses authority at once. This revocation is permanently logged."
            danger confirmLabel="Revoke"
            onConfirm={() => revoke(confirm)}
            onCancel={() => setConfirm(null)} />
        )}

        {loading ? <Spinner /> : delegations.length === 0 ? (
          <EmptyState title="No active delegations" />
        ) : (
          <Card>
            <table className="data-table">
              <thead><tr><th>Office</th><th>Delegated To</th><th>Level</th><th>Expires</th><th>Reason</th><th>Revoke</th></tr></thead>
              <tbody>
                {delegations.map(d => {
                  const expiring = (new Date(d.expires_at) - Date.now()) / 3600000 < 48
                  return (
                    <tr key={d.id}>
                      <td>
                        <p className="font-bold text-on-surface">{d.offices?.name}</p>
                        <p className="text-mono-sm text-on-surface-variant">{d.offices?.office_type}</p>
                      </td>
                      <td>
                        <p className="font-bold text-on-surface">{d.persons?.first_name} {d.persons?.last_name}</p>
                        <p className="text-[11px] text-on-surface-variant">{d.persons?.email}</p>
                      </td>
                      <td><span className="badge badge-draft">{LEVEL_LABELS[d.delegation_level]}</span></td>
                      <td>
                        <p className={`text-body-sm font-bold ${expiring ? 'text-amber-600' : 'text-on-surface'}`}>
                          {new Date(d.expires_at).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })}
                        </p>
                        {expiring && <p className="text-[10px] text-amber-500 font-bold uppercase">Expiring soon</p>}
                      </td>
                      <td className="text-body-sm text-on-surface-variant max-w-xs truncate">{d.reason}</td>
                      <td><button onClick={() => setConfirm(d.id)} className="btn-danger px-3 py-1 text-xs">Revoke</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  )
}

// ─── Capabilities Tab ─────────────────────────────────────────
function CapabilitiesTab({ office, person }) {
  const [caps,     setCaps]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('')
  const [action,   setAction]   = useState('')
  const [offType,  setOffType]  = useState('')
  const [scope,    setScope]    = useState('institution')
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState('')
  const [confirm,  setConfirm]  = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('capability_grants')
      .select('id, office_type, action, scope_type')
      .eq('institution_id', office.institution_id)
      .order('office_type').order('action')
    setCaps(data || [])
    setLoading(false)
  }

  async function addCap() {
    if (!action || !offType) { setMsg('Action and office type are required.'); return }
    setSaving(true); setMsg('')
    const { error } = await supabase.from('capability_grants').insert({
      institution_id: office.institution_id,
      office_type: offType.trim(),
      action: action.trim(),
      scope_type: scope,
    })
    setSaving(false)
    if (error) { setMsg(error.message); return }
    setAction(''); setOffType(''); setScope('institution'); load()
  }

  async function revokeCap(id) {
    await supabase.from('capability_grants').delete().eq('id', id)
    setConfirm(null); load()
  }

  const filtered = filter
    ? caps.filter(c => c.office_type.includes(filter) || c.action.includes(filter))
    : caps

  // Group by office_type
  const grouped = filtered.reduce((acc, c) => {
    if (!acc[c.office_type]) acc[c.office_type] = []
    acc[c.office_type].push(c)
    return acc
  }, {})

  return (
    <div>
      <Monolith eyebrow="Coredesk · Permissions" title="Capability Grants"
        description="What each office type can do on what resource scope. Changes take effect immediately."
        stats={[{ label: 'Total Grants', value: caps.length }]} />

      <Notice type="warning" icon="warning" title="Caution — Immediate Effect" className="mt-4">
        Adding or revoking capabilities takes effect immediately for all persons holding that office type.
      </Notice>

      <div className="mt-6 space-y-4">
        {/* Add capability */}
        <Card title="Add Capability">
          <div className="p-4">
            <MsgBox msg={msg} />
            <div className="flex gap-3 flex-wrap">
              <div className="field flex-1 min-w-32">
                <label className="label">Office Type <span className="text-red-500">*</span></label>
                <input type="text" value={offType} onChange={e => setOffType(e.target.value)}
                  placeholder="e.g. head_of_department" className="input text-mono" />
              </div>
              <div className="field flex-1 min-w-32">
                <label className="label">Action <span className="text-red-500">*</span></label>
                <input type="text" value={action} onChange={e => setAction(e.target.value)}
                  placeholder="e.g. result.submit" className="input text-mono" />
              </div>
              <div className="field w-40">
                <label className="label">Scope</label>
                <select value={scope} onChange={e => setScope(e.target.value)} className="input">
                  <option value="institution">institution</option>
                  <option value="faculty">faculty</option>
                  <option value="department">department</option>
                  <option value="offering">offering</option>
                </select>
              </div>
              <div className="field flex items-end pb-0">
                <button onClick={addCap} disabled={saving}
                  className={saving ? 'btn-disabled px-4 py-2 text-xs' : 'btn-primary px-4 py-2 text-xs'}>
                  {saving ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </Card>

        {/* Filter */}
        <div>
          <input type="text" value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Filter by office type or action..." className="input" />
        </div>

        {confirm && (
          <ConfirmDialog title="Revoke Capability"
            message="Revoke this capability? Office holders of this type will immediately lose this action."
            danger confirmLabel="Revoke"
            onConfirm={() => revokeCap(confirm)}
            onCancel={() => setConfirm(null)} />
        )}

        {loading ? <Spinner /> : Object.entries(grouped).map(([ot, grants]) => (
          <Card key={ot} title={ot} subtitle={`${grants.length} capabilities`}>
            <table className="data-table">
              <thead><tr><th>Action</th><th>Scope</th><th>Revoke</th></tr></thead>
              <tbody>
                {grants.map(g => (
                  <tr key={g.id}>
                    <td className="text-mono font-bold text-on-surface">{g.action}</td>
                    <td><span className="badge badge-draft">{g.scope_type}</span></td>
                    <td><button onClick={() => setConfirm(g.id)} className="btn-danger px-2 py-1 text-xs">Revoke</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    </div>
  )
}

