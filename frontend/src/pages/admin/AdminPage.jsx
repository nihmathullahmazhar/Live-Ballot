import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import InkX from '../../components/InkX'
import { Eyebrow } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { adminLogin } from '../../lib/api'
import TallyTab from './TallyTab'
import VotersTab from './VotersTab'
import RegistrationsTab from './RegistrationsTab'
import CandidatesTab from './CandidatesTab'
import IntakeTab from './IntakeTab'
import ControlsTab from './ControlsTab'

const TABS = [
  ['tally', 'Live tally'],
  ['voters', 'Voters & codes'],
  ['registrations', 'Registrations'],
  ['candidates', 'Nominations'],
  ['intake', 'Requests'],
  ['controls', 'Controls'],
]

export default function AdminPage() {
  const { code } = useParams()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [auth, setAuth] = useState(null)     // settings object after login
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('tally')

  async function login(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const settings = await adminLogin(code, password)
      setAuth(settings)
      toast('Welcome, committee', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  if (!auth) {
    return (
      <Layout code={code}>
        <div className="panel p-8 max-w-md mx-auto">
          <div className="text-violet"><InkX size={36} /></div>
          <Eyebrow>Committee access</Eyebrow>
          <h1 className="font-display font-900 text-3xl uppercase mt-1">Admin panel</h1>
          <p className="text-ink/70 text-sm mt-2">Election {code}. Enter the admin password.</p>
          <form onSubmit={login} className="mt-5 flex gap-2">
            <input className="input font-mono" type="password" autoFocus
              placeholder="admin password" value={password}
              onChange={(e) => setPassword(e.target.value)} />
            <button className="btn btn-primary" disabled={busy}>{busy ? '…' : 'Enter'}</button>
          </form>
          <Link to={`/e/${code}`} className="text-sm text-faint underline underline-offset-4 mt-4 inline-block">
            Back to ballot
          </Link>
        </div>
      </Layout>
    )
  }

  const ctx = { code, password, settings: auth, toast }

  return (
    <Layout code={code}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Eyebrow>Committee · {auth.phase}</Eyebrow>
          <h1 className="font-display font-900 text-3xl uppercase">{auth.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-mono">
          <Tag>{auth.voter_identity_method === 'generated_code' ? 'Code voting' : 'Admission no.'}</Tag>
          {auth.verified_mode && <Tag>Verified mode</Tag>}
          {auth.admin_can_see_votes && <Tag>Open ballot</Tag>}
          {auth.results_published && <Tag>Results live</Tag>}
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-5 flex flex-wrap gap-0 border-b-2 border-rule">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 font-display font-700 uppercase text-sm border-2 border-b-0 -mb-0.5 ${
              tab === id ? 'border-rule bg-paper' : 'border-transparent text-faint hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'tally' && <TallyTab {...ctx} />}
        {tab === 'voters' && <VotersTab {...ctx} />}
        {tab === 'registrations' && <RegistrationsTab {...ctx} />}
        {tab === 'candidates' && <CandidatesTab {...ctx} />}
        {tab === 'intake' && <IntakeTab {...ctx} />}
        {tab === 'controls' && <ControlsTab {...ctx} />}
      </div>
      <div className="h-10" />
    </Layout>
  )
}

function Tag({ children }) {
  return <span className="border-2 border-rule bg-white px-2 py-1">{children}</span>
}
