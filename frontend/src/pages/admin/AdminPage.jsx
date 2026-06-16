import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import InkX from '../../components/InkX'
import { Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { adminLogin, adminLogSession } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { rememberElection } from '../../lib/localElections'
import TallyTab from './TallyTab'
import VotersTab from './VotersTab'
import BallotTab from './BallotTab'
import FormBuilderTab from './FormBuilderTab'
import ResponsesTab from './ResponsesTab'
import ActivityTab from './ActivityTab'
import ControlsTab from './ControlsTab'
import PostersTab from './PostersTab'
import DashboardTab from './DashboardTab'
import {
  LayoutDashboard, FileText, ListChecks, Inbox, Users, BarChart3,
  Image as ImageIcon, Activity, Settings, ChevronLeft, Menu, X,
} from 'lucide-react'

const TABS = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['form',      'Form',      FileText],
  ['ballot',    'Ballot',    ListChecks],
  ['responses', 'Responses', Inbox],
  ['voters',    'Voters',    Users],
  ['tally',     'Tally',     BarChart3],
  ['posters',   'Posters',   ImageIcon],
  ['activity',  'Activity',  Activity],
  ['controls',  'Controls',  Settings],
]

export default function AdminPage() {
  const { code } = useParams()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [auth, setAuth] = useState(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('dashboard')
  const [checking, setChecking] = useState(true)
  const [ownerMode, setOwnerMode] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          const settings = await adminLogin(code, '')
          if (live) { setAuth(settings); setOwnerMode(true); rememberElection(settings.code, settings.title) }
        }
      } catch { /* not owner */ }
      finally { if (live) setChecking(false) }
    })()
    return () => { live = false }
  }, [code])

  async function login(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const settings = await adminLogin(code, password)
      const lsKey = `lb:delegate-name:${code}`
      let name = localStorage.getItem(lsKey)
      if (!name) {
        name = window.prompt('Your name (so the organiser knows who made changes):')
        if (name) name = name.trim()
        if (name) localStorage.setItem(lsKey, name)
      }
      if (name) { try { await adminLogSession(code, password, name) } catch (_) {} }
      setAuth(settings)
      rememberElection(settings.code, settings.title)
      toast(name ? `Welcome, ${name}` : 'Welcome, committee', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  if (checking) {
    return <div className="min-h-full grid place-items-center p-8"><Spinner label="Opening admin…" /></div>
  }

  if (!auth) {
    return (
      <div className="min-h-full grid place-items-center p-4">
        <div className="card p-8 max-w-md w-full">
          <div className="text-violet"><InkX size={34} /></div>
          <div className="eyebrow mt-3">Committee access</div>
          <h1 className="section-title mt-1">Admin panel</h1>
          <p className="text-muted text-sm mt-2">
            Election {code}. If the organiser shared a password for this election, enter it below.
          </p>
          <form onSubmit={login} className="mt-5 flex gap-2">
            <input className="input font-mono" type="password" autoFocus
              placeholder="shared password" value={password}
              onChange={(e) => setPassword(e.target.value)} />
            <button className="btn btn-primary" disabled={busy}>{busy ? '…' : 'Enter'}</button>
          </form>
          <p className="text-xs text-faint mt-3">
            Are you the organiser? <Link to="/auth" className="text-violet underline underline-offset-4">Log in</Link> and
            open it from your dashboard — no password needed.
          </p>
          <Link to={`/e/${code}`} className="text-sm text-faint underline underline-offset-4 mt-4 inline-block">
            Back to ballot
          </Link>
        </div>
      </div>
    )
  }

  const ctx = {
    code, password, settings: auth, toast,
    electionId: auth?.election_id,
    title: auth?.title,
    whatsappTemplate: auth?.whatsapp_template,
    maxNomineePositions: auth?.max_nominee_positions,
    onSettingsChange: (patch) => setAuth((a) => ({ ...a, ...patch })),
  }

  const activeLabel = TABS.find(([id]) => id === tab)?.[1] || ''

  const NavList = ({ onPick }) => (
    <nav className="space-y-1">
      {TABS.map(([id, label, Icon]) => (
        <button key={id}
          onClick={() => { setTab(id); onPick?.() }}
          className={`nav-item ${tab === id ? 'nav-item-active' : ''}`}>
          <Icon size={17} /> {label}
        </button>
      ))}
    </nav>
  )

  return (
    <div className="min-h-full" style={{ background: 'var(--bg)' }}>
      <div className="mx-auto max-w-[1180px] flex">
        {/* ---------- Desktop sidebar ---------- */}
        <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 h-screen sticky top-0 border-r" style={{ borderColor: 'var(--line)' }}>
          <Link to="/" className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
            <span className="text-ballot"><InkX size={24} /></span>
            <span>
              <span className="block font-display font-900 text-lg leading-none uppercase tracking-tight">Live Ballot</span>
              <span className="block eyebrow text-[0.58rem]">by NWS Digital</span>
            </span>
          </Link>
          <div className="px-3 py-4 flex-1 overflow-y-auto">
            <NavList />
          </div>
          <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--line)' }}>
            <Link to="/dashboard" className="text-sm text-muted hover:text-ink flex items-center gap-2">
              <ChevronLeft size={15} /> Dashboard
            </Link>
          </div>
        </aside>

        {/* ---------- Main column ---------- */}
        <div className="flex-1 min-w-0">
          {/* top bar */}
          <header className="sticky top-0 z-20 backdrop-blur border-b" style={{ borderColor: 'var(--line)', background: '#faf6ecd9' }}>
            <div className="px-4 sm:px-6 py-3 flex items-center gap-3">
              {/* mobile menu button */}
              <button className="lg:hidden icon-btn" onClick={() => setNavOpen(true)} title="Menu"><Menu size={18} /></button>
              <div className="min-w-0 flex-1">
                <div className="eyebrow truncate">Committee · {auth.phase} · {activeLabel}</div>
                <h1 className="section-title truncate leading-tight">{auth.title}</h1>
              </div>
              <span className="font-mono text-xs border px-2.5 py-1 rounded-lg shrink-0"
                    style={{ borderColor: 'var(--line-2)', background: 'var(--surface)' }}>{code}</span>
            </div>
            {/* status chips */}
            <div className="px-4 sm:px-6 pb-3 flex flex-wrap gap-2 text-xs">
              {ownerMode && <Chip tone="violet">Owner</Chip>}
              <Chip>{auth.voter_identity_method === 'generated_code' ? 'Code voting' : 'Admission no.'}</Chip>
              {auth.verified_mode && <Chip>Verified mode</Chip>}
              {auth.enable_self_nomination && <Chip>Self-nomination</Chip>}
              <Chip>Results: {auth.results_mode}</Chip>
              {auth.is_finalized
                ? <Chip tone="green">Finalized</Chip>
                : <Chip tone="amber">Not finalized</Chip>}
              {auth.is_paused && <Chip tone="red">Paused</Chip>}
            </div>
          </header>

          {/* content */}
          <main className="px-4 sm:px-6 py-6">
            {/* finalize hint (compact) */}
            {!auth.is_finalized && (
              <div className="card p-3 mb-5 text-sm flex items-start gap-2"
                   style={{ background: 'var(--amber-bg)', borderColor: '#eedcc0' }}>
                <span style={{ color: 'var(--amber)' }} className="font-semibold">Voting locked.</span>
                <span className="text-muted">Build the form, collect responses, issue codes & approve candidates, then finalize in <b>Controls</b>.</span>
              </div>
            )}
            {(auth.voting_open_at || auth.voting_close_at) && (
              <p className="mb-4 font-mono text-xs text-faint">
                Voting window: {fmt(auth.voting_open_at)} → {fmt(auth.voting_close_at)}
              </p>
            )}

            {tab === 'dashboard' && <DashboardTab {...ctx} goTo={setTab} />}
            {tab === 'tally' && <TallyTab {...ctx} />}
            {tab === 'form' && <FormBuilderTab {...ctx} />}
            {tab === 'ballot' && <BallotTab {...ctx} />}
            {tab === 'responses' && <ResponsesTab {...ctx} />}
            {tab === 'voters' && <VotersTab {...ctx} />}
            {tab === 'activity' && <ActivityTab {...ctx} />}
            {tab === 'posters' && <PostersTab {...ctx} />}
            {tab === 'controls' && <ControlsTab {...ctx} />}
            <div className="h-12" />
          </main>
        </div>
      </div>

      {/* ---------- Mobile nav drawer ---------- */}
      {navOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setNavOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white p-4 shadow-soft flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <span className="font-display font-900 uppercase">Menu</span>
              <button className="icon-btn" onClick={() => setNavOpen(false)}><X size={18} /></button>
            </div>
            <NavList onPick={() => setNavOpen(false)} />
            <div className="mt-auto pt-4 border-t" style={{ borderColor: 'var(--line)' }}>
              <Link to="/dashboard" className="text-sm text-muted flex items-center gap-2">
                <ChevronLeft size={15} /> Dashboard
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ children, tone }) {
  const map = {
    violet: { color: 'var(--violet)', background: 'var(--violet-bg)' },
    green:  { color: 'var(--green)',  background: 'var(--green-bg)' },
    amber:  { color: 'var(--amber)',  background: 'var(--amber-bg)' },
    red:    { color: 'var(--red)',    background: 'var(--red-bg)' },
  }[tone] || { color: 'var(--muted)', background: 'var(--surface)' }
  return (
    <span className="px-2.5 py-1 rounded-full font-medium border"
      style={{ ...map, borderColor: 'var(--line)' }}>{children}</span>
  )
}

function fmt(ts) {
  if (!ts) return 'not set'
  try { return new Date(ts).toLocaleString() } catch { return ts }
}