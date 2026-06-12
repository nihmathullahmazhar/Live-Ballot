import { Link } from 'react-router-dom'
import InkX from './InkX'

export default function Layout({ children, code }) {
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b-2 border-rule bg-paper">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <span className="text-ballot"><InkX size={30} /></span>
            <span className="font-display font-900 text-2xl tracking-tight uppercase">
              Live&nbsp;Ballot
            </span>
          </Link>
          {code && (
            <span className="font-mono text-sm border-2 border-rule px-3 py-1 bg-white">
              {code}
            </span>
          )}
        </div>
        <div className="border-t-2 border-rule">
          <div className="border-t-2 border-rule mt-0.5" />
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
      </main>

      <footer className="border-t-2 border-rule bg-paper">
        <div className="mx-auto max-w-5xl px-4 py-5 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="eyebrow">Official ballot · one mark per seat</span>
          <a
            href="https://nihmathullah.com"
            target="_blank" rel="noreferrer"
            className="font-mono text-faint hover:text-violet underline-offset-4 hover:underline"
          >
            NWS Digital Services
          </a>
        </div>
      </footer>
    </div>
  )
}
