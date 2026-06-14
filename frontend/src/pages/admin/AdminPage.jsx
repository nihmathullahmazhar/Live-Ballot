import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import InkX from '../../components/InkX'
import { Eyebrow, Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { adminLogin } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { rememberElection } from '../../lib/localElections'
import TallyTab from './TallyTab'
import VotersTab from './VotersTab'
import BallotTab from './BallotTab'
import FormBuilderTab from './FormBuilderTab'
import ResponsesTab from './ResponsesTab'
import ActivityTab from './ActivityTab'
import ControlsTab from './ControlsTab'

const TABS = [
  ['form', 'Form'],
  ['ballot', 'Ballot'],
  ['responses', 'Responses'],
  ['voters', 'Voters'],
  ['tally', 'Tally'],
  ['activity', 'Activity'],
  ['controls', 'Controls'],
]

export default function AdminPage() {
  const { code } = useParams()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [auth, setAuth] = useState(null)     // settings object after login
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('form')
  const [checking, setChecking] = useState(true)
  const [ownerMode, setOwnerMode] = useState(false)

  // If the logged-in organiser owns this election, let them straight in
  // (no per-election password needed — the server verifies ownership).
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          const settings = await adminLogin(code, '')   // succeeds only for the owner
          if (live) { setAuth(settings); setOwnerMode(true); rememberElection(settings.code, settings.title) }
        }
      } catch { /* not the owner — fall through to the password gate */ }
      finally { if (live) setChecking(false) }
    })()
    return () => { live = false }
  }, [code])

  async function login(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const settings = await adminLogin(code, password)
      setAuth(settings)
      rememberElection(settings.code, settings.title)
      toast('Welcome, committee', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  if (checking) {
    return <Layout code={code} back="/dashboard"><div className="panel p-8 max-w-md mx-auto"><Spinner label="Opening admin…" /></div></Layout>
  }

  if (!auth) {
    return (
      <Layout code={code} back="/dashboard">
        <div className="panel p-8 max-w-md mx-auto">
          <div className="text-violet"><InkX size={36} /></div>
          <Eyebrow>Committee access</Eyebrow>
          <h1 className="font-display font-900 text-3xl uppercase mt-1">Admin panel</h1>
          <p className="text-ink/70 text-sm mt-2">
            Election {code}. If the organiser shared a password for this election, enter it below.
          </p>
          <form onSubmit={login} className="mt-5 flex gap-2">
            <input className="input font-mono" type="password" autoFocus
              placeholder="shared password" value={password}
              onChange={(e) => setPassword(e.target.value)} />
            <button className="btn btn-primary" disabled={busy}>{busy ? '…' : 'Enter'}</button>
          </form>
          <p className="text-xs text-faint mt-3">
            Are you the organiser? <Link to="/auth" className="underline underline-offset-4">Log in</Link> and
            open it from your dashboard — no password needed.
          </p>
          <Link to={`/e/${code}`} className="text-sm text-faint underline underline-offset-4 mt-4 inline-block">
            Back to ballot
          </Link>
        </div>
      </Layout>
    )
  }

  const ctx = {
    code, password, settings: auth, toast,
    onSettingsChange: (patch) => setAuth((a) => ({ ...a, ...patch })),
  }

  return (
    <Layout code={code} back="/dashboard">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Eyebrow>Committee · {auth.phase}</Eyebrow>
          <h1 className="font-display font-900 text-3xl uppercase">{auth.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-mono">
          {ownerMode && <span className="border-2 border-violet text-violet bg-white px-2 py-1">Owner</span>}
          <Tag>{auth.voter_identity_method === 'generated_code' ? 'Code voting' : 'Admission no.'}</Tag>
          {auth.verified_mode && <Tag>Verified mode</Tag>}
          {auth.enable_self_nomination && <Tag>Self-nomination</Tag>}
          {auth.admin_can_see_votes && <Tag>Open ballot</Tag>}
          <Tag>Results: {auth.results_mode}</Tag>
          {auth.is_paused && <span className="border-2 border-ballot text-ballot bg-white px-2 py-1">Paused</span>}
          {auth.registration_open === false && <span className="border-2 border-rule bg-white px-2 py-1">Reg closed</span>}
        </div>
      </div>

      {/* Voting window (shown in your local time) */}
      {(auth.voting_open_at || auth.voting_close_at) && (
        <p className="mt-2 font-mono text-xs text-faint">
          Voting window: {fmt(auth.voting_open_at)} → {fmt(auth.voting_close_at)}
        </p>
      )}

      {/* Finalization gate banner */}
      {!auth.is_finalized ? (
        <div className="panel p-4 mt-4 border-violet flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="font-display font-700 uppercase">Not finalized.</span>{' '}
            Voting stays locked until you finalize. Build the form, collect responses,
            issue codes and approve candidates first — then finalize in <b>Controls</b>.
          </p>
        </div>
      ) : (
        <div className="panel p-3 mt-4 border-verify text-sm">
          <span className="font-display font-700 uppercase text-verify">Finalized.</span>{' '}
          Voting can run within your time window.
        </div>
      )}

      {/* Tabs */}
      <div className="mt-5 flex flex-nowrap overflow-x-auto gap-0 border-b-2 border-rule -mx-4 px-4 sm:mx-0 sm:px-0">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`whitespace-nowrap px-3 sm:px-4 py-2 font-display font-700 uppercase text-xs sm:text-sm border-2 border-b-0 -mb-0.5 ${
              tab === id ? 'border-rule bg-paper' : 'border-transparent text-faint hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'tally' && <TallyTab {...ctx} />}
        {tab === 'form' && <FormBuilderTab {...ctx} />}
        {tab === 'ballot' && <BallotTab {...ctx} />}
        {tab === 'responses' && <ResponsesTab {...ctx} />}
        {tab === 'voters' && <VotersTab {...ctx} />}
        {tab === 'activity' && <ActivityTab {...ctx} />}
        {tab === 'controls' && <ControlsTab {...ctx} />}
      </div>
      <div className="h-10" />
    </Layout>
  )
}

function Tag({ children }) {
  return <span className="border-2 border-rule bg-white px-2 py-1">{children}</span>
}

function fmt(ts) {
  if (!ts) return 'not set'
  try { return new Date(ts).toLocaleString() } catch { return ts }
}