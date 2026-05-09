// ─── Spinner ─────────────────────────────────────────────────────────────────
export function Spinner({ size = 'md' }) {
  const s = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-10 h-10' : 'w-7 h-7'
  return (
    <div className="flex items-center justify-center p-8">
      <div className={`${s} border-2 border-slate-200 border-t-primary-container rounded-full animate-spin`} />
    </div>
  )
}

// ─── Status Monolith ─────────────────────────────────────────────────────────
export function Monolith({ eyebrow, title, description, stats = [], actions }) {
  return (
    <div className="monolith flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
      <div className="flex-1">
        {eyebrow && <span className="text-label-sm uppercase tracking-widest text-slate-400 block mb-1">{eyebrow}</span>}
        <h1 className="text-headline-lg font-bold">{title}</h1>
        {description && <p className="text-body-sm text-slate-400 mt-1">{description}</p>}
        {actions && <div className="mt-4">{actions}</div>}
      </div>
      {stats.length > 0 && (
        <div className="flex gap-3 shrink-0">
          {stats.map((s, i) => (
            <div key={i} className="bg-slate-800 px-4 py-3 border border-slate-700 text-center min-w-[80px]">
              <span className="text-label-sm text-slate-400 block uppercase tracking-widest">{s.label}</span>
              <span className={`text-2xl font-black block mt-0.5 ${s.color || 'text-white'}`}>{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Notice ──────────────────────────────────────────────────────────────────
export function Notice({ type = 'info', icon, title, children }) {
  const variants = {
    warning: 'notice-warning',
    danger:  'notice-danger',
    info:    'notice-info',
    neutral: 'notice-neutral',
  }
  const iconColors = {
    warning: 'text-amber-600',
    danger:  'text-red-600',
    info:    'text-blue-600',
    neutral: 'text-slate-700',
  }
  const titleColors = {
    warning: 'text-amber-800',
    danger:  'text-red-800',
    info:    'text-blue-800',
    neutral: 'text-slate-800',
  }
  return (
    <div className={`notice ${variants[type]}`}>
      {icon && <span className={`material-symbols-outlined text-xl mt-0.5 shrink-0 ${iconColors[type]}`}>{icon}</span>}
      <div>
        {title && <p className={`text-label-md uppercase tracking-wider ${titleColors[type]}`}>{title}</p>}
        <div className="text-body-sm mt-0.5">{children}</div>
      </div>
    </div>
  )
}

// ─── MsgBox ──────────────────────────────────────────────────────────────────
export function MsgBox({ msg, type = 'error' }) {
  if (!msg) return null
  const variants = {
    error:   'bg-red-50 border-red-300 text-red-700',
    success: 'bg-green-50 border-green-300 text-green-700',
    warning: 'bg-amber-50 border-amber-300 text-amber-700',
    info:    'bg-blue-50 border-blue-300 text-blue-700',
  }
  return (
    <div className={`border px-4 py-3 text-body-sm mb-4 ${variants[type]}`}>
      {msg}
    </div>
  )
}

// ─── EmptyState ──────────────────────────────────────────────────────────────
export function EmptyState({ title, subtitle, icon }) {
  return (
    <div className="text-center py-16 px-4">
      {icon && <div className="text-4xl mb-4">{icon}</div>}
      <p className="text-label-md uppercase tracking-widest text-on-surface-variant">{title}</p>
      {subtitle && <p className="text-body-sm text-slate-400 mt-2">{subtitle}</p>}
    </div>
  )
}

// ─── Badge ───────────────────────────────────────────────────────────────────
export function Badge({ text, variant = 'draft' }) {
  const map = {
    draft:    'badge-draft',
    active:   'badge-active',
    pending:  'badge-pending',
    blocked:  'badge-blocked',
    approved: 'badge-approved',
  }
  return <span className={`badge ${map[variant] || 'badge-draft'}`}>{text}</span>
}

// ─── Authority Badge ──────────────────────────────────────────────────────────
export function AuthorityBadge({ source }) {
  if (!source) return null
  return (
    <span className={`badge text-mono ${source === 'direct' ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-700'}`}>
      {source === 'direct' ? 'Direct' : 'Delegated'}
    </span>
  )
}

// ─── Page Header ─────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex justify-between items-start mb-6">
      <div>
        <h2 className="text-headline-md font-bold text-on-surface">{title}</h2>
        {subtitle && <p className="text-body-sm text-on-surface-variant mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

// ─── Card ────────────────────────────────────────────────────────────────────
export function Card({ title, subtitle, action, children, className = '' }) {
  return (
    <div className={`card mb-4 ${className}`}>
      {(title || action) && (
        <div className="card-header">
          <div>
            {title && <h3 className="text-label-md uppercase tracking-widest text-on-surface-variant">{title}</h3>}
            {subtitle && <p className="text-body-sm text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

// ─── Field ───────────────────────────────────────────────────────────────────
export function Field({ label, required, hint, children }) {
  return (
    <div className="field">
      {label && (
        <label className="label">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

// ─── Input ───────────────────────────────────────────────────────────────────
export function Input({ value, onChange, placeholder, type = 'text', disabled, className = '' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`input ${disabled ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''} ${className}`}
    />
  )
}

// ─── Select ──────────────────────────────────────────────────────────────────
export function Select({ value, onChange, options = [], disabled, className = '' }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className={`input ${disabled ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''} ${className}`}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

// ─── Textarea ────────────────────────────────────────────────────────────────
export function Textarea({ value, onChange, placeholder, rows = 4, className = '' }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`input resize-none ${className}`}
    />
  )
}

// ─── ButtonRow ───────────────────────────────────────────────────────────────
export function ButtonRow({ children }) {
  return <div className="flex gap-2 justify-end mt-4">{children}</div>
}

// ─── Modal ───────────────────────────────────────────────────────────────────
export function Modal({ title, subtitle, onClose, children, maxWidth = '480px' }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full shadow-modal" style={{ maxWidth }}>
        <div className="flex justify-between items-start p-5 border-b border-outline-variant">
          <div>
            <h3 className="text-headline-sm font-bold text-on-surface">{title}</h3>
            {subtitle && <p className="text-body-sm text-on-surface-variant mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none ml-4">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
export function ConfirmDialog({ title, message, onConfirm, onCancel, confirmLabel = 'Confirm', danger = false }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm shadow-modal">
        <div className="p-5 border-b border-outline-variant">
          <h3 className="text-headline-sm font-bold text-on-surface">{title}</h3>
        </div>
        <div className="p-5">
          <p className="text-body-md text-on-surface-variant mb-5">{message}</p>
          <div className="flex gap-2 justify-end">
            <button onClick={onCancel} className="btn-secondary">Cancel</button>
            <button onClick={onConfirm} className={danger ? 'btn-danger' : 'btn-primary'}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── AppShell ─────────────────────────────────────────────────────────────────
export function AppShell({ header, sidebar, children }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {header}
      <div className="flex flex-1 overflow-hidden">
        {sidebar && (
          <aside className="hidden md:flex flex-col w-56 border-r border-outline-variant bg-slate-50 py-4 px-3 shrink-0">
            {sidebar}
          </aside>
        )}
        <main className="flex-1 overflow-y-auto p-margin">
          {children}
        </main>
      </div>
    </div>
  )
}

// ─── TopBar ──────────────────────────────────────────────────────────────────
export function TopBar({ appName, section, right }) {
  return (
    <header className="bg-white border-b border-outline-variant flex justify-between items-center w-full px-6 h-14 sticky top-0 z-50 shrink-0">
      <div className="flex items-center gap-4">
        <span className="font-extrabold text-lg tracking-tighter text-on-surface">Studox OS</span>
        {section && (
          <>
            <div className="h-4 w-px bg-slate-200" />
            <span className="text-label-md uppercase tracking-widest text-on-surface-variant">{section}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">{right}</div>
    </header>
  )
}

// ─── SidebarSection ──────────────────────────────────────────────────────────
export function SidebarSection({ label, children }) {
  return (
    <div className="mb-4">
      {label && <p className="text-[10px] uppercase tracking-widest text-slate-400 px-3 mb-1">{label}</p>}
      <nav className="space-y-0.5">{children}</nav>
    </div>
  )
}

// ─── NavItem ─────────────────────────────────────────────────────────────────
export function NavItem({ icon, label, active, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left ${active ? 'nav-item-active' : 'nav-item'}`}
    >
      {icon && <span className="material-symbols-outlined text-base shrink-0">{icon}</span>}
      <span className="flex-1">{label}</span>
      {badge != null && (
        <span className="text-[10px] bg-primary-container text-white px-1.5 py-0.5 rounded-full font-bold">{badge}</span>
      )}
    </button>
  )
}

// ─── SidebarHeader ───────────────────────────────────────────────────────────
export function SidebarHeader({ module, role }) {
  return (
    <div className="px-2 pb-4 mb-3 border-b border-outline-variant">
      <div className="font-bold text-xs text-on-surface uppercase tracking-widest">{module}</div>
      {role && <div className="text-[10px] text-slate-400 uppercase tracking-tighter mt-0.5">{role}</div>}
    </div>
  )
}

// ─── AuthorityContext display ─────────────────────────────────────────────────
export function AuthorityTag({ officeName, source }) {
  if (!officeName) return null
  return (
    <div className="px-2 pt-4 border-t border-outline-variant mt-auto">
      <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Acting As</div>
      <div className="text-xs font-bold text-on-surface">{officeName}</div>
      <div className={`text-[10px] mt-0.5 ${source === 'delegated' ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>
        {source === 'delegated' ? '⚠ Delegated authority' : 'Direct assignment'}
      </div>
    </div>
  )
}

// ─── Table ───────────────────────────────────────────────────────────────────
export function Table({ columns = [], rows = [], emptyText = 'No records' }) {
  if (rows.length === 0) return <EmptyState title={emptyText} />
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((col, j) => (
                <td key={j}>{col.render ? col.render(row) : row[col.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
