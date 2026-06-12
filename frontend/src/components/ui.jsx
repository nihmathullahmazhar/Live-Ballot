export function Stamp({ kind = 'pending', children }) {
  const color = {
    approved: 'text-verify',
    verified: 'text-verify',
    rejected: 'text-ballot',
    pending: 'text-faint',
    sealed: 'text-violet',
    voted: 'text-violet',
  }[kind] || 'text-faint'
  return <span className={`stamp ${color}`}>{children || kind}</span>
}

export function Rule({ className = '' }) {
  return (
    <div className={`my-4 ${className}`} aria-hidden="true">
      <div className="border-t-2 border-rule" />
      <div className="border-t-2 border-rule mt-1" />
    </div>
  )
}

export function Eyebrow({ children, className = '' }) {
  return <div className={`eyebrow ${className}`}>{children}</div>
}

export function Spinner({ label = 'Working…' }) {
  return (
    <div className="flex items-center gap-2 text-faint font-mono text-sm">
      <span className="inline-block h-3 w-3 animate-spin border-2 border-rule border-t-transparent rounded-full" />
      {label}
    </div>
  )
}
