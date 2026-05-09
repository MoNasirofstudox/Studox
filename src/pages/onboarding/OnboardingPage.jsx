import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Spinner, MsgBox, Monolith, Notice } from '../../components/ui'

const INSTITUTION_TYPES = [
  { value: 'university',          label: 'University',           desc: 'Full academic board, senate, faculty structure' },
  { value: 'polytechnic',         label: 'Polytechnic',          desc: 'School-based structure, academic secretary' },
  { value: 'college_of_education',label: 'College of Education', desc: 'Dean of Studies, department-based structure' },
]

export default function OnboardingPage() {
  const { person } = useAuth()
  const navigate   = useNavigate()
  const [step,     setStep]     = useState(1)
  const [instId,   setInstId]   = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [msg,      setMsg]      = useState('')

  // Step 1 fields
  const [name,  setName]  = useState('')
  const [slug,  setSlug]  = useState('')
  const [type,  setType]  = useState('university')
  const [state, setState] = useState('')
  const [email, setEmail] = useState('')

  if (person?.global_role !== 'super_admin') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-label-md uppercase tracking-widest text-on-surface-variant">Access Denied</p>
          <p className="text-body-sm text-slate-400 mt-2">Super admin privileges required.</p>
        </div>
      </div>
    )
  }

  async function createInstitution() {
    if (!name || !slug || !state) { setMsg('Name, slug and state are required.'); return }
    setLoading(true); setMsg('')
    const { data, error } = await supabase.rpc('rpc_create_institution', {
      p_admin_id: person.id,
      p_name:     name.trim(),
      p_slug:     slug.trim().toLowerCase().replace(/\s+/g, '-'),
      p_type:     type,
      p_state:    state.trim(),
      p_email:    email.trim() || null,
    })
    setLoading(false)
    if (error) { setMsg(error.message); return }
    setInstId(data.institution_id)
    setStep(2)
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-outline-variant flex justify-between items-center px-6 h-14">
        <span className="font-black text-lg tracking-tighter text-on-surface">Studox OS</span>
        <span className="text-label-md uppercase tracking-widest text-on-surface-variant">Institution Onboarding</span>
        <button onClick={() => navigate('/')} className="btn-secondary px-3 py-1.5 text-xs">← Back</button>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <Monolith
          eyebrow="Super Admin · Institution Setup"
          title="Office Infrastructure Setup"
          description="Creates the permanent authority structure. Offices outlive any person assigned to them."
          stats={[{ label: 'Step', value: `${step} / 4` }]}
        />

        {/* Progress */}
        <div className="card p-4 mt-4 mb-6">
          <div className="flex items-center">
            {['Institution Details', 'Offices Created', 'Assign Persons', 'Activate'].map((s, i) => {
              const n = i + 1
              const done = step > n
              const active = step === n
              return (
                <div key={i} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                      done ? 'bg-signal-green text-white' : active ? 'bg-primary-container text-white' : 'bg-slate-200 text-slate-400'
                    }`}>
                      {done ? '✓' : n}
                    </div>
                    <p className={`text-[10px] uppercase tracking-wider text-center mt-1.5 w-20 ${
                      active ? 'text-on-surface font-bold' : done ? 'text-signal-green' : 'text-slate-400'
                    }`}>{s}</p>
                  </div>
                  {i < 3 && <div className={`flex-1 h-0.5 mb-5 mx-1 ${done ? 'bg-signal-green' : 'bg-slate-200'}`} />}
                </div>
              )
            })}
          </div>
        </div>

        <MsgBox msg={msg} />

        {/* Step 1: Institution Details */}
        {step === 1 && (
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-primary-container text-white flex items-center justify-center text-xs font-black">1</div>
                <h2 className="text-label-md uppercase tracking-widest text-on-surface-variant">Institution Details</h2>
              </div>
            </div>
            <div className="p-5 space-y-0">
              <div className="field">
                <label className="label">Institution Name <span className="text-red-500">*</span></label>
                <input type="text" value={name}
                  onChange={e => { setName(e.target.value); setSlug(e.target.value.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')) }}
                  placeholder="University of Lagos" className="input" />
              </div>
              <div className="field">
                <label className="label">Slug <span className="text-red-500">*</span></label>
                <input type="text" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))}
                  placeholder="university-of-lagos" className="input" />
                <p className="text-[11px] text-slate-400 mt-1">URL-safe identifier. Lowercase, hyphens only. Cannot be changed.</p>
              </div>
              <div className="field">
                <label className="label">Institution Type <span className="text-red-500">*</span></label>
                <div className="space-y-2">
                  {INSTITUTION_TYPES.map(t => (
                    <label key={t.value} className={`flex items-start gap-3 p-3 border cursor-pointer transition-colors ${
                      type === t.value ? 'border-primary-container bg-surface-low' : 'border-outline-variant hover:bg-slate-50'
                    }`}>
                      <input type="radio" name="type" value={t.value} checked={type === t.value}
                        onChange={() => setType(t.value)} className="mt-0.5" />
                      <div>
                        <p className="text-body-sm font-bold text-on-surface">{t.label}</p>
                        <p className="text-[11px] text-slate-400">{t.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-4">
                <div className="field flex-1">
                  <label className="label">State <span className="text-red-500">*</span></label>
                  <input type="text" value={state} onChange={e => setState(e.target.value)} placeholder="Lagos" className="input" />
                </div>
                <div className="field flex-1">
                  <label className="label">Official Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="registrar@institution.edu.ng" className="input" />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button onClick={createInstitution} disabled={loading}
                  className={loading ? 'btn-disabled px-8 py-2' : 'btn-primary px-8 py-2'}>
                  {loading ? 'Creating...' : 'Create Institution →'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Offices Created (auto-done, show summary) */}
        {step === 2 && (
          <div className="space-y-4">
            <Notice type="info" icon="check_circle" title="Offices Created">
              <p>The institutional office structure has been created based on the <strong>{type}</strong> template.
              Capability grants and workflow templates have been seeded automatically.</p>
            </Notice>
            <OfficesCreatedSummary institutionId={instId} onNext={() => setStep(3)} />
          </div>
        )}

        {/* Step 3: Assign Persons */}
        {step === 3 && (
          <AssignPersonsStep institutionId={instId} onNext={() => setStep(4)} />
        )}

        {/* Step 4: Activate */}
        {step === 4 && (
          <ActivateStep institutionId={instId} onDone={() => navigate('/')} />
        )}
      </main>
    </div>
  )
}

function OfficesCreatedSummary({ institutionId, onNext }) {
  const [offices, setOffices] = useState([])
  const [loading, setLoading] = useState(true)

  useState(() => {
    supabase.from('offices').select('id,office_type,name').eq('institution_id', institutionId)
      .then(({ data }) => { setOffices(data || []); setLoading(false) })
  })

  if (loading) return <Spinner />

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="text-label-md uppercase tracking-widest text-on-surface-variant">
          {offices.length} Offices Created
        </h2>
        <span className="badge badge-active">Auto-seeded</span>
      </div>
      <div className="divide-y divide-slate-100">
        {offices.map(o => (
          <div key={o.id} className="p-3 flex items-center justify-between">
            <p className="text-body-sm font-bold text-on-surface">{o.name}</p>
            <span className="text-mono-sm text-on-surface-variant">{o.office_type}</span>
          </div>
        ))}
      </div>
      <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
        <button onClick={onNext} className="btn-primary px-8 py-2">Assign Persons →</button>
      </div>
    </div>
  )
}

function AssignPersonsStep({ institutionId, onNext }) {
  const [offices,   setOffices]   = useState([])
  const [assignments, setAsgn]   = useState({}) // officeId → personId
  const [search,    setSearch]    = useState({}) // officeId → query
  const [results,   setResults]   = useState({}) // officeId → [persons]
  const [saving,    setSaving]    = useState(false)
  const [msg,       setMsg]       = useState('')
  const { person }                = useAuth()

  useEffect(() => {
    supabase.from('offices').select('id,office_type,name').eq('institution_id', institutionId)
      .then(({ data }) => setOffices(data || []))
  }, [])

  async function searchPersons(officeId, query) {
    setSearch(s => ({ ...s, [officeId]: query }))
    if (!query || query.length < 2) { setResults(r => ({ ...r, [officeId]: [] })); return }
    const { data } = await supabase.from('persons')
      .select('id,first_name,last_name,email')
      .or(`email.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
      .limit(5)
    setResults(r => ({ ...r, [officeId]: data || [] }))
  }

  function selectPerson(officeId, p) {
    setAsgn(a => ({ ...a, [officeId]: p }))
    setResults(r => ({ ...r, [officeId]: [] }))
    setSearch(s => ({ ...s, [officeId]: `${p.first_name} ${p.last_name}` }))
  }

  async function saveAssignments() {
    setSaving(true); setMsg('')
    const entries = Object.entries(assignments)
    if (entries.length === 0) { setMsg('Assign at least one office before proceeding.'); setSaving(false); return }

    for (const [officeId, p] of entries) {
      await supabase.from('office_assignments').insert({
        office_id:   officeId,
        person_id:   p.id,
        assigned_by: person.id,
      })
    }
    setSaving(false)
    onNext()
  }

  // Determine which offices are "required" (critical path)
  const REQUIRED = ['registrar','deputy_registrar_academics','central_exams_office','quality_assurance',
    'academic_board_secretary','pre_academic_board_secretary']
  const required = offices.filter(o => REQUIRED.includes(o.office_type))
  const optional = offices.filter(o => !REQUIRED.includes(o.office_type))
  const requiredUnassigned = required.filter(o => !assignments[o.id]).length

  return (
    <div className="space-y-4">
      <MsgBox msg={msg} />

      {requiredUnassigned > 0 && (
        <Notice type="warning" icon="warning" title={`${requiredUnassigned} Required Office${requiredUnassigned > 1 ? 's' : ''} Unassigned`}>
          Institution cannot be activated until all required offices have at least one assignment.
        </Notice>
      )}

      {[{ label: 'Required Offices', list: required }, { label: 'Optional Offices', list: optional }].map(group => (
        <div key={group.label} className="card">
          <div className="card-header">
            <h2 className="text-label-md uppercase tracking-widest text-on-surface-variant">{group.label}</h2>
            <span className="badge badge-draft">{group.list.length}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {group.list.map(o => (
              <div key={o.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="w-44 shrink-0">
                    <p className="text-body-sm font-bold text-on-surface">{o.name}</p>
                    <p className="text-mono-sm text-on-surface-variant mt-0.5">{o.office_type}</p>
                  </div>
                  <div className="flex-1 relative">
                    {assignments[o.id] ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 p-2 bg-green-50 border border-green-200 flex items-center gap-2">
                          <span className="text-body-sm font-bold text-green-800">
                            {assignments[o.id].first_name} {assignments[o.id].last_name}
                          </span>
                          <span className="text-[11px] text-green-600">{assignments[o.id].email}</span>
                        </div>
                        <button onClick={() => setAsgn(a => { const n = {...a}; delete n[o.id]; return n })}
                          className="text-slate-400 hover:text-red-500 text-sm">✕</button>
                      </div>
                    ) : (
                      <>
                        <input type="text"
                          value={search[o.id] || ''}
                          onChange={e => searchPersons(o.id, e.target.value)}
                          placeholder="Search by name or email..."
                          className="input"
                        />
                        {results[o.id]?.length > 0 && (
                          <div className="absolute top-full left-0 right-0 bg-white border border-outline-variant shadow-lift z-10 mt-0.5">
                            {results[o.id].map(p => (
                              <div key={p.id} onClick={() => selectPerson(o.id, p)}
                                className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0">
                                <p className="text-body-sm font-bold text-on-surface">{p.first_name} {p.last_name}</p>
                                <p className="text-[11px] text-on-surface-variant">{p.email}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex justify-between">
        <p className="text-body-sm text-on-surface-variant self-center">
          {Object.keys(assignments).length} of {offices.length} offices assigned
        </p>
        <button onClick={saveAssignments} disabled={saving}
          className={saving ? 'btn-disabled px-8 py-2' : 'btn-primary px-8 py-2'}>
          {saving ? 'Saving...' : 'Save Assignments →'}
        </button>
      </div>
    </div>
  )
}

function ActivateStep({ institutionId, onDone }) {
  const [loading,  setLoading]  = useState(false)
  const [msg,      setMsg]      = useState('')
  const [done,     setDone]     = useState(false)

  async function activate() {
    setLoading(true); setMsg('')
    const { error } = await supabase.from('institutions')
      .update({ is_active: true, onboarding_step: 4 })
      .eq('id', institutionId)
    setLoading(false)
    if (error) { setMsg(error.message); return }
    setDone(true)
  }

  if (done) return (
    <div className="card p-8 text-center">
      <div className="text-4xl mb-4">🎓</div>
      <h2 className="text-headline-md font-bold text-on-surface mb-2">Institution Active</h2>
      <p className="text-body-md text-on-surface-variant mb-6">
        The institutional infrastructure is live. Office holders can now sign in and begin operating.
      </p>
      <button onClick={onDone} className="btn-primary px-8 py-3">Go to Dashboard →</button>
    </div>
  )

  return (
    <div className="space-y-4">
      <Notice type="neutral" icon="gavel" title="Final Activation">
        Activating the institution makes it live. All assigned office holders will be able to sign in
        and begin operating under their offices. This cannot be undone without super admin intervention.
      </Notice>
      <MsgBox msg={msg} />
      <div className="card p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Registry',      val: 'Ready' },
            { label: 'Offices',       val: 'Seeded' },
            { label: 'Capabilities',  val: 'Granted' },
            { label: 'Workflow',      val: 'Loaded' },
          ].map(s => (
            <div key={s.label} className="bg-green-50 border border-green-200 p-3 text-center">
              <p className="text-label-sm uppercase tracking-wider text-green-600">{s.label}</p>
              <p className="text-body-sm font-bold text-green-800 mt-1">{s.val}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <button onClick={activate} disabled={loading}
            className={loading ? 'btn-disabled px-10 py-3' : 'btn-success px-10 py-3'}>
            {loading ? 'Activating...' : 'Activate Institution'}
          </button>
        </div>
      </div>
    </div>
  )
}
