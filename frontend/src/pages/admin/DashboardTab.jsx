import { useEffect, useState, useCallback } from 'react'
import { Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { adminGetResponses, adminGetVoters, adminGetBallot, subscribeElection } from '../../lib/api'
import {
  Inbox, Users, KeyRound, UserCheck, ListChecks, CheckCircle2,
  Vote, RefreshCw, Megaphone,
} from 'lucide-react'

export default function DashboardTab({ code, password, title, settings, electionId, goTo }) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [resp, setResp] = useState([])
  const [voters, setVoters] = useState([])
  const [positions, setPositions] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, v, b] = await Promise.all([
        adminGetResponses(code, password).catch(() => []),
        adminGetVoters(code, password).catch(() => []),
        adminGetBallot(code, password).catch(() => []),
      ])
      setResp(r || []); setVoters(v || []); setPositions(b || [])
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }, [code, password, toast])
  useEffect(() => { load() }, [load])

  // live refresh on new responses
  useEffect(() => {
    if (!electionId) return
    const unsub = subscribeElection('intake_responses', electionId, () => load())
    return () => unsub()
  }, [electionId, load])

  if (loading) return <div className="card p-8"><Spinner label="Loading overview…" /></div>

  const totalResponses = resp.length
  const issued = voters.filter((v) => v.voter_code).length
  const voted = voters.filter((v) => v.has_voted).length
  const allCandidates = positions.flatMap((p) => p.candidates || [])
  const approvedCands = allCandidates.filter((c) => c.status === 'approved').length
  const pendingCands = allCandidates.filter((c) => c.status === 'pending').length
  const totalVotes = positions.reduce((s, p) =>
    s + (p.candidates || []).reduce((a, c) => a + (c.votes || 0), 0), 0)
  const turnout = issued > 0 ? Math.round((voted / issued) * 100) : 0

  const stats = [
    { icon: Inbox,      label: 'Form responses',   value: totalResponses, tone: 'violet', to: 'responses' },
    { icon: KeyRound,   label: 'Codes issued',     value: issued,         tone: 'violet', to: 'voters' },
    { icon: Users,      label: 'Voters',           value: voters.length,  tone: 'violet', to: 'voters' },
    { icon: Vote,       label: 'Have voted',        value: voted,         tone: 'green',  to: 'voters' },
    { icon: ListChecks, label: 'Positions',        value: positions.length, tone: 'violet', to: 'ballot' },
    { icon: UserCheck,  label: 'Approved candidates', value: approvedCands, tone: 'green', to: 'ballot' },
    { icon: CheckCircle2, label: 'Pending candidates', value: pendingCands, tone: 'amber', to: 'responses' },
    { icon: Vote,       label: 'Votes cast',       value: totalVotes,     tone: 'green',  to: 'tally' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">Overview</h2>
          <p className="text-sm text-muted mt-0.5">Live snapshot of {title || 'this election'}.</p>
        </div>
        <button className="btn btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>
      </div>

      {/* stat grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <button key={s.label} className="stat-card text-left"
            onClick={() => goTo?.(s.to)} title={`Go to ${s.to}`}>
            <s.icon size={18} style={{ color: `var(--${s.tone})` }} />
            <div className="stat-num count-anim mt-2" style={{ color: `var(--${s.tone})` }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </button>
        ))}
      </div>

      {/* turnout */}
      {issued > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Turnout</div>
            <div className="font-mono text-sm text-muted">{voted} / {issued} · {turnout}%</div>
          </div>
          <div className="tally-track"><div className="tally-fill" style={{ width: `${turnout}%` }} /></div>
        </div>
      )}

      {/* per-position candidate counts */}
      <div className="card p-5">
        <div className="font-semibold mb-3">Positions & candidates</div>
        {positions.length === 0 ? (
          <p className="text-sm text-muted">No positions yet. Add them in the Ballot tab.</p>
        ) : (
          <div className="space-y-2.5">
            {positions.map((p) => {
              const cs = (p.candidates || [])
              const appr = cs.filter((c) => c.status === 'approved').length
              return (
                <button key={p.id} onClick={() => goTo?.('ballot')}
                  className="w-full flex items-center justify-between py-2 border-b last:border-0 text-left hover:opacity-70 transition" style={{ borderColor: 'var(--line)' }}>
                  <div className="font-medium">{p.title}
                    <span className="text-faint font-mono text-xs ml-2">{p.max_winners > 1 ? `${p.max_winners} seats` : '1 seat'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="pill pill-approved">{appr} approved</span>
                    {cs.length - appr > 0 && <span className="pill pill-pending">{cs.length - appr} pending</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* status hint */}
      {!settings?.is_finalized && (
        <div className="card p-4 flex items-start gap-3" style={{ background: 'var(--amber-bg)', borderColor: '#eedcc0' }}>
          <Megaphone size={18} style={{ color: 'var(--amber)' }} className="mt-0.5 shrink-0" />
          <div className="text-sm text-muted">
            <span className="font-semibold" style={{ color: 'var(--amber)' }}>Not finalized yet.</span>{' '}
            When you've approved candidates and issued codes, head to <b>Controls</b> to finalize and open voting.
          </div>
        </div>
      )}
    </div>
  )
}