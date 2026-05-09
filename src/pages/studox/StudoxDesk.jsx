import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { useFileUpload } from '../../hooks/useFileUpload'
import {
  Spinner, Monolith, Notice, MsgBox, EmptyState,
  Modal, ConfirmDialog, ButtonRow,
  TopBar, AppShell, SidebarHeader, SidebarSection, NavItem, AuthorityTag
} from '../../components/ui'

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
  return fmt(d)
}

export default function StudoxDesk() {
  const { person } = useAuth()
  const navigate   = useNavigate()
  const [office,     setOffice]    = useState(null)
  const [loading,    setLoading]   = useState(true)
  // Offering selection
  const [semesters,  setSemesters] = useState([])
  const [semId,      setSemId]     = useState('')
  const [offerings,  setOfferings] = useState([])
  const [selOff,     setSelOff]    = useState(null)
  const [offLoading, setOffLoading]= useState(false)
  // inner tab
  const [tab,        setTab]       = useState('materials')

  useEffect(() => { loadOffice() }, [person])

  async function loadOffice() {
    if (!person) return
    setLoading(true)
    const { data } = await supabase.rpc('rpc_get_my_offices', { p_person_id: person.id })
    setOffice((data||[])[0] || null)
    setLoading(false)
  }

  const institutionId = office?.institution_id

  useEffect(() => {
    if (!institutionId) return
    supabase.rpc('rpc_get_semesters', { p_institution_id: institutionId }).then(({ data }) => {
      setSemesters(data || [])
      const cur = (data||[]).find(s => s.is_current)
      setSemId(cur?.id || data?.[0]?.id || '')
    })
  }, [institutionId])

  useEffect(() => {
    if (!institutionId || !person || !semId) return
    loadOfferings()
  }, [institutionId, semId])

  async function loadOfferings() {
    setOffLoading(true)
    const { data } = await supabase.rpc('rpc_get_desk_offerings', {
      p_institution_id: institutionId,
      p_person_id:      person.id,
      p_semester_id:    semId || null,
    })
    setOfferings(data || [])
    setOffLoading(false)
  }

  const topbar = (
    <TopBar appName="Studox OS" section="Course Desk"
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
        <p className="text-headline-md font-bold mb-2">No office found</p>
        <p className="text-body-sm text-on-surface-variant">You need an office assignment to access Course Desk.</p>
        <button onClick={() => navigate('/')} className="btn-secondary mt-6">← Back</button>
      </div>
    </AppShell>
  )

  // If offering selected → show course workspace
  if (selOff) {
    return (
      <AppShell header={topbar}>
        <CourseWorkspace
          offering={selOff}
          institutionId={institutionId}
          person={person}
          tab={tab}
          setTab={setTab}
          onBack={() => { setSelOff(null); loadOfferings() }}
        />
      </AppShell>
    )
  }

  // Offering picker
  return (
    <AppShell header={topbar}>
      <Monolith
        eyebrow="Course Desk"
        title="My Courses"
        description="Materials, assignments, and discussions for your courses"
      />

      <div className="mt-6 mb-4">
        <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Semester</label>
        <select className="input max-w-xs" value={semId} onChange={e => setSemId(e.target.value)}>
          {semesters.map(s => (
            <option key={s.id} value={s.id}>{s.label}{s.is_current ? ' ★' : ''}</option>
          ))}
        </select>
      </div>

      {offLoading ? <Spinner /> : offerings.length === 0
        ? <EmptyState title="No courses" subtitle="You have no courses this semester as lecturer or registered student" />
        : (
          <div className="space-y-2">
            {offerings.map(o => (
              <div key={o.id} onClick={() => { setSelOff(o); setTab('materials') }}
                className="card p-4 flex items-center gap-4 cursor-pointer hover:border-primary-container transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="text-body-md font-bold text-on-surface">{o.course_code} — {o.course_name}</p>
                    <span className={`text-label-sm uppercase px-2 py-0.5 font-bold ${
                      o.is_lecturer ? 'bg-primary-container text-white' : 'bg-secondary-container text-on-secondary-container'
                    }`}>{o.is_lecturer ? 'Lecturer' : 'Student'}</span>
                  </div>
                  <p className="text-body-sm text-slate-500">
                    {o.dept_name} · Level {o.course_level} · {o.sem_label}
                    {!o.is_lecturer && o.lecturer_name ? ` · ${o.lecturer_name}` : ''}
                  </p>
                </div>
                <div className="flex gap-4 text-right shrink-0 text-body-sm text-slate-400">
                  <span>{o.material_count} material{o.material_count !== 1 ? 's' : ''}</span>
                  <span>{o.assignment_count} assignment{o.assignment_count !== 1 ? 's' : ''}</span>
                  <span>{o.thread_count} thread{o.thread_count !== 1 ? 's' : ''}</span>
                </div>
                <span className="material-symbols-outlined text-slate-400">chevron_right</span>
              </div>
            ))}
          </div>
        )}
    </AppShell>
  )
}

// ─── Course Workspace ─────────────────────────────────────────
function CourseWorkspace({ offering, institutionId, person, tab, setTab, onBack }) {
  const TABS = [
    { id:'materials',   label:'Materials',   icon:'folder_open' },
    { id:'assignments', label:'Assignments', icon:'assignment' },
    { id:'discussions', label:'Discussions', icon:'forum' },
  ]

  return (
    <div>
      {/* Back + header */}
      <button onClick={onBack}
        className="text-label-sm uppercase tracking-widest text-slate-400 hover:text-slate-700 mb-6 flex items-center gap-1">
        <span className="material-symbols-outlined text-base">arrow_back</span> My Courses
      </button>

      <Monolith
        eyebrow={offering.is_lecturer ? 'Lecturer View' : 'Student View'}
        title={`${offering.course_code} — ${offering.course_name}`}
        description={`${offering.dept_name} · Level ${offering.course_level} · ${offering.sem_label}`}
        stats={[
          { label: 'Students',    value: offering.student_count,   color: 'text-blue-400' },
          { label: 'Materials',   value: offering.material_count,  color: 'text-green-400' },
          { label: 'Assignments', value: offering.assignment_count, color: 'text-amber-400' },
          { label: 'Threads',     value: offering.thread_count,    color: 'text-purple-400' },
        ]}
      />

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-slate-200 mt-6 mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-label-sm uppercase tracking-widest border-b-2 transition-colors
              ${tab === t.id
                ? 'border-primary-container text-on-surface font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            <span className="material-symbols-outlined text-base">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'materials'   && <MaterialsTab   offering={offering} institutionId={institutionId} person={person} />}
      {tab === 'assignments' && <AssignmentsTab offering={offering} institutionId={institutionId} person={person} />}
      {tab === 'discussions' && <DiscussionsTab offering={offering} institutionId={institutionId} person={person} />}
    </div>
  )
}

// ─── Materials Tab ────────────────────────────────────────────
function MaterialsTab({ offering, institutionId, person }) {
  const [materials,  setMaterials]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [title,      setTitle]      = useState('')
  const [uploadMode, setUploadMode] = useState('link') // 'link' | 'file'
  const [url,        setUrl]        = useState('')
  const [week,       setWeek]       = useState('')
  const [file,       setFile]       = useState(null)
  const [msg,        setMsg]        = useState('')
  const [confirmDel, setConfirmDel] = useState(null)
  const { upload, uploading, progress, error: uploadError, setError: setUploadError } = useFileUpload()

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.rpc('rpc_get_materials', { p_offering_id: offering.id })
    setMaterials(data || []); setLoading(false)
  }, [offering.id])

  useEffect(() => { load() }, [load])

  async function addMaterial() {
    if (!title.trim()) { setMsg('Title required.'); return }

    if (uploadMode === 'link') {
      if (!url.trim()) { setMsg('URL required.'); return }
      setMsg('')
      const { error } = await supabase.rpc('rpc_add_material', {
        p_offering_id:    offering.id,
        p_institution_id: institutionId,
        p_person_id:      person.id,
        p_title:          title.trim(),
        p_type:           'link',
        p_url:            url.trim(),
        p_week_label:     week || null,
      })
      if (error) { setMsg(error.message); return }
      setShowForm(false); setTitle(''); setUrl(''); setWeek('')
      load()
      return
    }

    // File upload mode
    if (!file) { setMsg('Select a file to upload.'); return }
    setMsg('')
    await upload({
      file,
      bucket:       'course-materials',
      pathSegments: [institutionId, offering.id],
      institutionId,
      uploadedBy:   person.id,
      onSuccess: async ({ publicUrl, storagePath }) => {
        const { error } = await supabase.rpc('rpc_add_material', {
          p_offering_id:    offering.id,
          p_institution_id: institutionId,
          p_person_id:      person.id,
          p_title:          title.trim(),
          p_type:           'file',
          p_url:            publicUrl,
          p_week_label:     week || null,
        })
        // Also update storage_path on the material row
        if (!error) {
          await supabase.from('course_materials')
            .update({ storage_path: storagePath })
            .eq('offering_id', offering.id)
            .eq('uploaded_by', person.id)
            .order('created_at', { ascending: false })
            .limit(1)
        }
        setShowForm(false); setTitle(''); setFile(null); setWeek('')
        load()
      },
    })
  }

  async function remove(id) {
    await supabase.rpc('rpc_delete_material', { p_id: id })
    setConfirmDel(null); load()
  }

  // Group by week
  const grouped = materials.reduce((acc, m) => {
    const k = m.week_label || 'General'
    if (!acc[k]) acc[k] = []
    acc[k].push(m)
    return acc
  }, {})

  if (loading) return <Spinner />

  return (
    <div>
      {offering.is_lecturer && (
        <div className="flex justify-end mb-4">
          <button className="btn-primary" onClick={() => { setShowForm(true); setMsg('') }}>+ Add Material</button>
        </div>
      )}

      {showForm && (
        <div className="card p-5 mb-6">
          <p className="text-label-md uppercase tracking-widest mb-4">New Course Material</p>
          <MsgBox msg={msg || uploadError} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Title *</label>
              <input className="input" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Lecture 3 — Sorting Algorithms" />
            </div>
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Upload Method</label>
              <select className="input" value={uploadMode} onChange={e => { setUploadMode(e.target.value); setMsg(''); setUploadError(null) }}>
                <option value="link">Paste a URL / Link</option>
                <option value="file">Upload a File</option>
              </select>
            </div>
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Week / Label</label>
              <input className="input" value={week} onChange={e => setWeek(e.target.value)}
                placeholder="e.g. Week 3" />
            </div>
            {uploadMode === 'link' ? (
              <div className="md:col-span-2">
                <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">URL *</label>
                <input className="input" value={url} onChange={e => setUrl(e.target.value)}
                  placeholder="https://…" />
              </div>
            ) : (
              <div className="md:col-span-2">
                <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">
                  File * <span className="text-slate-400 font-normal">(max 25MB · PDF, DOCX, PPTX, images, video)</span>
                </label>
                <input type="file" className="block w-full text-body-sm text-slate-500
                  file:mr-4 file:py-2 file:px-4 file:border-0 file:text-label-sm file:font-bold
                  file:uppercase file:tracking-widest file:bg-primary-container file:text-white
                  file:cursor-pointer hover:file:bg-slate-800"
                  onChange={e => setFile(e.target.files?.[0] || null)} />
                {uploading && (
                  <div className="mt-2">
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>Uploading…</span><span>{progress}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded overflow-hidden">
                      <div className="h-full bg-primary-container transition-all duration-300"
                        style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <ButtonRow>
            <button className="btn-secondary" onClick={() => { setShowForm(false); setMsg(''); setUploadError(null) }}>Cancel</button>
            <button className="btn-primary" onClick={addMaterial} disabled={uploading}>
              {uploading ? `Uploading ${progress}%…` : 'Add Material'}
            </button>
          </ButtonRow>
        </div>
      )}

      {materials.length === 0
        ? <EmptyState title="No materials yet" subtitle={offering.is_lecturer ? 'Upload links or files above' : 'Your lecturer has not uploaded materials yet'} />
        : Object.entries(grouped).map(([week, mats]) => (
          <div key={week} className="mb-6">
            <p className="text-label-sm uppercase tracking-widest text-slate-400 mb-2">{week}</p>
            <div className="space-y-2">
              {mats.map(m => (
                <div key={m.id} className="card p-3 flex items-center gap-3">
                  <span className={`material-symbols-outlined text-2xl ${m.type === 'file' ? 'text-red-400' : 'text-blue-400'}`}>
                    {m.type === 'file' ? 'description' : 'link'}
                  </span>
                  <div className="flex-1">
                    <a href={m.url} target="_blank" rel="noreferrer"
                      className="text-body-md font-medium text-blue-600 hover:underline">{m.title}</a>
                    <p className="text-body-sm text-slate-400">{m.uploader} · {timeAgo(m.created_at)}</p>
                  </div>
                  {offering.is_lecturer && (
                    <button className="text-label-sm text-red-500 hover:text-red-700 shrink-0"
                      onClick={() => setConfirmDel(m)}>✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

      {confirmDel && (
        <ConfirmDialog title="Remove Material" message={`Remove "${confirmDel.title}"?`}
          danger confirmLabel="Remove"
          onConfirm={() => remove(confirmDel.id)} onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  )
}

// ─── Assignments Tab ──────────────────────────────────────────
function AssignmentsTab({ offering, institutionId, person }) {
  const [assignments, setAssignments] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [selAssign,   setSelAssign]   = useState(null)
  const [showCreate,  setShowCreate]  = useState(false)
  const [title,       setTitle]       = useState('')
  const [desc,        setDesc]        = useState('')
  const [dueAt,       setDueAt]       = useState('')
  const [maxScore,    setMaxScore]    = useState('100')
  const [saving,      setSaving]      = useState(false)
  const [msg,         setMsg]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.rpc('rpc_get_assignments', {
      p_offering_id: offering.id,
      p_person_id:   person.id,
    })
    setAssignments(data || []); setLoading(false)
  }, [offering.id, person.id])

  useEffect(() => { load() }, [load])

  async function createAssignment() {
    if (!title.trim() || !dueAt) { setMsg('Title and due date required.'); return }
    setSaving(true); setMsg('')
    const { error } = await supabase.rpc('rpc_create_assignment', {
      p_offering_id:    offering.id,
      p_institution_id: institutionId,
      p_person_id:      person.id,
      p_title:          title.trim(),
      p_description:    desc || null,
      p_due_at:         dueAt,
      p_max_score:      parseFloat(maxScore) || 100,
    })
    setSaving(false)
    if (error) { setMsg(error.message); return }
    setShowCreate(false); setTitle(''); setDesc(''); setDueAt(''); setMaxScore('100')
    load()
  }

  if (selAssign) return (
    <AssignmentDetail
      assignment={selAssign}
      offering={offering}
      institutionId={institutionId}
      person={person}
      onBack={() => { setSelAssign(null); load() }}
    />
  )

  if (loading) return <Spinner />

  const now = new Date()

  return (
    <div>
      {offering.is_lecturer && (
        <div className="flex justify-end mb-4">
          <button className="btn-primary" onClick={() => { setShowCreate(true); setMsg('') }}>+ Create Assignment</button>
        </div>
      )}

      {showCreate && (
        <div className="card p-5 mb-6">
          <p className="text-label-md uppercase tracking-widest mb-4">New Assignment</p>
          <MsgBox msg={msg} />
          <div className="space-y-3">
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Title *</label>
              <input className="input" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Assignment 2 — Binary Trees" />
            </div>
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Instructions</label>
              <textarea className="input resize-none" rows={3} value={desc} onChange={e => setDesc(e.target.value)}
                placeholder="Describe the task, submission format, etc." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Due Date/Time *</label>
                <input type="datetime-local" className="input" value={dueAt} onChange={e => setDueAt(e.target.value)} />
              </div>
              <div>
                <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Max Score</label>
                <input type="number" className="input" value={maxScore} onChange={e => setMaxScore(e.target.value)} />
              </div>
            </div>
          </div>
          <ButtonRow>
            <button className="btn-secondary" onClick={() => { setShowCreate(false); setMsg('') }}>Cancel</button>
            <button className="btn-primary" onClick={createAssignment} disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
          </ButtonRow>
        </div>
      )}

      {assignments.length === 0
        ? <EmptyState title="No assignments" subtitle={offering.is_lecturer ? 'Create an assignment above' : 'No assignments set yet'} />
        : (
          <div className="space-y-2">
            {assignments.map(a => {
              const isDue  = new Date(a.due_at) < now
              const hasSubmitted = !!a.my_submission_id
              const isGraded = a.my_score != null

              return (
                <div key={a.id} onClick={() => setSelAssign(a)}
                  className="card p-4 cursor-pointer hover:border-primary-container transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-body-md font-bold text-on-surface mb-1">{a.title}</p>
                      <p className="text-body-sm text-slate-500">
                        Due: {fmtDT(a.due_at)} · Max: {a.max_score} pts
                        {offering.is_lecturer && ` · ${a.submission_count} submission${a.submission_count !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {isDue
                        ? <span className="text-label-sm uppercase bg-red-50 text-red-600 px-2 py-0.5 font-bold">Closed</span>
                        : <span className="text-label-sm uppercase bg-green-50 text-green-700 px-2 py-0.5 font-bold">Open</span>}
                      {!offering.is_lecturer && (
                        isGraded
                          ? <span className="text-label-sm uppercase bg-blue-50 text-blue-700 px-2 py-0.5 font-bold">Graded: {a.my_score}/{a.max_score}</span>
                          : hasSubmitted
                            ? <span className="text-label-sm uppercase bg-green-50 text-green-700 px-2 py-0.5 font-bold">Submitted{a.my_is_late ? ' (Late)' : ''}</span>
                            : <span className="text-label-sm uppercase bg-amber-50 text-amber-700 px-2 py-0.5 font-bold">Pending</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}

// ─── Assignment Detail ────────────────────────────────────────
function AssignmentDetail({ assignment, offering, institutionId, person, onBack }) {
  const [submissions,  setSubmissions]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [selSub,       setSelSub]       = useState(null)
  // Student submit form
  const [submitText,   setSubmitText]   = useState('')
  const [submitFile,   setSubmitFile]   = useState(null)
  const [subMsg,       setSubMsg]       = useState('')
  const { upload, uploading, progress, error: uploadError, setError: setUploadError } = useFileUpload()
  // Grade form
  const [gradeScore,   setGradeScore]   = useState('')
  const [gradeComment, setGradeComment] = useState('')
  const [grading,      setGrading]      = useState(false)
  const [gradeMsg,     setGradeMsg]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    if (offering.is_lecturer) {
      const { data } = await supabase.rpc('rpc_get_submissions', { p_assignment_id: assignment.id })
      setSubmissions(data || [])
    }
    setLoading(false)
  }, [assignment.id, offering.is_lecturer])

  useEffect(() => { load() }, [load])

  async function submit() {
    if (!submitText.trim() && !submitFile) { setSubMsg('Provide a text response or upload a file.'); return }
    setSubMsg(''); setUploadError(null)

    if (submitFile) {
      // Upload file first, then submit with URL
      await upload({
        file:         submitFile,
        bucket:       'submissions',
        pathSegments: [institutionId, assignment.id, person.id],
        institutionId,
        uploadedBy:   person.id,
        onSuccess: async ({ publicUrl, storagePath }) => {
          const { data, error } = await supabase.rpc('rpc_submit_assignment', {
            p_assignment_id:  assignment.id,
            p_institution_id: institutionId,
            p_student_id:     person.id,
            p_text_content:   submitText || null,
            p_file_url:       publicUrl,
          })
          // Save storage_path on the submission row
          if (!error) {
            await supabase.from('assignment_submissions')
              .update({ storage_path: storagePath })
              .eq('assignment_id', assignment.id)
              .eq('student_id', person.id)
          }
          if (error) { setSubMsg(error.message); return }
          setSubMsg(data?.is_late ? '⚠ Submitted (late).' : '✓ Submitted.')
          onBack()
        },
      })
    } else {
      // Text-only submission
      const { data, error } = await supabase.rpc('rpc_submit_assignment', {
        p_assignment_id:  assignment.id,
        p_institution_id: institutionId,
        p_student_id:     person.id,
        p_text_content:   submitText,
        p_file_url:       null,
      })
      if (error) { setSubMsg(error.message); return }
      setSubMsg(data?.is_late ? '⚠ Submitted (late).' : '✓ Submitted.')
      onBack()
    }
  }

  async function grade() {
    if (!gradeScore) { setGradeMsg('Score required.'); return }
    setGrading(true); setGradeMsg('')
    const { error } = await supabase.rpc('rpc_grade_submission', {
      p_submission_id: selSub.id,
      p_grader_id:     person.id,
      p_score:         parseFloat(gradeScore),
      p_comment:       gradeComment || null,
    })
    setGrading(false)
    if (error) { setGradeMsg(error.message); return }
    setSelSub(null); setGradeScore(''); setGradeComment(''); load()
  }

  const now = new Date()
  const isDue = new Date(assignment.due_at) < now

  return (
    <div>
      <button onClick={onBack}
        className="text-label-sm uppercase tracking-widest text-slate-400 hover:text-slate-700 mb-6 flex items-center gap-1">
        <span className="material-symbols-outlined text-base">arrow_back</span> Assignments
      </button>

      <div className="card p-5 mb-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-headline-md font-bold text-on-surface">{assignment.title}</h2>
          <span className={`text-label-sm uppercase px-2 py-0.5 font-bold shrink-0 ${isDue ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
            {isDue ? 'Closed' : 'Open'}
          </span>
        </div>
        <p className="text-body-sm text-slate-500 mb-3">
          Due: {fmtDT(assignment.due_at)} · Max score: {assignment.max_score} pts
        </p>
        {assignment.description && (
          <p className="text-body-md text-on-surface whitespace-pre-wrap">{assignment.description}</p>
        )}
      </div>

      {/* Student: submit or view own submission */}
      {!offering.is_lecturer && (
        <div className="card p-5 mb-6">
          <p className="text-label-md uppercase tracking-widest mb-3">
            {assignment.my_submission_id ? 'Your Submission' : 'Submit Assignment'}
          </p>

          {assignment.my_submission_id ? (
            <div>
              <p className="text-body-sm text-slate-500 mb-1">Submitted {fmtDT(assignment.my_submitted_at)}{assignment.my_is_late ? ' (Late)' : ''}</p>
              {assignment.my_score != null ? (
                <div className="mt-3 bg-blue-50 border border-blue-200 p-3">
                  <p className="text-label-sm uppercase tracking-widest text-blue-600 mb-1">Grade</p>
                  <p className="text-2xl font-black text-blue-800">{assignment.my_score} / {assignment.max_score}</p>
                  {assignment.my_grade_comment && (
                    <p className="text-body-sm text-blue-700 mt-2">{assignment.my_grade_comment}</p>
                  )}
                </div>
              ) : (
                <p className="text-body-sm text-slate-400 mt-2">Not yet graded.</p>
              )}
            </div>
          ) : (
            <div>
              <MsgBox msg={subMsg || uploadError} />
              {isDue ? (
                <Notice type="warning" icon="schedule" title="Deadline passed">Submission window is closed.</Notice>
              ) : (
                <>
                  <div className="space-y-3">
                    <div>
                      <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">
                        Answer / Response <span className="text-slate-400 font-normal">(optional if uploading file)</span>
                      </label>
                      <textarea className="input resize-none" rows={4} value={submitText}
                        onChange={e => setSubmitText(e.target.value)}
                        placeholder="Type your answer here…" />
                    </div>
                    <div>
                      <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">
                        File Upload <span className="text-slate-400 font-normal">(optional · max 25MB · PDF, DOCX, images)</span>
                      </label>
                      <input type="file" className="block w-full text-body-sm text-slate-500
                        file:mr-4 file:py-2 file:px-4 file:border-0 file:text-label-sm file:font-bold
                        file:uppercase file:tracking-widest file:bg-primary-container file:text-white
                        file:cursor-pointer hover:file:bg-slate-800"
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt,.zip"
                        onChange={e => { setSubmitFile(e.target.files?.[0] || null); setUploadError(null) }} />
                      {submitFile && (
                        <p className="text-body-sm text-slate-400 mt-1">
                          {submitFile.name} ({(submitFile.size / 1024 / 1024).toFixed(1)}MB)
                        </p>
                      )}
                      {uploading && (
                        <div className="mt-2">
                          <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                            <span>Uploading…</span><span>{progress}%</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded overflow-hidden">
                            <div className="h-full bg-primary-container transition-all duration-300"
                              style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <button className="btn-primary mt-4 w-full" onClick={submit} disabled={uploading}>
                    {uploading ? `Uploading ${progress}%…` : 'Submit Assignment'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Lecturer: submissions list */}
      {offering.is_lecturer && (
        <div>
          <p className="text-label-md uppercase tracking-widest text-slate-400 mb-3">
            Submissions — {submissions.length}
          </p>
          {loading ? <Spinner /> : submissions.length === 0
            ? <EmptyState title="No submissions yet" />
            : (
              <div className="card overflow-hidden">
                <table className="data-table">
                  <thead>
                    <tr><th>Student</th><th>Matric</th><th>Submitted</th><th>Late</th><th>Score</th><th></th></tr>
                  </thead>
                  <tbody>
                    {submissions.map(s => (
                      <tr key={s.id}>
                        <td className="font-medium">{s.student_name}</td>
                        <td className="text-slate-400 font-mono text-xs">{s.matric_number || '—'}</td>
                        <td className="text-slate-500">{fmtDT(s.submitted_at)}</td>
                        <td>{s.is_late
                          ? <span className="text-label-sm text-red-600 bg-red-50 px-1">Late</span>
                          : <span className="text-label-sm text-green-700">On time</span>}
                        </td>
                        <td className="font-bold">
                          {s.score != null ? `${s.score}/${assignment.max_score}` : <span className="text-slate-300">—</span>}
                        </td>
                        <td>
                          <button className="text-label-sm text-blue-500 hover:text-blue-700"
                            onClick={() => { setSelSub(s); setGradeScore(s.score ?? ''); setGradeComment(s.grade_comment || ''); setGradeMsg('') }}>
                            {s.score != null ? 'Re-grade' : 'Grade'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {/* Grade Modal */}
      {selSub && (
        <Modal title="Grade Submission" subtitle={selSub.student_name} onClose={() => setSelSub(null)}>
          <MsgBox msg={gradeMsg} />
          {selSub.text_content && (
            <div className="bg-slate-50 border border-slate-200 p-3 mb-4 max-h-40 overflow-y-auto">
              <p className="text-label-sm uppercase tracking-widest text-slate-400 mb-1">Response</p>
              <p className="text-body-sm text-on-surface whitespace-pre-wrap">{selSub.text_content}</p>
            </div>
          )}
          {selSub.file_url && (
            <a href={selSub.file_url} target="_blank" rel="noreferrer"
              className="text-blue-500 text-body-sm underline block mb-4">
              View submitted file ↗
            </a>
          )}
          <div className="space-y-3">
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">
                Score * (max {assignment.max_score})
              </label>
              <input type="number" className="input" value={gradeScore} onChange={e => setGradeScore(e.target.value)}
                min={0} max={assignment.max_score} />
            </div>
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Comment</label>
              <textarea className="input resize-none" rows={2} value={gradeComment} onChange={e => setGradeComment(e.target.value)}
                placeholder="Feedback for the student…" />
            </div>
          </div>
          <ButtonRow>
            <button className="btn-secondary" onClick={() => setSelSub(null)}>Cancel</button>
            <button className="btn-primary" onClick={grade} disabled={grading}>{grading ? 'Grading…' : 'Save Grade'}</button>
          </ButtonRow>
        </Modal>
      )}
    </div>
  )
}

// ─── Discussions Tab ──────────────────────────────────────────
function DiscussionsTab({ offering, institutionId, person }) {
  const [threads,    setThreads]   = useState([])
  const [loading,    setLoading]   = useState(true)
  const [selThread,  setSelThread] = useState(null)
  const [showCreate, setShowCreate]= useState(false)
  const [newTitle,   setNewTitle]  = useState('')
  const [creating,   setCreating]  = useState(false)
  const [msg,        setMsg]       = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.rpc('rpc_get_threads', { p_offering_id: offering.id })
    setThreads(data || []); setLoading(false)
  }, [offering.id])

  useEffect(() => { load() }, [load])

  async function createThread() {
    if (!newTitle.trim()) { setMsg('Title required.'); return }
    setCreating(true); setMsg('')
    const { data: threadId, error } = await supabase.rpc('rpc_create_thread', {
      p_offering_id:    offering.id,
      p_institution_id: institutionId,
      p_person_id:      person.id,
      p_title:          newTitle.trim(),
    })
    setCreating(false)
    if (error) { setMsg(error.message); return }
    setShowCreate(false); setNewTitle(''); load()
  }

  async function togglePin(id) {
    await supabase.rpc('rpc_toggle_thread_pin', { p_thread_id: id }); load()
  }
  async function toggleLock(id) {
    await supabase.rpc('rpc_toggle_thread_lock', { p_thread_id: id }); load()
  }

  if (selThread) return (
    <ThreadDetail
      thread={selThread}
      offering={offering}
      institutionId={institutionId}
      person={person}
      onBack={() => { setSelThread(null); load() }}
      onTogglePin={togglePin}
      onToggleLock={toggleLock}
    />
  )

  if (loading) return <Spinner />

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button className="btn-primary" onClick={() => { setShowCreate(true); setMsg('') }}>+ New Thread</button>
      </div>

      {showCreate && (
        <div className="card p-4 mb-4">
          <MsgBox msg={msg} />
          <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Thread Title *</label>
          <input className="input mb-3" value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="e.g. Question about Assignment 2" />
          <ButtonRow>
            <button className="btn-secondary" onClick={() => { setShowCreate(false); setMsg('') }}>Cancel</button>
            <button className="btn-primary" onClick={createThread} disabled={creating}>{creating ? 'Creating…' : 'Create Thread'}</button>
          </ButtonRow>
        </div>
      )}

      {threads.length === 0
        ? <EmptyState title="No discussions" subtitle="Start a thread to discuss course topics" />
        : (
          <div className="space-y-2">
            {threads.map(t => (
              <div key={t.id} onClick={() => setSelThread(t)}
                className="card p-4 flex items-start gap-3 cursor-pointer hover:border-primary-container transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {t.is_pinned && <span className="material-symbols-outlined text-amber-500 text-base">push_pin</span>}
                    {t.is_locked && <span className="material-symbols-outlined text-slate-400 text-base">lock</span>}
                    <p className="text-body-md font-bold text-on-surface">{t.title}</p>
                  </div>
                  <p className="text-body-sm text-slate-500">
                    {t.created_by_name} · {t.post_count} post{t.post_count !== 1 ? 's' : ''}
                    {t.last_post_at ? ` · Last: ${timeAgo(t.last_post_at)}` : ` · ${timeAgo(t.created_at)}`}
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

// ─── Thread Detail ────────────────────────────────────────────
function ThreadDetail({ thread, offering, institutionId, person, onBack, onTogglePin, onToggleLock }) {
  const [posts,   setPosts]   = useState([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [posting, setPosting] = useState(false)
  const [msg,     setMsg]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.rpc('rpc_get_posts', { p_thread_id: thread.id })
    setPosts(data || []); setLoading(false)
  }, [thread.id])

  useEffect(() => { load() }, [load])

  async function post() {
    if (!content.trim()) return
    setPosting(true); setMsg('')
    const { error } = await supabase.rpc('rpc_post_reply', {
      p_thread_id:      thread.id,
      p_institution_id: institutionId,
      p_person_id:      person.id,
      p_content:        content.trim(),
    })
    setPosting(false)
    if (error) { setMsg(error.message); return }
    setContent(''); load()
  }

  return (
    <div>
      <button onClick={onBack}
        className="text-label-sm uppercase tracking-widest text-slate-400 hover:text-slate-700 mb-6 flex items-center gap-1">
        <span className="material-symbols-outlined text-base">arrow_back</span> Discussions
      </button>

      <div className="card p-4 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {thread.is_pinned && <span className="material-symbols-outlined text-amber-500 text-base">push_pin</span>}
              {thread.is_locked && <span className="material-symbols-outlined text-slate-400 text-base">lock</span>}
              <h2 className="text-headline-md font-bold text-on-surface">{thread.title}</h2>
            </div>
            <p className="text-body-sm text-slate-400">{thread.created_by_name} · {timeAgo(thread.created_at)}</p>
          </div>
          {offering.is_lecturer && (
            <div className="flex gap-2 shrink-0">
              <button className="text-label-sm text-slate-500 hover:text-slate-800" onClick={() => onTogglePin(thread.id)}>
                {thread.is_pinned ? 'Unpin' : 'Pin'}
              </button>
              <button className="text-label-sm text-slate-500 hover:text-slate-800" onClick={() => onToggleLock(thread.id)}>
                {thread.is_locked ? 'Unlock' : 'Lock'}
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="space-y-3 mb-6">
          {posts.length === 0
            ? <EmptyState title="No replies yet" subtitle="Be the first to reply below" />
            : posts.map((p, idx) => (
              <div key={p.id} className={`flex gap-3 ${p.author_id === person.id ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0
                  ${p.author_id === offering.lecturer_id ? 'bg-primary-container' : 'bg-secondary-container text-on-secondary-container'}`}>
                  {p.author_name?.charAt(0)}
                </div>
                <div className={`flex-1 max-w-xl ${p.author_id === person.id ? 'items-end' : 'items-start'} flex flex-col`}>
                  <div className={`px-3 py-2 rounded-sm text-body-sm
                    ${p.author_id === person.id ? 'bg-primary-container text-white' : 'bg-slate-100 text-on-surface'}`}>
                    <p className="font-bold text-xs mb-1 opacity-70">{p.author_name}</p>
                    <p className="whitespace-pre-wrap">{p.content}</p>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(p.created_at)}</p>
                </div>
              </div>
            ))}
        </div>
      )}

      {thread.is_locked ? (
        <Notice type="info" icon="lock" title="Thread locked">No new replies can be added.</Notice>
      ) : (
        <div className="card p-4">
          <MsgBox msg={msg} />
          <textarea className="input resize-none mb-3" rows={3} value={content} onChange={e => setContent(e.target.value)}
            placeholder="Write a reply…" />
          <button className="btn-primary w-full" onClick={post} disabled={posting || !content.trim()}>
            {posting ? 'Posting…' : 'Post Reply'}
          </button>
        </div>
      )}
    </div>
  )
}
