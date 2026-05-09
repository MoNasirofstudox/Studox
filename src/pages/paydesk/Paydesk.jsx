import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Spinner, Monolith, Notice, MsgBox, EmptyState,
  Modal, ConfirmDialog, ButtonRow,
  TopBar, AppShell, SidebarHeader, SidebarSection, NavItem, AuthorityTag,
  PageHeader
} from '../../components/ui'

function fmt(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
}
function fmtMoney(n) {
  if (n == null) return '—'
  return '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })
}
function pct(a, b) {
  if (!b) return 0
  return Math.round((a / b) * 100)
}

const STATUS_COLOR = {
  paid:    'bg-green-50 text-green-700',
  partial: 'bg-amber-50 text-amber-700',
  unpaid:  'bg-red-50 text-red-700',
}

export default function Paydesk() {
  const { person } = useAuth()
  const navigate   = useNavigate()
  const [office,   setOffice]  = useState(null)
  const [view,     setView]    = useState('schedules')
  const [loading,  setLoading] = useState(true)

  useEffect(() => { loadOffice() }, [person])

  async function loadOffice() {
    if (!person) return
    setLoading(true)
    const { data } = await supabase.rpc('rpc_get_my_offices', { p_person_id: person.id })
    setOffice((data || [])[0] || null)
    setLoading(false)
  }

  const institutionId = office?.institution_id

  const sidebar = office ? (
    <>
      <SidebarHeader module="Paydesk" role={office.office_name} />
      <SidebarSection label="Finance">
        <NavItem icon="receipt_long"   label="Fee Schedules" active={view==='schedules'}  onClick={() => setView('schedules')} />
        <NavItem icon="account_balance_wallet" label="Invoices" active={view==='invoices'} onClick={() => setView('invoices')} />
        <NavItem icon="verified_user"  label="Clearances"    active={view==='clearances'} onClick={() => setView('clearances')} />
        <NavItem icon="bar_chart"      label="Summary"       active={view==='summary'}    onClick={() => setView('summary')} />
      </SidebarSection>
      <AuthorityTag officeName={office.office_name} source={office.authority_source} />
    </>
  ) : null

  const topbar = (
    <TopBar appName="Studox OS" section="Paydesk"
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
        <p className="text-body-sm text-on-surface-variant">You need an office assignment to access Paydesk.</p>
        <button onClick={() => navigate('/')} className="btn-secondary mt-6">← Back</button>
      </div>
    </AppShell>
  )

  return (
    <AppShell header={topbar} sidebar={sidebar}>
      {view === 'schedules'  && <SchedulesView  institutionId={institutionId} person={person} />}
      {view === 'invoices'   && <InvoicesView   institutionId={institutionId} person={person} />}
      {view === 'clearances' && <ClearancesView institutionId={institutionId} person={person} />}
      {view === 'summary'    && <SummaryView    institutionId={institutionId} />}
    </AppShell>
  )
}

// ─── Fee Schedules ───────────────────────────────────────────
function SchedulesView({ institutionId, person }) {
  const [schedules, setSchedules] = useState([])
  const [sessions,  setSessions]  = useState([])
  const [programs,  setPrograms]  = useState([])
  const [sel,       setSel]       = useState(null)
  const [items,     setItems]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [itemLoading, setItemLoading] = useState(false)
  const [showCreate,  setShowCreate] = useState(false)
  const [showItem,    setShowItem]   = useState(false)
  const [genConfirm,  setGenConfirm] = useState(false)

  // Create form
  const [name,      setName]      = useState('')
  const [sessionId, setSessionId] = useState('')
  const [programId, setProgramId] = useState('')
  const [level,     setLevel]     = useState('')
  const [saving,    setSaving]    = useState(false)
  const [msg,       setMsg]       = useState('')

  // Item form
  const [itemName,   setItemName]   = useState('')
  const [itemAmount, setItemAmount] = useState('')
  const [itemSaving, setItemSaving] = useState(false)
  const [itemMsg,    setItemMsg]    = useState('')
  const [genMsg,     setGenMsg]     = useState('')
  const [genLoading, setGenLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: sc }, { data: ss }, { data: pr }] = await Promise.all([
      supabase.rpc('rpc_get_fee_schedules', { p_institution_id: institutionId }),
      supabase.from('academic_sessions').select('id,name').eq('institution_id', institutionId).order('name', { ascending: false }),
      supabase.from('programs').select('id,name,code').eq('institution_id', institutionId).eq('is_active', true).order('name'),
    ])
    setSchedules(sc || []); setSessions(ss || []); setPrograms(pr || [])
    setLoading(false)
  }, [institutionId])

  useEffect(() => { load() }, [load])

  async function selectSchedule(s) {
    setSel(s); setItemLoading(true)
    const { data } = await supabase.rpc('rpc_get_fee_items', { p_schedule_id: s.id })
    setItems(data || []); setItemLoading(false)
  }

  async function createSchedule() {
    if (!name.trim() || !sessionId) { setMsg('Name and session required.'); return }
    setSaving(true); setMsg('')
    const { error } = await supabase.rpc('rpc_create_fee_schedule', {
      p_institution_id: institutionId,
      p_session_id:     sessionId,
      p_name:           name.trim(),
      p_program_id:     programId || null,
      p_level:          level ? parseInt(level) : null,
    })
    setSaving(false)
    if (error) { setMsg(error.message); return }
    setShowCreate(false); setName(''); setSessionId(''); setProgramId(''); setLevel('')
    load()
  }

  async function addItem() {
    if (!itemName.trim() || !itemAmount) { setItemMsg('Name and amount required.'); return }
    setItemSaving(true); setItemMsg('')
    const { error } = await supabase.rpc('rpc_add_fee_item', {
      p_schedule_id: sel.id,
      p_name:        itemName.trim(),
      p_amount:      parseFloat(itemAmount),
      p_order:       items.length,
    })
    setItemSaving(false)
    if (error) { setItemMsg(error.message); return }
    setShowItem(false); setItemName(''); setItemAmount('')
    selectSchedule(sel)
  }

  async function deleteItem(id) {
    await supabase.rpc('rpc_delete_fee_item', { p_item_id: id })
    selectSchedule(sel)
  }

  async function generateInvoices() {
    setGenLoading(true); setGenMsg('')
    const { data, error } = await supabase.rpc('rpc_generate_invoices', { p_schedule_id: sel.id })
    setGenLoading(false); setGenConfirm(false)
    if (error) { setGenMsg(error.message) }
    else { setGenMsg(`✓ ${data.invoices_created} invoice(s) generated at ${fmtMoney(data.total_amount)} each.`) }
    load(); selectSchedule(sel)
  }

  const totalItems = items.reduce((s, i) => s + parseFloat(i.amount || 0), 0)

  if (loading) return <Spinner />

  if (sel) return (
    <div>
      <button onClick={() => { setSel(null); setGenMsg('') }}
        className="text-label-sm uppercase tracking-widest text-slate-400 hover:text-slate-700 mb-6 flex items-center gap-1">
        <span className="material-symbols-outlined text-base">arrow_back</span> Fee Schedules
      </button>

      <Monolith
        eyebrow="Fee Schedule"
        title={sel.name}
        description={`${sel.session_name} · ${sel.program_name || 'All Programs'}${sel.level ? ` · Level ${sel.level}` : ''}`}
        stats={[
          { label: 'Items',    value: items.length,     color: 'text-blue-400'  },
          { label: 'Total',    value: fmtMoney(totalItems), color: 'text-green-400' },
          { label: 'Invoices', value: sel.invoice_count, color: 'text-amber-400' },
        ]}
        actions={
          <div className="flex gap-2 mt-2">
            <button className="btn-primary"   onClick={() => setShowItem(true)}>+ Add Fee Item</button>
            <button className="btn-secondary" onClick={() => setGenConfirm(true)}>Generate Invoices</button>
          </div>
        }
      />

      {genMsg && <MsgBox msg={genMsg} type={genMsg.startsWith('✓') ? 'success' : 'error'} />}

      {itemLoading ? <Spinner /> : (
        <div className="mt-6">
          {items.length === 0
            ? <EmptyState title="No fee items" subtitle="Add items to build the fee schedule" />
            : (
              <div className="card overflow-hidden">
                <table className="data-table">
                  <thead><tr><th>#</th><th>Fee Item</th><th>Amount</th><th></th></tr></thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={it.id}>
                        <td className="text-slate-400">{idx + 1}</td>
                        <td className="font-medium">{it.name}</td>
                        <td className="font-bold text-on-surface">{fmtMoney(it.amount)}</td>
                        <td>
                          <button className="text-label-sm text-red-500 hover:text-red-700" onClick={() => deleteItem(it.id)}>Remove</button>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50">
                      <td></td>
                      <td className="font-bold text-label-md uppercase tracking-widest">Total</td>
                      <td className="font-black text-on-surface text-base">{fmtMoney(totalItems)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {showItem && (
        <Modal title="Add Fee Item" onClose={() => setShowItem(false)}>
          <MsgBox msg={itemMsg} />
          <div className="space-y-3">
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Item Name *</label>
              <input className="input" value={itemName} onChange={e => setItemName(e.target.value)}
                placeholder="e.g. Tuition Fee, Library Levy, SUG Dues" />
            </div>
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Amount (₦) *</label>
              <input type="number" className="input" value={itemAmount} onChange={e => setItemAmount(e.target.value)}
                placeholder="e.g. 75000" />
            </div>
          </div>
          <ButtonRow>
            <button className="btn-secondary" onClick={() => { setShowItem(false); setItemMsg('') }}>Cancel</button>
            <button className="btn-primary" onClick={addItem} disabled={itemSaving}>{itemSaving ? 'Adding…' : 'Add Item'}</button>
          </ButtonRow>
        </Modal>
      )}

      {genConfirm && (
        <ConfirmDialog
          title="Generate Invoices"
          message={`Generate invoices of ${fmtMoney(totalItems)} for all matching active enrollments? Existing invoices for this schedule will be skipped.`}
          confirmLabel={genLoading ? 'Generating…' : 'Generate'}
          onConfirm={generateInvoices}
          onCancel={() => setGenConfirm(false)}
        />
      )}
    </div>
  )

  return (
    <div>
      <Monolith
        eyebrow="Paydesk"
        title="Fee Schedules"
        description="Define fee structures and generate student invoices"
        actions={<button className="btn-primary mt-2" onClick={() => setShowCreate(true)}>+ New Schedule</button>}
      />

      {msg && <MsgBox msg={msg} />}

      {showCreate && (
        <div className="card p-5 mt-6">
          <p className="text-label-md uppercase tracking-widest mb-4">New Fee Schedule</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Schedule Name *</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. 2024/2025 School Fees — 100L" />
            </div>
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Academic Session *</label>
              <select className="input" value={sessionId} onChange={e => setSessionId(e.target.value)}>
                <option value="">Select session</option>
                {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Program (blank = all)</label>
              <select className="input" value={programId} onChange={e => setProgramId(e.target.value)}>
                <option value="">All Programs</option>
                {programs.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Level (blank = all)</label>
              <select className="input" value={level} onChange={e => setLevel(e.target.value)}>
                <option value="">All Levels</option>
                {[100,200,300,400,500].map(l => <option key={l} value={l}>Level {l}</option>)}
              </select>
            </div>
          </div>
          <ButtonRow>
            <button className="btn-secondary" onClick={() => { setShowCreate(false); setMsg('') }}>Cancel</button>
            <button className="btn-primary" onClick={createSchedule} disabled={saving}>{saving ? 'Creating…' : 'Create Schedule'}</button>
          </ButtonRow>
        </div>
      )}

      <div className="mt-6 space-y-2">
        {schedules.length === 0
          ? <EmptyState title="No fee schedules" subtitle="Create a schedule to get started" />
          : schedules.map(s => (
            <div key={s.id} onClick={() => selectSchedule(s)}
              className="card p-4 flex items-center gap-4 cursor-pointer hover:border-primary-container transition-colors">
              <div className="flex-1">
                <p className="text-body-md font-bold text-on-surface mb-0.5">{s.name}</p>
                <p className="text-body-sm text-slate-500">
                  {s.session_name} · {s.program_name || 'All Programs'}{s.level ? ` · Level ${s.level}` : ''}
                  {' · '}{s.item_count} item{s.item_count !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-body-md font-black text-on-surface">{fmtMoney(s.total_amount)}</p>
                <p className="text-body-sm text-slate-400">{s.invoice_count} invoice{s.invoice_count !== 1 ? 's' : ''}</p>
              </div>
              <span className="material-symbols-outlined text-slate-400">chevron_right</span>
            </div>
          ))}
      </div>
    </div>
  )
}

// ─── Invoices View ───────────────────────────────────────────
function InvoicesView({ institutionId, person }) {
  const [schedules,   setSchedules]   = useState([])
  const [scheduleId,  setScheduleId]  = useState('')
  const [statusFilter,setStatusFilter]= useState('')
  const [invoices,    setInvoices]    = useState([])
  const [selInvoice,  setSelInvoice]  = useState(null)
  const [payments,    setPayments]    = useState([])
  const [loading,     setLoading]     = useState(false)
  const [payLoading,  setPayLoading]  = useState(false)
  const [showPay,     setShowPay]     = useState(false)
  const [payAmount,   setPayAmount]   = useState('')
  const [payMethod,   setPayMethod]   = useState('manual')
  const [payRef,      setPayRef]      = useState('')
  const [paying,      setPaying]      = useState(false)
  const [msg,         setMsg]         = useState('')
  const [payMsg,      setPayMsg]      = useState('')

  useEffect(() => {
    supabase.rpc('rpc_get_fee_schedules', { p_institution_id: institutionId })
      .then(({ data }) => setSchedules(data || []))
  }, [institutionId])

  useEffect(() => { loadInvoices() }, [scheduleId, statusFilter])

  async function loadInvoices() {
    setLoading(true)
    const { data } = await supabase.rpc('rpc_get_invoices', {
      p_institution_id: institutionId,
      p_schedule_id:    scheduleId || null,
      p_status:         statusFilter || null,
    })
    setInvoices(data || []); setLoading(false)
  }

  async function selectInvoice(inv) {
    setSelInvoice(inv); setPayLoading(true)
    const { data } = await supabase.rpc('rpc_get_payments', { p_invoice_id: inv.id })
    setPayments(data || []); setPayLoading(false)
  }

  async function recordPayment() {
    if (!payAmount) { setPayMsg('Amount required.'); return }
    setPaying(true); setPayMsg('')
    const { data, error } = await supabase.rpc('rpc_record_payment', {
      p_invoice_id: selInvoice.id,
      p_amount:     parseFloat(payAmount),
      p_method:     payMethod,
      p_reference:  payRef || null,
      p_person_id:  person.id,
    })
    setPaying(false)
    if (error) { setPayMsg(error.message); return }
    setShowPay(false); setPayAmount(''); setPayMethod('manual'); setPayRef('')
    // Reload
    const { data: updated } = await supabase.rpc('rpc_get_invoices', {
      p_institution_id: institutionId, p_schedule_id: scheduleId || null, p_status: statusFilter || null,
    })
    setInvoices(updated || [])
    const refreshed = (updated || []).find(i => i.id === selInvoice.id) || selInvoice
    selectInvoice(refreshed)
  }

  if (selInvoice) {
    const balance = selInvoice.total_amount - selInvoice.paid_amount
    return (
      <div>
        <button onClick={() => { setSelInvoice(null); setPayments([]) }}
          className="text-label-sm uppercase tracking-widest text-slate-400 hover:text-slate-700 mb-6 flex items-center gap-1">
          <span className="material-symbols-outlined text-base">arrow_back</span> Invoices
        </button>

        <Monolith
          eyebrow="Invoice"
          title={selInvoice.student_name}
          description={`${selInvoice.program_name} · Level ${selInvoice.level} · Matric: ${selInvoice.matric_number || '—'}`}
          stats={[
            { label: 'Total',   value: fmtMoney(selInvoice.total_amount), color: 'text-slate-200' },
            { label: 'Paid',    value: fmtMoney(selInvoice.paid_amount),   color: 'text-green-400' },
            { label: 'Balance', value: fmtMoney(balance),                  color: balance > 0 ? 'text-red-400' : 'text-green-400' },
          ]}
          actions={
            selInvoice.status !== 'paid' && (
              <button className="btn-primary mt-2" onClick={() => setShowPay(true)}>+ Record Payment</button>
            )
          }
        />

        <div className="mt-4">
          <span className={`text-label-sm uppercase px-3 py-1 font-bold ${STATUS_COLOR[selInvoice.status] || 'bg-slate-100 text-slate-600'}`}>
            {selInvoice.status}
          </span>
        </div>

        {payMsg && <MsgBox msg={payMsg} />}

        <div className="mt-6">
          <p className="text-label-md uppercase tracking-widest text-slate-400 mb-3">Payment History</p>
          {payLoading ? <Spinner /> : payments.length === 0
            ? <EmptyState title="No payments recorded" subtitle="Record the first payment above" />
            : (
              <div className="card overflow-hidden">
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Verified By</th></tr></thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id}>
                        <td>{fmt(p.paid_at)}</td>
                        <td className="font-bold">{fmtMoney(p.amount)}</td>
                        <td><span className="text-label-sm uppercase bg-slate-100 text-slate-600 px-2 py-0.5">{p.method}</span></td>
                        <td className="text-slate-400 font-mono text-xs">{p.reference || '—'}</td>
                        <td className="text-slate-500">{p.verifier_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>

        {showPay && (
          <Modal title="Record Payment" subtitle={selInvoice.student_name} onClose={() => setShowPay(false)}>
            <MsgBox msg={payMsg} />
            <div className="space-y-3">
              <div>
                <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Amount (₦) *</label>
                <input type="number" className="input" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  placeholder={`Balance: ${fmtMoney(balance)}`} />
              </div>
              <div>
                <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Method</label>
                <select className="input" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  <option value="manual">Manual / Cash</option>
                  <option value="paystack">Paystack</option>
                  <option value="flutterwave">Flutterwave</option>
                </select>
              </div>
              <div>
                <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Reference / Receipt No.</label>
                <input className="input" value={payRef} onChange={e => setPayRef(e.target.value)}
                  placeholder="e.g. RCT/2025/001" />
              </div>
            </div>
            <ButtonRow>
              <button className="btn-secondary" onClick={() => setShowPay(false)}>Cancel</button>
              <button className="btn-primary" onClick={recordPayment} disabled={paying}>{paying ? 'Recording…' : 'Record Payment'}</button>
            </ButtonRow>
          </Modal>
        )}
      </div>
    )
  }

  return (
    <div>
      <Monolith eyebrow="Paydesk" title="Invoices" description="View and record student fee payments" />

      {/* Filters */}
      <div className="flex gap-3 mt-6 mb-4">
        <select className="input max-w-xs" value={scheduleId} onChange={e => setScheduleId(e.target.value)}>
          <option value="">All Schedules</option>
          {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="input w-36" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      {loading ? <Spinner /> : invoices.length === 0
        ? <EmptyState title="No invoices found" subtitle="Generate invoices from a fee schedule" />
        : (
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr><th>Student</th><th>Matric</th><th>Program</th><th>Level</th><th>Total</th><th>Paid</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="cursor-pointer hover:bg-slate-50" onClick={() => selectInvoice(inv)}>
                    <td className="font-medium">{inv.student_name}</td>
                    <td className="text-slate-400 text-xs font-mono">{inv.matric_number || '—'}</td>
                    <td className="text-slate-500">{inv.program_name}</td>
                    <td>{inv.level}</td>
                    <td>{fmtMoney(inv.total_amount)}</td>
                    <td>{fmtMoney(inv.paid_amount)}</td>
                    <td>
                      <span className={`text-label-sm uppercase px-2 py-0.5 font-bold ${STATUS_COLOR[inv.status] || 'bg-slate-100 text-slate-600'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td><span className="material-symbols-outlined text-slate-400 text-base">chevron_right</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}

// ─── Clearances View ─────────────────────────────────────────
function ClearancesView({ institutionId, person }) {
  const [sessions,   setSessions]   = useState([])
  const [sessionId,  setSessionId]  = useState('')
  const [clearances, setClearances] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [overrideSel,setOverrideSel]= useState(null)
  const [overrideVal,setOverrideVal]= useState(true)
  const [overrideReason, setOverrideReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase.from('academic_sessions').select('id,name').eq('institution_id', institutionId).order('name', { ascending: false })
      .then(({ data }) => { setSessions(data || []); if (data?.length) setSessionId(data[0].id) })
  }, [institutionId])

  useEffect(() => { if (sessionId) loadClearances() }, [sessionId])

  async function loadClearances() {
    setLoading(true)
    const { data } = await supabase.rpc('rpc_get_clearances', { p_institution_id: institutionId, p_session_id: sessionId })
    setClearances(data || []); setLoading(false)
  }

  async function override() {
    if (!overrideReason.trim()) { setMsg('Reason required for override.'); return }
    setSaving(true); setMsg('')
    const { error } = await supabase.rpc('rpc_override_clearance', {
      p_institution_id: institutionId,
      p_student_id:     overrideSel.student_id,
      p_session_id:     sessionId,
      p_cleared:        overrideVal,
      p_reason:         overrideReason.trim(),
      p_by_person_id:   person.id,
    })
    setSaving(false)
    if (error) { setMsg(error.message); return }
    setOverrideSel(null); setOverrideReason(''); loadClearances()
  }

  const cleared   = clearances.filter(c => c.is_cleared)
  const uncleared = clearances.filter(c => !c.is_cleared)

  return (
    <div>
      <Monolith
        eyebrow="Paydesk"
        title="Financial Clearances"
        description="Manage student clearance status for registration and graduation"
        stats={[
          { label: 'Cleared',   value: cleared.length,   color: 'text-green-400' },
          { label: 'Uncleared', value: uncleared.length, color: 'text-red-400'   },
        ]}
      />

      <Notice type="warning" icon="admin_panel_settings" title="Registrar Override" className="mt-6">
        Clearance overrides create an audit trail. Use only when a student has a valid exemption approved by the Registrar.
      </Notice>

      <div className="mt-6 mb-4">
        <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Academic Session</label>
        <select className="input max-w-xs" value={sessionId} onChange={e => setSessionId(e.target.value)}>
          {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {msg && <MsgBox msg={msg} />}

      {loading ? <Spinner /> : clearances.length === 0
        ? <EmptyState title="No clearance records" subtitle="Clearances are created automatically when invoices are fully paid" />
        : (
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr><th>Student</th><th>Matric</th><th>Program</th><th>Status</th><th>Override Reason</th><th>Cleared At</th><th></th></tr>
              </thead>
              <tbody>
                {clearances.map(c => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.student_name}</td>
                    <td className="text-slate-400 font-mono text-xs">{c.matric_number || '—'}</td>
                    <td className="text-slate-500">{c.program_name}</td>
                    <td>
                      <span className={`text-label-sm uppercase px-2 py-0.5 font-bold ${c.is_cleared ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {c.is_cleared ? 'Cleared' : 'Not Cleared'}
                      </span>
                    </td>
                    <td className="text-slate-400 text-xs">{c.override_reason || '—'}</td>
                    <td className="text-slate-400">{fmt(c.cleared_at)}</td>
                    <td>
                      <button className="text-label-sm text-blue-500 hover:text-blue-700"
                        onClick={() => { setOverrideSel(c); setOverrideVal(!c.is_cleared); setOverrideReason(''); setMsg('') }}>
                        Override
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {overrideSel && (
        <Modal
          title="Override Clearance"
          subtitle={overrideSel.student_name}
          onClose={() => { setOverrideSel(null); setMsg('') }}>
          <MsgBox msg={msg} />
          <div className="space-y-3">
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">New Status</label>
              <select className="input" value={overrideVal ? 'true' : 'false'} onChange={e => setOverrideVal(e.target.value === 'true')}>
                <option value="true">Grant Clearance</option>
                <option value="false">Revoke Clearance</option>
              </select>
            </div>
            <div>
              <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Reason / Approval Ref *</label>
              <textarea className="input resize-none" rows={3} value={overrideReason} onChange={e => setOverrideReason(e.target.value)}
                placeholder="e.g. Approved by Registrar — scholarship exemption. Ref: REG/2025/087" />
            </div>
          </div>
          <ButtonRow>
            <button className="btn-secondary" onClick={() => setOverrideSel(null)}>Cancel</button>
            <button className="btn-primary" onClick={override} disabled={saving}>{saving ? 'Saving…' : 'Apply Override'}</button>
          </ButtonRow>
        </Modal>
      )}
    </div>
  )
}

// ─── Summary View ────────────────────────────────────────────
function SummaryView({ institutionId }) {
  const [sessions,  setSessions]  = useState([])
  const [sessionId, setSessionId] = useState('')
  const [summary,   setSummary]   = useState(null)
  const [loading,   setLoading]   = useState(false)

  useEffect(() => {
    supabase.from('academic_sessions').select('id,name').eq('institution_id', institutionId).order('name', { ascending: false })
      .then(({ data }) => { setSessions(data || []); if (data?.length) setSessionId(data[0].id) })
  }, [institutionId])

  useEffect(() => { if (sessionId) loadSummary() }, [sessionId])

  async function loadSummary() {
    setLoading(true)
    const { data } = await supabase.rpc('rpc_get_financial_summary', { p_institution_id: institutionId, p_session_id: sessionId })
    setSummary(data); setLoading(false)
  }

  const collectionRate = summary ? pct(summary.total_collected, summary.total_invoiced) : 0

  return (
    <div>
      <Monolith eyebrow="Paydesk" title="Financial Summary" description="Collection overview by academic session" />

      <div className="mt-6 mb-6">
        <label className="text-label-sm uppercase tracking-widest text-slate-500 block mb-1">Academic Session</label>
        <select className="input max-w-xs" value={sessionId} onChange={e => setSessionId(e.target.value)}>
          {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {loading ? <Spinner /> : !summary ? null : (
        <div className="space-y-6">
          {/* Key stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Invoiced',  value: fmtMoney(summary.total_invoiced),  color: 'text-on-surface' },
              { label: 'Total Collected', value: fmtMoney(summary.total_collected), color: 'text-green-700' },
              { label: 'Outstanding',     value: fmtMoney(summary.total_invoiced - summary.total_collected), color: 'text-red-700' },
              { label: 'Collection Rate', value: `${collectionRate}%`, color: collectionRate >= 80 ? 'text-green-700' : collectionRate >= 50 ? 'text-amber-700' : 'text-red-700' },
            ].map(stat => (
              <div key={stat.label} className="card p-5">
                <p className="text-label-sm uppercase tracking-widest text-slate-400 mb-1">{stat.label}</p>
                <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="card p-5">
            <div className="flex justify-between items-center mb-2">
              <p className="text-label-md uppercase tracking-widest text-slate-400">Collection Progress</p>
              <p className="text-label-md font-bold text-on-surface">{collectionRate}%</p>
            </div>
            <div className="h-3 bg-slate-100 rounded overflow-hidden">
              <div className="h-full bg-primary-container transition-all duration-500"
                style={{ width: `${collectionRate}%` }} />
            </div>
          </div>

          {/* Invoice breakdown */}
          <div className="card p-5">
            <p className="text-label-md uppercase tracking-widest text-slate-400 mb-4">Invoice Breakdown</p>
            <div className="space-y-3">
              {[
                { label: 'Fully Paid',   count: summary.paid_count,    color: 'bg-green-400', total: summary.invoice_count },
                { label: 'Partial',      count: summary.partial_count, color: 'bg-amber-400', total: summary.invoice_count },
                { label: 'Unpaid',       count: summary.unpaid_count,  color: 'bg-red-400',   total: summary.invoice_count },
              ].map(row => (
                <div key={row.label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-body-sm text-slate-500">{row.label}</span>
                    <span className="text-body-sm font-bold text-on-surface">{row.count} / {row.total} ({pct(row.count, row.total)}%)</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded overflow-hidden">
                    <div className={`h-full ${row.color} transition-all duration-500`}
                      style={{ width: `${pct(row.count, row.total)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Clearances */}
          <div className="card p-5 flex items-center justify-between">
            <div>
              <p className="text-label-sm uppercase tracking-widest text-slate-400 mb-1">Financial Clearances Issued</p>
              <p className="text-3xl font-black text-on-surface">{summary.cleared_count}</p>
            </div>
            <span className="material-symbols-outlined text-5xl text-green-200">verified_user</span>
          </div>
        </div>
      )}
    </div>
  )
}
