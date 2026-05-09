import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Spinner, Monolith, Notice, MsgBox, EmptyState,
  Modal, ConfirmDialog, ButtonRow,
  TopBar, AppShell, SidebarHeader, SidebarSection, NavItem, AuthorityTag
} from '../../components/ui'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const TIMES = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00']
const EVENT_TYPES = ['exam','registration','holiday','event','deadline']
const ROOM_TYPES  = ['classroom','lab','hall','office']

const EVENT_COLOR = {
  exam:         'bg-red-50 border-red-300 text-red-700',
  registration: 'bg-blue-50 border-blue-300 text-blue-700',
  holiday:      'bg-green-50 border-green-300 text-green-700',
  event:        'bg-purple-50 border-purple-300 text-purple-700',
  deadline:     'bg-amber-50 border-amber-300 text-amber-700',
}

function fmt(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
}

// ─── Grid cell colour by dept (cycling) ──────────────────────
const DEPT_COLORS = [
  'bg-blue-50 border-blue-200 text-blue-900',
  'bg-purple-50 border-purple-200 text-purple-900',
  'bg-green-50 border-green-200 text-green-900',
  'bg-amber-50 border-amber-200 text-amber-900',
  'bg-red-50 border-red-200 text-red-900',
  'bg-indigo-50 border-indigo-200 text-indigo-900',
]
const deptColorMap = {}
let deptColorIdx = 0
function deptColor(deptId) {
  if (!deptColorMap[deptId]) {
    deptColorMap[deptId] = DEPT_COLORS[deptColorIdx % DEPT_COLORS.length]
    deptColorIdx++
  }
  return deptColorMap[deptId]
}

export default function Schedox() {
  const { person } = useAuth()
  const navigate   = useNavigate()
  const [office,   setOffice]  = useState(null)
  const [view,     setView]    = useState('timetable')
  const [loading,  setLoading] = useState(true)

  useEffect(() => { loadOffice() }, [person])

  async function loadOffice() {
    if (!person) return
    setLoading(true)
    const { data } = await supabase.rpc('rpc_get_my_offices', { p_person_id: person.id })
    setOffice((data||[])[0] || null)
    setLoading(false)
  }

  const institutionId = office?.institution_id

  const sidebar = office ? (
    <>
      <SidebarHeader module="Schedox" role={office.office_name} />
      <SidebarSection label="Schedule">
        <NavItem icon="calendar_view_week" label="Timetable"  active={view==='timetable'} onClick={() => setView('timetable')} />
        <NavItem icon="meeting_room"       label="Rooms"      active={view==='rooms'}     onClick={() => setView('rooms')} />
        <NavItem icon="event"              label="Calendar"   active={view==='calendar'}  onClick={() => setView('calendar')} />
      </SidebarSection>
      <AuthorityTag officeName={office.office_name} source={office.authority_source} />
    </>
  ) : null

  const topbar = (
    <TopBar appName="Studox OS" section="Schedox"
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
        <p className="text-body-sm text-on-surface-variant">You need an office assignment to access Schedox.</p>
        <button onClick={() => navigate('/')} className="btn-secondary mt-6">← Back</button>
      </div>
    </AppShell>
  )

  return (
    <AppShell header={topbar} sidebar={sidebar}>
      {view === 'timetable' && <TimetableView institutionId={institutionId} person={person} />}
      {view === 'rooms'     && <RoomsView     institutionId={institutionId} />}
      {view === 'calendar'  && <CalendarView  institutionId={institutionId} person={person} />}
    </AppShell>
  )
}

// ─── Timetable View ──────────────────────────────────────────
function TimetableView({ institutionId, person }) {
  const [semesters,   setSemesters]   = useState([])
  const [semId,       setSemId]       = useState('')
  const [departments, setDepartments] = useState([])
  const [deptId,      setDeptId]      = useState('')
  const [slots,       setSlots]       = useState([])
  const [offerings,   setOfferings]   = useState([])
  const [rooms,       setRooms]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showAdd,     setShowAdd]     = useState(false)
  const [clashes,     setClashes]     = useState([])
  const [confirmDel,  setConfirmDel]  = useState(null)
  const [msg,         setMsg]         = useState('')

  // Add form
  const [selOffering, setSelOffering] = useState('')
  const [selDay,      setSelDay]      = useState('Monday')
  const [selStart,    setSelStart]    = useState('08:00')
  const [selEnd,      setSelEnd]      = useState('10:00')
  const [selRoom,     setSelRoom]     = useState('')
  const [adding,      setAdding]      = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: sems }, { data: depts }] = await Promise.all([
      supabase.rpc('rpc_get_semesters', { p_institution_id: institutionId }),
      supabase.from('departments').select('id,name').eq('institution_id', institutionId).eq('is_active', true).order('name'),
    ])
    setSemesters(sems || [])
    setDepartments(depts || [])
    const cur = (sems || []).find(s => s.is_current)
    const first = (sems || [])[0]
    const chosen = cur?.id || first?.id || ''
    setSemId(chosen)
    setLoading(false)
  }, [institutionId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!semId) return
    loadSlots()
    loadOfferings()
    supabase.rpc('rpc_get_rooms', { p_institution_id: institutionId }).then(({ data }) => setRooms(data || []))
  }, [semId, deptId])

  async function loadSlots() {
    const { data } = await supabase.rpc('rpc_get_timetable', {
      p_institution_id: institutionId,
      p_semester_id:    semId,
      p_department_id:  deptId || null,
    })
    setSlots(data || [])
  }

  async function loadOfferings() {
    const { data } = await supabase
      .from('course_offerings')
      .select(`id, courses(code,name,level,departments(name)), persons(first_name,last_name)`)
      .eq('institution_id', institutionId)
      .eq('semester_id', semId)
      .eq('is_active', true)
    setOfferings(data || [])
  }

  async function checkClashes() {
    if (!selOffering || !semId) return
    const { data } = await supabase.rpc('rpc_check_clashes', {
      p_institution_id: institutionId,
      p_semester_id:    semId,
      p_offering_id:    selOffering,
      p_day:            selDay,
      p_start_time:     selStart,
      p_end_time:       selEnd,
      p_room_id:        selRoom || null,
    })
    setClashes(data || [])
  }

  async function addSlot() {
    setAdding(true); setMsg('')
    const { data, error } = await supabase.rpc('rpc_add_timetable_slot', {
      p_institution_id: institutionId,
      p_semester_id:    semId,
      p_offering_id:    selOffering,
      p_day:            selDay,
      p_start_time:     selStart,
      p_end_time:       selEnd,
      p_room_id:        selRoom || null,
    })
    setAdding(false)
    if (error) { setMsg(error.message); return }
    setShowAdd(false); setSelOffering(''); setSelRoom(''); setClashes([])
    loadSlots()
  }

  async function deleteSlot(id) {
    await supabase.rpc('rpc_delete_timetable_slot', { p_slot_id: id })
    setConfirmDel(null); loadSlots()
  }

  // Build grid
  const grid = {}
  DAYS.forEach(d => { grid[d] = {} })
  slots.forEach(s => {
    const t = s.start_time?.substring(0,5)
    if (grid[s.day] && t) grid[s.day][t] = s
  })

  if (loading) return <Spinner />

  return (
    <div>
      <Monolith eyebrow="Schedox" title="Timetable" description="Weekly schedule grid with clash detection" />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mt-6 mb-4 items-end">
        <div>
          <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Semester</label>
          <select className="input" value={semId} onChange={e => setSemId(e.target.value)}>
            {semesters.map(s => <option key={s.id} value={s.id}>{s.label}{s.is_current ? ' ★' : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Department</label>
          <select className="input" value={deptId} onChange={e => setDeptId(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <button className="btn-primary ml-auto" onClick={() => { setShowAdd(true); setMsg(''); setClashes([]) }}>
          + Add Slot
        </button>
      </div>

      {msg && <MsgBox msg={msg} />}

      {/* Add form */}
      {showAdd && (
        <div className="card p-5 mb-6">
          <p className="text-label-md uppercase tracking-widest mb-4">New Timetable Slot</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
            <div className="col-span-2 md:col-span-3">
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Course Offering *</label>
              <select className="input" value={selOffering} onChange={e => { setSelOffering(e.target.value); setClashes([]) }}>
                <option value="">Select offering</option>
                {offerings.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.courses?.code} — {o.courses?.name}
                    {o.persons ? ` (${o.persons.first_name} ${o.persons.last_name})` : ' (Unassigned)'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Day *</label>
              <select className="input" value={selDay} onChange={e => { setSelDay(e.target.value); setClashes([]) }}>
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Start *</label>
              <select className="input" value={selStart} onChange={e => { setSelStart(e.target.value); setClashes([]) }}>
                {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">End *</label>
              <select className="input" value={selEnd} onChange={e => { setSelEnd(e.target.value); setClashes([]) }}>
                {TIMES.filter(t => t > selStart).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Room</label>
              <select className="input" value={selRoom} onChange={e => { setSelRoom(e.target.value); setClashes([]) }}>
                <option value="">No room assigned</option>
                {rooms.filter(r => r.is_active).map(r => (
                  <option key={r.id} value={r.id}>{r.name} (cap. {r.capacity || '—'})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Clash check */}
          <div className="flex gap-2 mb-3">
            <button className="btn-secondary text-sm" onClick={checkClashes} disabled={!selOffering}>
              Check Clashes
            </button>
          </div>

          {clashes.length > 0 && (
            <Notice type="warning" icon="warning" title={`${clashes.length} clash(es) detected`} className="mb-3">
              {clashes.map((c, i) => (
                <p key={i} className="text-body-sm">{c.clash_detail}</p>
              ))}
              {clashes.every(c => c.clash_type !== 'room_conflict') && (
                <p className="text-body-sm mt-1 text-amber-600 font-medium">No room conflicts — you may still proceed.</p>
              )}
            </Notice>
          )}
          {clashes.length === 0 && selOffering && (
            <p className="text-body-sm text-green-700 mb-3">✓ No clashes detected</p>
          )}

          <ButtonRow>
            <button className="btn-secondary" onClick={() => { setShowAdd(false); setMsg(''); setClashes([]) }}>Cancel</button>
            <button className="btn-primary" onClick={addSlot} disabled={adding || !selOffering}>
              {adding ? 'Adding…' : 'Add Slot'}
            </button>
          </ButtonRow>
        </div>
      )}

      {/* Grid */}
      {slots.length === 0 && !showAdd
        ? <EmptyState title="No timetable slots" subtitle="Add slots using the button above" />
        : (
          <div className="overflow-x-auto">
            <table style={{ minWidth: 700 }} className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="text-left p-2 text-label-sm uppercase tracking-widest text-slate-400 w-16 border-b border-slate-200">Time</th>
                  {DAYS.map(d => (
                    <th key={d} className="text-label-sm uppercase tracking-widest text-slate-600 p-2 border-b border-slate-200 min-w-[110px]">{d.slice(0,3)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIMES.map(t => (
                  <tr key={t} className="border-b border-slate-100">
                    <td className="text-label-sm text-slate-400 p-2 align-top font-mono">{t}</td>
                    {DAYS.map(d => {
                      const s = grid[d]?.[t]
                      return (
                        <td key={d} className="p-1 align-top">
                          {s && (
                            <div className={`border-l-2 p-1.5 rounded-sm text-xs ${deptColor(s.department_id)} relative group`}>
                              <p className="font-bold leading-tight">{s.course_code}</p>
                              <p className="text-[10px] opacity-70 leading-tight truncate">{s.room_name || '—'}</p>
                              <button
                                onClick={() => setConfirmDel(s)}
                                className="absolute top-0.5 right-0.5 hidden group-hover:block text-slate-400 hover:text-red-500 text-xs leading-none">✕</button>
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

      {confirmDel && (
        <ConfirmDialog
          title="Remove Slot"
          message={`Remove ${confirmDel.course_code} — ${confirmDel.day} ${confirmDel.start_time?.substring(0,5)}–${confirmDel.end_time?.substring(0,5)}?`}
          danger
          confirmLabel="Remove"
          onConfirm={() => deleteSlot(confirmDel.id)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  )
}

// ─── Rooms View ──────────────────────────────────────────────
function RoomsView({ institutionId }) {
  const [rooms,   setRooms]   = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm,setShowForm]= useState(false)
  const [editRoom,setEditRoom]= useState(null)
  const [name,    setName]    = useState('')
  const [capacity,setCapacity]= useState('')
  const [type,    setType]    = useState('classroom')
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [confirmDel, setConfirmDel] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.rpc('rpc_get_rooms', { p_institution_id: institutionId })
    setRooms(data || []); setLoading(false)
  }, [institutionId])

  useEffect(() => { load() }, [load])

  function openAdd() { setEditRoom(null); setName(''); setCapacity(''); setType('classroom'); setShowForm(true); setMsg('') }
  function openEdit(r) { setEditRoom(r); setName(r.name); setCapacity(r.capacity || ''); setType(r.type || 'classroom'); setShowForm(true); setMsg('') }

  async function save() {
    if (!name.trim()) { setMsg('Room name required.'); return }
    setSaving(true); setMsg('')
    const { error } = await supabase.rpc('rpc_upsert_room', {
      p_institution_id: institutionId,
      p_id:       editRoom?.id || null,
      p_name:     name.trim(),
      p_capacity: capacity ? parseInt(capacity) : null,
      p_type:     type,
    })
    setSaving(false)
    if (error) { setMsg(error.message); return }
    setShowForm(false); load()
  }

  async function remove(id) {
    await supabase.rpc('rpc_delete_room', { p_id: id })
    setConfirmDel(null); load()
  }

  const TYPE_COLOR = {
    classroom: 'bg-blue-50 text-blue-700',
    lab:       'bg-green-50 text-green-700',
    hall:      'bg-purple-50 text-purple-700',
    office:    'bg-amber-50 text-amber-700',
  }

  if (loading) return <Spinner />

  return (
    <div>
      <Monolith
        eyebrow="Schedox"
        title="Rooms & Venues"
        description={`${rooms.filter(r => r.is_active).length} active rooms`}
        actions={<button className="btn-primary mt-2" onClick={openAdd}>+ Add Room</button>}
      />

      {showForm && (
        <div className="card p-5 mt-6">
          <p className="text-label-md uppercase tracking-widest mb-4">{editRoom ? 'Edit Room' : 'New Room'}</p>
          <MsgBox msg={msg} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Room Name *</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. LT 1" />
            </div>
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Capacity</label>
              <input type="number" className="input" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="e.g. 200" />
            </div>
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Type</label>
              <select className="input" value={type} onChange={e => setType(e.target.value)}>
                {ROOM_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <ButtonRow>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editRoom ? 'Update' : 'Add Room'}</button>
          </ButtonRow>
        </div>
      )}

      <div className="mt-6 card overflow-hidden">
        {rooms.length === 0
          ? <EmptyState title="No rooms" subtitle="Add rooms to assign to timetable slots" />
          : (
            <table className="data-table">
              <thead><tr><th>Room</th><th>Type</th><th>Capacity</th><th>Slots Used</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rooms.map(r => (
                  <tr key={r.id} className={r.is_active ? '' : 'opacity-50'}>
                    <td className="font-medium">{r.name}</td>
                    <td>
                      <span className={`text-label-sm uppercase px-2 py-0.5 font-bold ${TYPE_COLOR[r.type] || 'bg-slate-100 text-slate-600'}`}>
                        {r.type || '—'}
                      </span>
                    </td>
                    <td>{r.capacity || '—'}</td>
                    <td>{r.slot_count}</td>
                    <td>
                      <span className={`text-label-sm uppercase px-2 py-0.5 ${r.is_active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {r.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="flex gap-2">
                      <button className="text-label-sm text-blue-500 hover:text-blue-700" onClick={() => openEdit(r)}>Edit</button>
                      {r.is_active && (
                        <button className="text-label-sm text-red-500 hover:text-red-700" onClick={() => setConfirmDel(r)}>Remove</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {confirmDel && (
        <ConfirmDialog
          title="Remove Room"
          message={`Remove "${confirmDel.name}"? Existing timetable slots using this room will remain but lose the room reference.`}
          danger confirmLabel="Remove"
          onConfirm={() => remove(confirmDel.id)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  )
}

// ─── Calendar View ───────────────────────────────────────────
function CalendarView({ institutionId, person }) {
  const [events,  setEvents]  = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm,setShowForm]= useState(false)
  const [editEvt, setEditEvt] = useState(null)
  const [title,   setTitle]   = useState('')
  const [type,    setType]    = useState('event')
  const [startDate,setStartDate] = useState('')
  const [endDate,  setEndDate]   = useState('')
  const [desc,    setDesc]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [confirmDel, setConfirmDel] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.rpc('rpc_get_calendar_events', { p_institution_id: institutionId })
    setEvents(data || []); setLoading(false)
  }, [institutionId])

  useEffect(() => { load() }, [load])

  function openAdd() { setEditEvt(null); setTitle(''); setType('event'); setStartDate(''); setEndDate(''); setDesc(''); setShowForm(true); setMsg('') }
  function openEdit(e) { setEditEvt(e); setTitle(e.title); setType(e.type); setStartDate(e.start_date); setEndDate(e.end_date || ''); setDesc(e.description || ''); setShowForm(true); setMsg('') }

  async function save() {
    if (!title.trim() || !startDate) { setMsg('Title and start date required.'); return }
    setSaving(true); setMsg('')
    const { error } = await supabase.rpc('rpc_upsert_calendar_event', {
      p_institution_id: institutionId,
      p_person_id:   person.id,
      p_id:          editEvt?.id || null,
      p_title:       title.trim(),
      p_type:        type,
      p_start_date:  startDate,
      p_end_date:    endDate || null,
      p_description: desc || null,
    })
    setSaving(false)
    if (error) { setMsg(error.message); return }
    setShowForm(false); load()
  }

  async function remove(id) {
    await supabase.rpc('rpc_delete_calendar_event', { p_id: id })
    setConfirmDel(null); load()
  }

  // Group by month
  const grouped = events.reduce((acc, e) => {
    const key = e.start_date?.substring(0, 7)
    if (!acc[key]) acc[key] = []
    acc[key].push(e)
    return acc
  }, {})

  if (loading) return <Spinner />

  return (
    <div>
      <Monolith
        eyebrow="Schedox"
        title="Academic Calendar"
        description="Exams, registration periods, holidays and deadlines"
        actions={<button className="btn-primary mt-2" onClick={openAdd}>+ Add Event</button>}
      />

      {showForm && (
        <div className="card p-5 mt-6">
          <p className="text-label-md uppercase tracking-widest mb-4">{editEvt ? 'Edit Event' : 'New Event'}</p>
          <MsgBox msg={msg} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Title *</label>
              <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. First Semester Examinations" />
            </div>
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Type</label>
              <select className="input" value={type} onChange={e => setType(e.target.value)}>
                {EVENT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Start *</label>
                <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">End</label>
                <input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Description</label>
              <textarea className="input resize-none" rows={2} value={desc} onChange={e => setDesc(e.target.value)} />
            </div>
          </div>
          <ButtonRow>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editEvt ? 'Update' : 'Add Event'}</button>
          </ButtonRow>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {Object.keys(grouped).length === 0
          ? <EmptyState title="No events" subtitle="Add events to the academic calendar" />
          : Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([month, evts]) => (
            <div key={month}>
              <p className="text-label-md uppercase tracking-widest text-slate-400 mb-2">
                {new Date(month + '-01').toLocaleDateString('en-NG', { month:'long', year:'numeric' })}
              </p>
              <div className="space-y-2">
                {evts.map(e => (
                  <div key={e.id} className={`flex items-start gap-3 p-3 border-l-4 ${EVENT_COLOR[e.type] || 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-label-sm uppercase font-bold opacity-70">{e.type}</span>
                        <span className="text-body-sm text-slate-500">
                          {fmt(e.start_date)}{e.end_date && e.end_date !== e.start_date ? ` — ${fmt(e.end_date)}` : ''}
                        </span>
                      </div>
                      <p className="text-body-md font-bold">{e.title}</p>
                      {e.description && <p className="text-body-sm opacity-70 mt-0.5">{e.description}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button className="text-label-sm text-blue-500 hover:text-blue-700" onClick={() => openEdit(e)}>Edit</button>
                      <button className="text-label-sm text-red-500 hover:text-red-700" onClick={() => setConfirmDel(e)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>

      {confirmDel && (
        <ConfirmDialog
          title="Remove Event"
          message={`Remove "${confirmDel.title}"?`}
          danger confirmLabel="Remove"
          onConfirm={() => remove(confirmDel.id)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  )
}
