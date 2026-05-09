import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { triggerPush } from '../../lib/notify'
import {
  Spinner, Monolith, Notice, MsgBox, EmptyState,
  Card, ConfirmDialog, ButtonRow,
  TopBar, AppShell, SidebarHeader, SidebarSection, NavItem, AuthorityTag,
  AuthorityBadge, PageHeader
} from '../../components/ui'

// ─── Role → nav ──────────────────────────────────────────────
function getNav(officeType) {
  const map = {
    lecturer:                  [{ id:'entry',   label:'Score Entry',    icon:'edit_note'      },
                                { id:'courses', label:'My Courses',     icon:'menu_book'      }],
    departmental_exam_officer: [{ id:'verify',  label:'Verify Results', icon:'fact_check'     }],
    central_exams_office:      [{ id:'central', label:'Aggregation',    icon:'inbox'          }],
    quality_assurance:         [{ id:'qa',      label:'QA Monitor',     icon:'policy'         },
                                { id:'flagged', label:'Flagged',        icon:'block'          }],
    dean:                      [{ id:'faculty', label:'Faculty Review', icon:'corporate_fare' }],
    head_of_department:        [{ id:'dept',    label:'Dept Results',   icon:'group'          }],
    deputy_registrar_academics:[{ id:'dr',      label:'DR Review',      icon:'verified'       }],
    registrar:                 [{ id:'publish', label:'Publication',    icon:'publish'        }],
  }
  return map[officeType] || [{ id:'batches', label:'All Batches', icon:'inbox' }]
}

// ─── Stage badge ─────────────────────────────────────────────
const STAGE = {
  draft:              { label:'Draft',              cls:'bg-slate-100 text-slate-600'   },
  dept_submitted:     { label:'Dept Submitted',     cls:'bg-amber-50 text-amber-700'    },
  central_review:     { label:'Central Review',     cls:'bg-blue-50 text-blue-700'      },
  faculty_review:     { label:'Faculty Review',     cls:'bg-purple-50 text-purple-700'  },
  pre_academic_board: { label:'Pre-Academic Board', cls:'bg-indigo-50 text-indigo-700'  },
  registrar_review:   { label:'Registrar Review',   cls:'bg-orange-50 text-orange-700'  },
  qa_review:          { label:'QA Review',          cls:'bg-red-50 text-red-700'        },
  academic_board:     { label:'Academic Board',     cls:'bg-slate-200 text-slate-800'   },
  registrar_final:    { label:'Registrar Final',    cls:'bg-green-50 text-green-800'    },
  published:          { label:'Published',          cls:'bg-green-100 text-green-900'   },
}
function StageBadge({ stage }) {
  const s = STAGE[stage] || { label: stage, cls:'bg-slate-100 text-slate-600' }
  return <span className={`text-label-sm uppercase tracking-wider px-2 py-0.5 font-bold ${s.cls}`}>{s.label}</span>
}

function semLabel(sem) {
  if (!sem) return '—'
  const t = sem.type === 'first' ? '1st Sem' : sem.type === 'second' ? '2nd Sem' : '3rd Sem'
  return `${sem.academic_sessions?.name || ''} ${t}`.trim()
}

// ─── Shared batch loader ─────────────────────────────────────
function useBatches(institutionId, stages) {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    let q = supabase.from('result_batches')
      .select(`id, current_stage, is_locked, qa_flagged, updated_at,
        departments(id, name, code, faculties(name)),
        semesters(id, type, academic_sessions(name))`)
      .eq('institution_id', institutionId)
      .order('updated_at', { ascending: false })
    if (stages?.length) q = q.in('current_stage', stages)
    const { data } = await q
    setBatches(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [institutionId])
  return { batches, loading, reload: load }
}

// ─── Batch card ──────────────────────────────────────────────
function BatchCard({ batch, onClick, actions }) {
  return (
    <div onClick={onClick}
      className={`card p-4 flex items-center gap-4 mb-2 ${onClick ? 'cursor-pointer hover:border-primary-container transition-colors' : ''} ${batch.qa_flagged ? 'border-red-300 bg-red-50/20' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-body-sm font-bold text-on-surface">{batch.departments?.name}</p>
          {batch.qa_flagged && <span className="text-label-sm text-red-600 uppercase font-bold">⚠ QA Flagged</span>}
        </div>
        <p className="text-[11px] text-on-surface-variant mt-0.5">
          {batch.departments?.faculties?.name} · {semLabel(batch.semesters)}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StageBadge stage={batch.current_stage} />
        {actions && <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>{actions}</div>}
        {onClick && <span className="text-on-surface-variant ml-1">›</span>}
      </div>
    </div>
  )
}

// ─── Reject panel ────────────────────────────────────────────
function RejectPanel({ onConfirm, onCancel }) {
  const [reason, setReason] = useState('')
  return (
    <Card className="mb-2 border-red-300">
      <div className="p-4 space-y-3">
        <Notice type="danger" icon="warning" title="Rejection — Immutable Event">
          The batch will be returned to the previous stage. This is permanently logged.
        </Notice>
        <div className="field">
          <label className="label">Rejection Reason <span className="text-red-500">*</span></label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
            className="input resize-none" placeholder="Specify deficiencies to be corrected..." />
        </div>
        <ButtonRow>
          <button onClick={onCancel} className="btn-secondary px-4 py-2 text-xs">Cancel</button>
          <button onClick={() => reason.trim() && onConfirm(reason)} className="btn-danger px-4 py-2 text-xs">Confirm Rejection</button>
        </ButtonRow>
      </div>
    </Card>
  )
}

// ─── Root ────────────────────────────────────────────────────
export default function Acadex() {
  const { person, office, signOut } = useAuth()
  const navigate = useNavigate()
  const nav = office ? getNav(office.office_type) : []
  const [tab, setTab] = useState(nav[0]?.id || 'batches')

  useEffect(() => { if (nav.length) setTab(nav[0].id) }, [office?.office_type])

  if (!office) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <p className="text-label-md uppercase tracking-widest text-on-surface-variant mb-2">No office selected</p>
        <button onClick={() => navigate('/')} className="btn-secondary px-4 py-2 text-xs">← Select Office</button>
      </div>
    </div>
  )

  const allNav = [...nav, { id:'audit', label:'Audit Trail', icon:'history' }]

  const sidebar = (
    <>
      <SidebarHeader module="Acadex" role="Results Pipeline" />
      <SidebarSection>
        {allNav.map(n => <NavItem key={n.id} icon={n.icon} label={n.label} active={tab===n.id} onClick={() => setTab(n.id)} />)}
      </SidebarSection>
      <AuthorityTag officeName={office.office_name} source={office.authority_source} />
    </>
  )

  const topbar = (
    <TopBar section="Acadex · Results" right={
      <div className="flex items-center gap-3">
        <span className="text-label-sm uppercase tracking-widest text-on-surface-variant hidden md:block">{office.institution_name}</span>
        <button onClick={() => navigate('/')} className="btn-secondary px-3 py-1.5 text-xs">Switch Office</button>
        <button onClick={signOut} className="btn-secondary px-3 py-1.5 text-xs">Sign Out</button>
      </div>
    } />
  )

  return (
    <AppShell header={topbar} sidebar={sidebar}>
      <div className="max-w-6xl mx-auto">
        {tab==='courses'  && <LecturerCourses      office={office} person={person} />}
        {tab==='entry'    && <LecturerScoreEntry   office={office} person={person} />}
        {tab==='verify'   && <ExamOfficerVerify    office={office} person={person} />}
        {tab==='dept'     && <HODView              office={office} person={person} />}
        {tab==='central'  && <CentralExamsView     office={office} person={person} />}
        {tab==='faculty'  && <DeanView             office={office} person={person} />}
        {tab==='dr'       && <DeputyRegistrarView  office={office} person={person} />}
        {tab==='qa'       && <QAMonitorView        office={office} person={person} />}
        {tab==='flagged'  && <QAFlaggedView        office={office} person={person} />}
        {tab==='publish'  && <RegistrarPublish     office={office} person={person} />}
        {tab==='audit'    && <AcadexAudit          office={office} />}
        {tab==='batches'  && <AllBatchesView       office={office} />}
      </div>
    </AppShell>
  )
}

// ─── Lecturer: My Courses ────────────────────────────────────
function LecturerCourses({ office, person }) {
  const [offerings, setOfferings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('course_offerings')
      .select(`id, courses(name, code, level, credit_units, departments(name)),
               semesters(type, academic_sessions(name))`)
      .eq('lecturer_id', person.id)
      .eq('institution_id', office.institution_id)
      .then(({ data }) => { setOfferings(data||[]); setLoading(false) })
  }, [])

  return (
    <div>
      <Monolith eyebrow="Acadex · Lecturer" title="My Courses"
        description="Courses you are assigned to teach this semester."
        stats={[{ label:'Courses', value: offerings.length }]} />
      <div className="mt-6">
        {loading ? <Spinner /> : offerings.length === 0
          ? <EmptyState title="No courses assigned" subtitle="Contact your HOD to be assigned to a course offering." />
          : <Card>
              <table className="data-table">
                <thead><tr><th>Course</th><th>Code</th><th>Level</th><th>Units</th><th>Semester</th></tr></thead>
                <tbody>
                  {offerings.map(o => (
                    <tr key={o.id}>
                      <td className="font-bold text-on-surface">{o.courses?.name}</td>
                      <td className="text-mono text-xs">{o.courses?.code}</td>
                      <td>{o.courses?.level}</td>
                      <td>{o.courses?.credit_units}</td>
                      <td>{semLabel(o.semesters)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>}
      </div>
    </div>
  )
}

// ─── Lecturer: Score Entry ────────────────────────────────────
function LecturerScoreEntry({ office, person }) {
  const [offerings, setOfferings] = useState([])
  const [selOff,    setSelOff]    = useState(null)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    supabase.from('course_offerings')
      .select(`id, courses(id, name, code, level, department_id, departments(id, name)),
               semesters(id, type, academic_sessions(name))`)
      .eq('lecturer_id', person.id)
      .eq('institution_id', office.institution_id)
      .then(({ data }) => { setOfferings(data||[]); setLoading(false) })
  }, [])

  if (selOff) return <ScoreEntrySheet office={office} person={person} offering={selOff} onBack={() => setSelOff(null)} />

  return (
    <div>
      <Monolith eyebrow="Acadex · Lecturer" title="Score Entry"
        description="Enter CA and examination scores. Save to draft, then submit the batch when all courses are complete." />
      <div className="mt-6">
        <PageHeader title="Select Course" />
        {loading ? <Spinner /> : offerings.length === 0
          ? <EmptyState title="No courses assigned" />
          : offerings.map(o => (
            <div key={o.id} onClick={() => setSelOff(o)}
              className="card p-4 mb-2 cursor-pointer hover:border-primary-container transition-colors flex items-center justify-between">
              <div>
                <p className="text-body-sm font-bold text-on-surface">{o.courses?.code} — {o.courses?.name}</p>
                <p className="text-[11px] text-on-surface-variant mt-0.5">{o.courses?.departments?.name} · Level {o.courses?.level} · {semLabel(o.semesters)}</p>
              </div>
              <span className="text-on-surface-variant">›</span>
            </div>
          ))}
      </div>
    </div>
  )
}

// ─── Score Entry Sheet ────────────────────────────────────────
function ScoreEntrySheet({ office, person, offering, onBack }) {
  const [students,   setStudents]   = useState([])
  const [scores,     setScores]     = useState({})
  const [batch,      setBatch]      = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [msg,        setMsg]        = useState('')
  const [msgType,    setMsgType]    = useState('error')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)

    const [regRes, resRes, batchRes] = await Promise.all([
      supabase.from('course_registrations')
        .select('id, student_id, persons!course_registrations_student_id_fkey(first_name,last_name), student_enrollments(matric_number)')
        .eq('offering_id', offering.id).eq('is_active', true),
      supabase.from('results')
        .select('registration_id, ca_score, exam_score, grade, grade_point, status')
        .eq('offering_id', offering.id),
      supabase.from('result_batches')
        .select('id, current_stage, is_locked')
        .eq('institution_id', office.institution_id)
        .eq('department_id', offering.courses?.departments?.id)
        .maybeSingle(),
    ])

    const list = regRes.data || []
    setStudents(list)

    const init = {}
    list.forEach(r => {
      const res = (resRes.data||[]).find(x => x.registration_id === r.id)
      init[r.id] = { ca: res?.ca_score ?? '', exam: res?.exam_score ?? '', grade: res?.grade || '', status: res?.status || 'draft' }
    })
    setScores(init)
    setBatch(batchRes.data)
    setLoading(false)
  }

  async function save() {
    setSaving(true); setMsg('')
    let errors = 0
    for (const s of students) {
      const sc = scores[s.id]
      if (sc?.ca === '' || sc?.exam === '') continue
      const ca = parseFloat(sc.ca); const ex = parseFloat(sc.exam)
      if (isNaN(ca) || isNaN(ex)) continue
      const { error } = await supabase.rpc('rpc_upsert_result', {
        p_person_id: person.id, p_registration_id: s.id, p_ca_score: ca, p_exam_score: ex
      })
      if (error) errors++
    }
    setSaving(false)
    if (errors) { setMsgType('error'); setMsg(`${errors} result(s) failed.`) }
    else { setMsgType('success'); setMsg('Scores saved.'); load() }
  }

  async function submitBatch() {
    if (!batch) { setMsg('No batch found. Ask your HOD to create a batch for this department.'); return }
    setSubmitting(true); setMsg('')
    const { error } = await supabase.rpc('rpc_submit_batch', { p_person_id: person.id, p_batch_id: batch.id })
    setSubmitting(false)
    if (error) { setMsgType('error'); setMsg(error.message) }
    else { setMsgType('success'); setMsg('Batch submitted for verification.'); load() }
  }

  const locked = batch?.current_stage && batch.current_stage !== 'draft'
  const allScored = students.length > 0 && students.every(s => scores[s.id]?.ca !== '' && scores[s.id]?.exam !== '')

  return (
    <div>
      <button onClick={onBack} className="text-label-sm uppercase tracking-wider text-on-surface-variant hover:text-on-surface mb-4 block">← Back</button>

      <div className="card mb-4">
        <div className="p-4 bg-primary-container text-white flex justify-between items-center">
          <div>
            <p className="text-label-sm text-slate-400 uppercase tracking-widest">{offering.courses?.departments?.name}</p>
            <h2 className="text-headline-sm font-bold mt-0.5">{offering.courses?.code} — {offering.courses?.name}</h2>
            <p className="text-body-sm text-slate-400 mt-0.5">{students.length} students · {semLabel(offering.semesters)}</p>
          </div>
          {batch && <StageBadge stage={batch.current_stage} />}
        </div>
      </div>

      <MsgBox msg={msg} type={msgType} />

      {locked
        ? <Notice type="info" icon="lock" title="Scores Locked" className="mb-4">
            Batch is in the approval pipeline. Scores are read-only until the batch is rejected and returned to draft.
          </Notice>
        : <div className="flex gap-2 mb-4">
            <button onClick={save} disabled={saving}
              className={saving ? 'btn-disabled px-4 py-2 text-xs' : 'btn-primary px-4 py-2 text-xs'}>
              {saving ? 'Saving...' : 'Save All Scores'}
            </button>
            {allScored && batch && (
              <button onClick={submitBatch} disabled={submitting}
                className={submitting ? 'btn-disabled px-4 py-2 text-xs' : 'btn-secondary px-4 py-2 text-xs'}>
                {submitting ? 'Submitting...' : 'Submit Batch →'}
              </button>
            )}
          </div>}

      {loading ? <Spinner /> : students.length === 0
        ? <EmptyState title="No students registered" />
        : <Card>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr><th>Student</th><th>Matric</th><th>CA (0–40)</th><th>Exam (0–60)</th><th>Total</th><th>Grade</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {students.map(s => {
                    const sc = scores[s.id] || { ca:'', exam:'', grade:'', status:'draft' }
                    const editable = !locked && sc.status === 'draft'
                    const total = sc.ca !== '' && sc.exam !== '' ? (parseFloat(sc.ca)+parseFloat(sc.exam)).toFixed(1) : '—'
                    return (
                      <tr key={s.id}>
                        <td className="font-bold">{s.persons?.first_name} {s.persons?.last_name}</td>
                        <td className="text-mono text-xs text-on-surface-variant">{s.student_enrollments?.matric_number || '—'}</td>
                        <td>
                          {editable
                            ? <input type="number" min="0" max="40" step="0.5" value={sc.ca}
                                onChange={e => setScores(p => ({ ...p, [s.id]: { ...p[s.id], ca: e.target.value } }))}
                                className="input w-20 py-1 px-2 text-sm" />
                            : sc.ca !== '' ? sc.ca : '—'}
                        </td>
                        <td>
                          {editable
                            ? <input type="number" min="0" max="60" step="0.5" value={sc.exam}
                                onChange={e => setScores(p => ({ ...p, [s.id]: { ...p[s.id], exam: e.target.value } }))}
                                className="input w-20 py-1 px-2 text-sm" />
                            : sc.exam !== '' ? sc.exam : '—'}
                        </td>
                        <td className="font-bold">{total}</td>
                        <td className="font-bold">{sc.grade || '—'}</td>
                        <td><span className={`badge ${sc.status==='published'?'badge-approved':sc.status==='draft'?'badge-draft':'badge-pending'}`}>{sc.status}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>}
    </div>
  )
}

// ─── HOD: Department Results ──────────────────────────────────
function HODView({ office, person }) {
  const { batches, loading, reload } = useBatches(office.institution_id)
  const deptBatches = batches.filter(b => b.departments?.id === office.department_id)
  const [semesters,  setSemesters]  = useState([])
  const [selSem,     setSelSem]     = useState('')
  const [creating,   setCreating]   = useState(false)
  const [rejecting,  setRejecting]  = useState(null)
  const [msg,        setMsg]        = useState('')
  const [msgType,    setMsgType]    = useState('error')

  useEffect(() => {
    supabase.from('semesters')
      .select('id, type, is_current, academic_sessions(name)')
      .eq('institution_id', office.institution_id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setSemesters(data||[])
        const cur = (data||[]).find(s => s.is_current)
        if (cur) setSelSem(cur.id)
      })
  }, [])

  async function createBatch() {
    if (!selSem || !office.department_id) { setMsg('Select a semester. Ensure your office has department scope.'); return }
    setCreating(true); setMsg('')
    const { error } = await supabase.from('result_batches').insert({
      institution_id: office.institution_id, semester_id: selSem,
      department_id: office.department_id, current_stage: 'draft',
      created_by_office: office.office_id,
    })
    setCreating(false)
    if (error) { setMsgType('error'); setMsg(error.message) }
    else reload()
  }

  async function submitBatch(id) {
    const { error } = await supabase.rpc('rpc_submit_batch', { p_person_id: person.id, p_batch_id: id })
    if (error) { setMsgType('error'); setMsg(error.message) }
    else reload()
  }

  async function rejectBatch(id, reason) {
    const { error } = await supabase.rpc('rpc_reject_batch', { p_person_id: person.id, p_batch_id: id, p_reason: reason })
    if (error) { setMsgType('error'); setMsg(error.message) }
    else { setRejecting(null); reload() }
  }

  return (
    <div>
      <Monolith eyebrow="Acadex · HOD" title="Department Results"
        description="Create and manage result batches for your department."
        stats={[
          { label:'Total',   value: deptBatches.length },
          { label:'Draft',   value: deptBatches.filter(b => b.current_stage==='draft').length },
          { label:'Pipeline',value: deptBatches.filter(b => !['draft','published'].includes(b.current_stage)).length, color:'text-amber-400' },
        ]} />
      <div className="mt-6 space-y-4">
        <MsgBox msg={msg} type={msgType} />
        <Card title="Create Result Batch">
          <div className="p-4 flex gap-3 items-end">
            <div className="flex-1">
              <label className="label">Semester</label>
              <select value={selSem} onChange={e => setSelSem(e.target.value)} className="input">
                <option value="">Select...</option>
                {semesters.map(s => <option key={s.id} value={s.id}>{semLabel(s)}{s.is_current?' (current)':''}</option>)}
              </select>
            </div>
            <button onClick={createBatch} disabled={creating}
              className={creating ? 'btn-disabled px-4 py-2 text-xs' : 'btn-primary px-4 py-2 text-xs'}>
              {creating ? 'Creating...' : 'Create Batch'}
            </button>
          </div>
        </Card>
        <PageHeader title="Department Batches" />
        {loading ? <Spinner /> : deptBatches.length === 0
          ? <EmptyState title="No batches yet" subtitle="Create a batch above to begin results entry." />
          : deptBatches.map(b => (
            <div key={b.id}>
              <BatchCard batch={b} actions={
                b.current_stage === 'draft' ? (
                  <button onClick={() => submitBatch(b.id)} className="btn-primary px-3 py-1.5 text-xs">Submit →</button>
                ) : ['central_review','faculty_review'].includes(b.current_stage) ? (
                  <button onClick={() => setRejecting(rejecting===b.id?null:b.id)} className="btn-danger px-3 py-1.5 text-xs">Reject</button>
                ) : null
              } />
              {rejecting === b.id && <RejectPanel onConfirm={r => rejectBatch(b.id, r)} onCancel={() => setRejecting(null)} />}
            </div>
          ))}
      </div>
    </div>
  )
}

// ─── Exam Officer: Verify ─────────────────────────────────────
function ExamOfficerVerify({ office, person }) {
  const { batches, loading, reload } = useBatches(office.institution_id, ['dept_submitted'])
  const [acting,    setActing]    = useState(false)
  const [rejecting, setRejecting] = useState(null)
  const [msg,       setMsg]       = useState('')
  const [msgType,   setMsgType]   = useState('error')

  async function forward(id) {
    setActing(true)
    const { error } = await supabase.rpc('rpc_forward_batch', { p_person_id: person.id, p_batch_id: id, p_note: 'Verified by Exam Officer' })
    setActing(false)
    if (error) { setMsgType('error'); setMsg(error.message) } else reload()
  }

  async function reject(id, reason) {
    const { error } = await supabase.rpc('rpc_reject_batch', { p_person_id: person.id, p_batch_id: id, p_reason: reason })
    if (error) { setMsgType('error'); setMsg(error.message) }
    else { setRejecting(null); reload() }
  }

  return (
    <div>
      <Monolith eyebrow="Acadex · Exam Officer" title="Verify Results"
        description="Verify completeness and accuracy of departmental submissions before forwarding to Central Exams."
        stats={[{ label:'Awaiting', value: batches.length, color:'text-amber-400' }]} />
      <Notice type="warning" icon="fact_check" title="Verification Authority" className="mt-4">
        Forwarding a batch is an immutable authority event logged to the audit trail.
      </Notice>
      <div className="mt-6">
        <MsgBox msg={msg} type={msgType} />
        <PageHeader title="Awaiting Verification" />
        {loading ? <Spinner /> : batches.length === 0
          ? <EmptyState title="Nothing to verify" subtitle="Batches appear once departments submit." />
          : batches.map(b => (
            <div key={b.id}>
              <BatchCard batch={b} actions={
                <div className="flex gap-1.5">
                  <button onClick={() => forward(b.id)} disabled={acting}
                    className={acting ? 'btn-disabled px-3 py-1.5 text-xs' : 'btn-primary px-3 py-1.5 text-xs'}>
                    Verify & Forward →
                  </button>
                  <button onClick={() => setRejecting(rejecting===b.id?null:b.id)} className="btn-danger px-3 py-1.5 text-xs">Reject</button>
                </div>
              } />
              {rejecting===b.id && <RejectPanel onConfirm={r => reject(b.id,r)} onCancel={() => setRejecting(null)} />}
            </div>
          ))}
      </div>
    </div>
  )
}

// ─── Central Exams ───────────────────────────────────────────
function CentralExamsView({ office, person }) {
  const { batches, loading, reload } = useBatches(office.institution_id, ['central_review'])
  const [acting,    setActing]    = useState(false)
  const [rejecting, setRejecting] = useState(null)
  const [msg,       setMsg]       = useState('')
  const [msgType,   setMsgType]   = useState('error')

  async function forward(id) {
    setActing(true)
    const { error } = await supabase.rpc('rpc_forward_batch', { p_person_id: person.id, p_batch_id: id, p_note: 'Cleared by Central Exams — forwarded to Dean' })
    setActing(false)
    if (error) { setMsgType('error'); setMsg(error.message) } else reload()
  }

  async function reject(id, reason) {
    const { error } = await supabase.rpc('rpc_reject_batch', { p_person_id: person.id, p_batch_id: id, p_reason: reason })
    if (error) { setMsgType('error'); setMsg(error.message) }
    else { setRejecting(null); reload() }
  }

  return (
    <div>
      <Monolith eyebrow="Acadex · Central Exams" title="Aggregation Desk"
        description="All submissions route through this office. Standardize and forward to faculty."
        stats={[{ label:'Awaiting', value: batches.length, color:'text-amber-400' }]} />
      <Notice type="neutral" icon="verified_user" title="Standardization Authority" className="mt-4">
        Forwarding a batch to the Dean is an immutable authority event. Verify conformance with institutional grading policy.
      </Notice>
      <div className="mt-6">
        <MsgBox msg={msg} type={msgType} />
        <PageHeader title="Awaiting Central Review" />
        {loading ? <Spinner /> : batches.length === 0
          ? <EmptyState title="Nothing in central review" />
          : batches.map(b => (
            <div key={b.id}>
              <BatchCard batch={b} actions={
                <div className="flex gap-1.5">
                  <button onClick={() => forward(b.id)} disabled={acting}
                    className={acting ? 'btn-disabled px-3 py-1.5 text-xs' : 'btn-primary px-3 py-1.5 text-xs'}>
                    Forward to Dean →
                  </button>
                  <button onClick={() => setRejecting(rejecting===b.id?null:b.id)} className="btn-danger px-3 py-1.5 text-xs">Reject</button>
                </div>
              } />
              {rejecting===b.id && <RejectPanel onConfirm={r => reject(b.id,r)} onCancel={() => setRejecting(null)} />}
            </div>
          ))}
      </div>
    </div>
  )
}

// ─── Dean: Faculty Review ─────────────────────────────────────
function DeanView({ office, person }) {
  const { batches, loading, reload } = useBatches(office.institution_id, ['faculty_review'])
  const [acting,    setActing]    = useState(false)
  const [rejecting, setRejecting] = useState(null)
  const [msg,       setMsg]       = useState('')
  const [msgType,   setMsgType]   = useState('error')

  async function forward(id) {
    setActing(true)
    const { error } = await supabase.rpc('rpc_forward_batch', { p_person_id: person.id, p_batch_id: id, p_note: 'Faculty approved by Dean' })
    setActing(false)
    if (error) { setMsgType('error'); setMsg(error.message) } else reload()
  }

  async function reject(id, reason) {
    const { error } = await supabase.rpc('rpc_reject_batch', { p_person_id: person.id, p_batch_id: id, p_reason: reason })
    if (error) { setMsgType('error'); setMsg(error.message) }
    else { setRejecting(null); reload() }
  }

  return (
    <div>
      <Monolith eyebrow="Acadex · Dean" title="Faculty Review"
        description="Review all departmental results at faculty level before Pre-Academic Board."
        stats={[{ label:'Awaiting', value: batches.length }]} />
      <div className="mt-6">
        <MsgBox msg={msg} type={msgType} />
        <PageHeader title="Awaiting Faculty Approval" />
        {loading ? <Spinner /> : batches.length === 0
          ? <EmptyState title="Nothing at faculty review" />
          : batches.map(b => (
            <div key={b.id}>
              <BatchCard batch={b} actions={
                <div className="flex gap-1.5">
                  <button onClick={() => forward(b.id)} disabled={acting}
                    className={acting ? 'btn-disabled px-3 py-1.5 text-xs' : 'btn-primary px-3 py-1.5 text-xs'}>
                    Approve & Forward →
                  </button>
                  <button onClick={() => setRejecting(rejecting===b.id?null:b.id)} className="btn-danger px-3 py-1.5 text-xs">Reject</button>
                </div>
              } />
              {rejecting===b.id && <RejectPanel onConfirm={r => reject(b.id,r)} onCancel={() => setRejecting(null)} />}
            </div>
          ))}
      </div>
    </div>
  )
}

// ─── Deputy Registrar ─────────────────────────────────────────
function DeputyRegistrarView({ office, person }) {
  const { batches, loading, reload } = useBatches(office.institution_id, ['registrar_review'])
  const [acting,  setActing]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [msgType, setMsgType] = useState('error')

  async function forward(id) {
    setActing(true)
    const { error } = await supabase.rpc('rpc_forward_batch', { p_person_id: person.id, p_batch_id: id, p_note: 'Cleared by Deputy Registrar (Academics)' })
    setActing(false)
    if (error) { setMsgType('error'); setMsg(error.message) } else reload()
  }

  return (
    <div>
      <Monolith eyebrow="Acadex · Deputy Registrar" title="DR (Academics) Review"
        description="Pre-board authority review before QA and Academic Board."
        stats={[{ label:'Awaiting', value: batches.length }]} />
      <div className="mt-6">
        <MsgBox msg={msg} type={msgType} />
        <PageHeader title="Awaiting DR Review" />
        {loading ? <Spinner /> : batches.length === 0
          ? <EmptyState title="Nothing at this stage" />
          : batches.map(b => (
            <BatchCard key={b.id} batch={b} actions={
              <button onClick={() => forward(b.id)} disabled={acting}
                className={acting ? 'btn-disabled px-3 py-1.5 text-xs' : 'btn-primary px-3 py-1.5 text-xs'}>
                Forward to QA →
              </button>
            } />
          ))}
      </div>
    </div>
  )
}

// ─── QA Monitor ──────────────────────────────────────────────
function QAMonitorView({ office, person }) {
  const { batches, loading, reload } = useBatches(office.institution_id)
  const pipeline = batches.filter(b => !['draft','published'].includes(b.current_stage))
  const [flagging,    setFlagging]    = useState(null)
  const [flagReason,  setFlagReason]  = useState('')
  const [forceReturn, setForceReturn] = useState(false)
  const [acting,      setActing]      = useState(false)
  const [msg,         setMsg]         = useState('')
  const [msgType,     setMsgType]     = useState('error')

  async function flag(id) {
    if (!flagReason.trim()) { setMsg('Flag reason required.'); return }
    setActing(true)
    const { error } = await supabase.rpc('rpc_qa_flag_batch', {
      p_person_id: person.id, p_batch_id: id, p_reason: flagReason, p_force_return: forceReturn
    })
    setActing(false)
    if (error) { setMsgType('error'); setMsg(error.message) }
    else { setFlagging(null); setFlagReason(''); setForceReturn(false); reload() }
  }

  async function clearQA(id) {
    setActing(true)
    const { error } = await supabase.rpc('rpc_forward_batch', { p_person_id: person.id, p_batch_id: id, p_note: 'QA cleared — forwarded to Academic Board' })
    setActing(false)
    if (error) { setMsgType('error'); setMsg(error.message) } else reload()
  }

  return (
    <div>
      <Monolith eyebrow="Acadex · QA" title="Pipeline Monitor"
        description="QA has parallel interrupt authority at every stage. Flag or clear any active batch."
        stats={[
          { label:'In Pipeline', value: pipeline.length },
          { label:'QA Flagged',  value: pipeline.filter(b=>b.qa_flagged).length, color:'text-red-400' },
        ]} />
      <Notice type="danger" icon="policy" title="Parallel Interrupt Authority" className="mt-4">
        QA can flag or force-return any batch regardless of current stage. All QA actions are immutably logged.
      </Notice>
      <div className="mt-6">
        <MsgBox msg={msg} type={msgType} />
        <PageHeader title="Active Pipeline" />
        {loading ? <Spinner /> : pipeline.length === 0
          ? <EmptyState title="No active batches" />
          : pipeline.map(b => (
            <div key={b.id}>
              <BatchCard batch={b} actions={
                <div className="flex gap-1.5">
                  {b.current_stage === 'qa_review' && (
                    <button onClick={() => clearQA(b.id)} disabled={acting}
                      className={acting ? 'btn-disabled px-3 py-1.5 text-xs' : 'btn-success px-3 py-1.5 text-xs'}>
                      QA Clear →
                    </button>
                  )}
                  {!b.qa_flagged && (
                    <button onClick={() => setFlagging(flagging===b.id?null:b.id)} className="btn-danger px-3 py-1.5 text-xs">Flag</button>
                  )}
                </div>
              } />
              {flagging===b.id && (
                <Card className="mb-2 border-orange-300">
                  <div className="p-4 space-y-3">
                    <Notice type="warning" icon="warning" title="QA Flag — Immutable Event">
                      This flag blocks the batch and is permanently logged to the audit trail.
                    </Notice>
                    <div className="field">
                      <label className="label">QA Finding <span className="text-red-500">*</span></label>
                      <textarea value={flagReason} onChange={e => setFlagReason(e.target.value)} rows={3}
                        className="input resize-none" placeholder="Document the specific finding..." />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-body-sm">
                      <input type="checkbox" checked={forceReturn} onChange={e => setForceReturn(e.target.checked)} />
                      Force-return to dept_submitted
                    </label>
                    <ButtonRow>
                      <button onClick={() => { setFlagging(null); setFlagReason('') }} className="btn-secondary px-4 py-2 text-xs">Cancel</button>
                      <button onClick={() => flag(b.id)} disabled={acting}
                        className={acting ? 'btn-disabled px-4 py-2 text-xs' : 'btn-danger px-4 py-2 text-xs'}>
                        {acting ? 'Flagging...' : 'Record Flag'}
                      </button>
                    </ButtonRow>
                  </div>
                </Card>
              )}
            </div>
          ))}
      </div>
    </div>
  )
}

// ─── QA Flagged View ─────────────────────────────────────────
function QAFlaggedView({ office, person }) {
  const { batches, loading, reload } = useBatches(office.institution_id)
  const flagged = batches.filter(b => b.qa_flagged)
  const [acting,  setActing]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [msgType, setMsgType] = useState('error')

  async function clear(id) {
    setActing(true)
    const { error } = await supabase.rpc('rpc_qa_clear_batch', { p_person_id: person.id, p_batch_id: id })
    setActing(false)
    if (error) { setMsgType('error'); setMsg(error.message) } else reload()
  }

  return (
    <div>
      <Monolith eyebrow="Acadex · QA" title="Flagged Batches"
        description="Batches blocked by QA. Must be cleared or force-returned before the pipeline resumes."
        stats={[{ label:'Flagged', value: flagged.length, color:'text-red-400' }]} />
      <div className="mt-6">
        <MsgBox msg={msg} type={msgType} />
        {loading ? <Spinner /> : flagged.length === 0
          ? <EmptyState title="No flagged batches" subtitle="All clear." icon="✓" />
          : flagged.map(b => (
            <BatchCard key={b.id} batch={b} actions={
              <button onClick={() => clear(b.id)} disabled={acting}
                className={acting ? 'btn-disabled px-3 py-1.5 text-xs' : 'btn-success px-3 py-1.5 text-xs'}>
                Clear Flag
              </button>
            } />
          ))}
      </div>
    </div>
  )
}

// ─── Registrar: Publication ───────────────────────────────────
function RegistrarPublish({ office, person }) {
  const { batches, loading, reload } = useBatches(office.institution_id, ['registrar_final'])
  const [confirm,    setConfirm]    = useState(null)
  const [publishing, setPublishing] = useState(false)
  const [msg,        setMsg]        = useState('')
  const [msgType,    setMsgType]    = useState('error')

  async function publish(id) {
    setPublishing(true)
    const { error } = await supabase.rpc('rpc_publish_batch', { p_person_id: person.id, p_batch_id: id })
    setPublishing(false)
    if (error) { setMsgType('error'); setMsg(error.message) }
    else {
      setMsgType('success'); setMsg('Results published.'); setConfirm(null); reload()
      // Belt-and-suspenders: DB trigger handles email per student,
      // this hits push directly for any student with registered tokens
      triggerPush({ personId: person.id, title: 'Results Published', body: 'New results are available in your Student Portal.', url: '/student' })
        .catch(() => {})
    }
  }

  return (
    <div>
      <Monolith eyebrow="Acadex · Registrar" title="Publication"
        description="Final stage. Publishing makes results visible to students. Irreversible."
        stats={[{ label:'Ready to Publish', value: batches.length, color:'text-green-400' }]} />
      <Notice type="neutral" icon="publish" title="Final Irreversible Action" className="mt-4">
        Once published, results are immediately visible to all registered students. This cannot be undone without a formal board appeal.
      </Notice>
      <div className="mt-6">
        <MsgBox msg={msg} type={msgType} />
        <PageHeader title="Ready for Publication" />
        {loading ? <Spinner /> : batches.length === 0
          ? <EmptyState title="Nothing ready for publication" subtitle="Batches appear here after Academic Board approval." />
          : batches.map(b => (
            <BatchCard key={b.id} batch={b} actions={
              <button onClick={() => setConfirm(b)} className="btn-success px-3 py-1.5 text-xs">Publish →</button>
            } />
          ))}
        {confirm && (
          <ConfirmDialog
            title="Publish Results"
            message={`Publish results for ${confirm.departments?.name} (${semLabel(confirm.semesters)})? Students will immediately see their grades. This cannot be undone.`}
            confirmLabel="Publish Results"
            onConfirm={() => publish(confirm.id)}
            onCancel={() => setConfirm(null)}
          />
        )}
      </div>
    </div>
  )
}

// ─── All Batches Overview ─────────────────────────────────────
function AllBatchesView({ office }) {
  const { batches, loading } = useBatches(office.institution_id)
  return (
    <div>
      <Monolith eyebrow="Acadex · Pipeline" title="Result Batches"
        description="All batches across the institution."
        stats={[
          { label:'Total',     value: batches.length },
          { label:'Published', value: batches.filter(b=>b.current_stage==='published').length, color:'text-green-400' },
          { label:'Active',    value: batches.filter(b=>!['draft','published'].includes(b.current_stage)).length, color:'text-amber-400' },
        ]} />
      <div className="mt-6">
        <PageHeader title="All Batches" />
        {loading ? <Spinner /> : batches.length === 0
          ? <EmptyState title="No batches yet" subtitle="Batches are created when HODs initiate results for a semester." />
          : batches.map(b => <BatchCard key={b.id} batch={b} />)}
      </div>
    </div>
  )
}

// ─── Audit ───────────────────────────────────────────────────
function AcadexAudit({ office }) {
  const [logs,    setLogs]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('audit_log')
      .select('id, action, authority_source, created_at, offices(name), persons(first_name,last_name)')
      .eq('institution_id', office.institution_id)
      .like('action', 'result.%')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => { setLogs(data||[]); setLoading(false) })
  }, [])

  return (
    <div>
      <Monolith eyebrow="Acadex · Audit" title="Results Audit Trail"
        description="Every result action — immutable and permanent."
        stats={[{ label:'Entries', value: logs.length }]} />
      <div className="mt-6">
        {loading ? <Spinner /> : logs.length === 0
          ? <EmptyState title="No audit entries yet" />
          : <Card>
              <table className="data-table">
                <thead><tr><th>Time</th><th>Action</th><th>Person</th><th>Office</th><th>Authority</th></tr></thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id}>
                      <td className="text-body-sm text-on-surface-variant whitespace-nowrap">
                        {new Date(l.created_at).toLocaleString('en-NG',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
                      </td>
                      <td className="text-mono font-bold text-on-surface">{l.action}</td>
                      <td className="text-body-sm">{l.persons?.first_name} {l.persons?.last_name}</td>
                      <td className="text-body-sm text-on-surface-variant">{l.offices?.name}</td>
                      <td><AuthorityBadge source={l.authority_source} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>}
      </div>
    </div>
  )
}
