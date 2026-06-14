import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import InkX from './InkX'

export default function Layout({ children, code, back }) {
  const navigate = useNavigate()
  const goBack = () => {
    if (typeof back === 'string') navigate(back)
    else navigate(-1)
  }
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b-2 border-rule bg-paper">
        <div className="mx-auto max-w-5xl px-4 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {back && (
              <button onClick={goBack} title="Back"
                className="shrink-0 border-2 border-rule bg-white h-8 w-8 grid place-items-center hover:border-ink">
                <ChevronLeft size={18} />
              </button>
            )}
            <Link to="/" className="flex items-center gap-2 sm:gap-3 group min-w-0">
            <span className="text-ballot shrink-0"><InkX size={28} /></span>
            <span className="min-w-0">
              <span className="block font-display font-900 text-xl sm:text-2xl tracking-tight uppercase leading-none">
                Live&nbsp;Ballot
              </span>
              <span className="block eyebrow text-[0.6rem] sm:text-[0.7rem] truncate">
                by NWS Digital Services
              </span>
            </span>
          </Link>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {code && (
              <span className="font-mono text-xs sm:text-sm border-2 border-rule px-2 sm:px-3 py-1 bg-white">
                {code}
              </span>
            )}
          </div>
        </div>
        <div className="border-t-2 border-rule">
          <div className="border-t-2 border-rule mt-0.5" />
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</div>
      </main>

      <footer className="border-t-2 border-rule bg-paper">
        <div className="mx-auto max-w-5xl px-4 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <span className="eyebrow">Secret ballot · one vote per seat · sealed until close</span>
          <a
            href="https://nihmathullah.com"
            target="_blank" rel="noreferrer"
            className="flex items-center gap-3 border-2 border-rule bg-white px-3 py-2 hover:shadow-paper transition group w-fit"
          >
            <span className="grid place-items-center h-9 w-9 bg-violet text-white font-display font-900 text-xs shrink-0">
              NWS
            </span>
            <span className="leading-tight">
              <span className="block font-display font-800 uppercase text-sm tracking-wide group-hover:text-violet">
                Built by NWS Digital Services
              </span>
              <span className="block font-mono text-xs text-faint">nihmathullah.com</span>
            </span>
          </a>
        </div>
      </footer>
    </div>
  )
}