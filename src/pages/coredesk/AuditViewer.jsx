import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Spinner, EmptyState, MsgBox, Monolith, Notice } from '../../components/ui'

function fmtDT(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-NG', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

const EVENT_LABEL = {
  batch_submitted:        { label:'Batch Submitted',         color:'bg-blue-50 text-blue-700' },
  batch_forwarded:        { label:'Batch Forwarded',         color:'bg-indigo-50 text-indigo-700' },
  batch_rejected:         { label:'Batch Rejected',          color:'bg-red-50 text-red-700' },
  batch_qa_flagged:       { label:'QA Flagged',              color:'bg-amber-50 text-amber-700' },
  batch_qa_cleared:       { label:'QA Cleared',              color:'bg-green-50 text-green-700' },
  batch_published:        { label:'Published',               color:'bg-green-100 text-green-800' },
  resolution_recorded:    { label:'Resolution Recorded',     color:'bg-purple-50 text-purple-700' },
  payment_recorded:       { label:'Payment Recorded',        color:'bg-emerald-50 text-emerald-700' },
  clearance_override:     { label:'Clearance Override',      color:'bg-rose-50 text-rose-700' },
  assignment_graded:      { label:'Assignment Graded',       color:'bg-sky-50 text-sky-700' },
}

const AUDIT_ENTITY_TYPES = ['result_batch','committee_session','invoice','timetable_slot','office_assignment']

export default function AuditViewer({ institutionId }) {
  const [events,      setEvents]      = useState([])
  const [auditLog,    setAuditLog]    = useState([])
  const [activeTab,   setActiveTab]   = useState('events')
  const [loading,     setLoading]     = useState(true)
  const [entityFilter,setEntityFilter]= useState('')
  const [expandedId,  setExpandedId]  = useState(null)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.rpc('rpc_get_my_events', {
      p_institution_id: institutionId,
      p_person_id:      null,
      p_limit:          100,
    })
    setEvents(data || [])
    setLoading(false)
  }, [institutionId])

  const loadAudit = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.rpc('rpc_get_audit_log', {
      p_institution_id:   institutionId,
      p_limit:            100,
      p_entity_type:      entityFilter || null,
      p_person_id_filter: null,
    })
    setAuditLog(data || [])
    setLoading(false)
  }, [institutionId, entityFilter])

  useEffect(() => {
    if (activeTab === 'events') loadEvents()
    else loadAudit()
  }, [activeTab, entityFilter])

  return (
    <div>
      <Monolith
        eyebrow="Coredesk"
        title="Activity & Audit Log"
        description="Immutable record of all system events and governance actions"
      />

      <Notice type="info" icon="lock" title="Immutable Log" className="mt-4">
        Audit entries cannot be edited or deleted. Every write action is recorded with the acting person, office, and authority source.
      </Notice>

      {/* Tab toggle */}
      <div className="flex gap-0 border-b border-slate-200 mt-6 mb-4">
        {[
          { id:'events', label:'System Events' },
          { id:'audit',  label:'Audit Log' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2.5 text-label-sm uppercase tracking-widest border-b-2 transition-colors
              ${activeTab === t.id ? 'border-primary-container text-on-surface font-bold' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Audit filter */}
      {activeTab === 'audit' && (
        <div className="mb-4">
          <select className="input max-w-xs" value={entityFilter} onChange={e => setEntityFilter(e.target.value)}>
            <option value="">All Entity Types</option>
            {AUDIT_ENTITY_TYPES.map(t => (
              <option key={t} value={t}>{t.replace(/_/g,' ')}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? <Spinner /> : activeTab === 'events' ? (
        events.length === 0
          ? <EmptyState title="No events yet" subtitle="System events will appear here as actions are taken" />
          : (
            <div className="space-y-1">
              {events.map(e => {
                const meta = EVENT_LABEL[e.event_type] || { label: e.event_type, color: 'bg-slate-100 text-slate-600' }
                const isExpanded = expandedId === e.id
                return (
                  <div key={e.id} className="card p-3">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : e.id)}>
                      <span className={`text-label-sm uppercase px-2 py-0.5 font-bold shrink-0 ${meta.color}`}>
                        {meta.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm text-on-surface truncate">
                          {e.actor_name} <span className="text-slate-400">via</span> {e.office_name}
                        </p>
                      </div>
                      <p className="text-[11px] text-slate-400 shrink-0">{fmtDT(e.created_at)}</p>
                      <span className="material-symbols-outlined text-slate-400 text-base">
                        {isExpanded ? 'expand_less' : 'expand_more'}
                      </span>
                    </div>
                    {isExpanded && e.payload && (
                      <div className="mt-2 bg-slate-50 p-3 font-mono text-xs text-slate-500 rounded overflow-x-auto">
                        <pre>{JSON.stringify(e.payload, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
      ) : (
        auditLog.length === 0
          ? <EmptyState title="No audit entries" subtitle="Governance actions will appear here" />
          : (
            <div className="card overflow-hidden">
              <table className="data-table">
                <thead>
                  <tr><th>Timestamp</th><th>Action</th><th>Entity</th><th>Person</th><th>Office</th><th>Authority</th><th></th></tr>
                </thead>
                <tbody>
                  {auditLog.map(a => (
                    <>
                      <tr key={a.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
                        <td className="text-slate-400 text-xs font-mono whitespace-nowrap">{fmtDT(a.created_at)}</td>
                        <td>
                          <span className="text-label-sm uppercase bg-slate-100 text-slate-700 px-2 py-0.5 font-bold">
                            {a.action}
                          </span>
                        </td>
                        <td className="text-slate-500 text-xs">{a.entity_type}</td>
                        <td className="font-medium">{a.person_name}</td>
                        <td className="text-slate-500">{a.office_name}</td>
                        <td>
                          <span className={`text-label-sm uppercase px-2 py-0.5 font-bold ${a.authority_src === 'delegated' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                            {a.authority_src}
                          </span>
                        </td>
                        <td>
                          <span className="material-symbols-outlined text-slate-400 text-sm">
                            {expandedId === a.id ? 'expand_less' : 'expand_more'}
                          </span>
                        </td>
                      </tr>
                      {expandedId === a.id && a.payload && (
                        <tr key={`${a.id}-payload`}>
                          <td colSpan={7} className="bg-slate-50 p-3">
                            <pre className="font-mono text-xs text-slate-500 overflow-x-auto">
                              {JSON.stringify(a.payload, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}
    </div>
  )
}
