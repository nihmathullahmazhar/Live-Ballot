import { useEffect, useState, useCallback } from 'react'
import { Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { adminGetResponses, adminGetVoters, adminGetBallot, subscribeElection } from '../../lib/api'
import {
  ListChecks, Clock3,
  Vote, RefreshCw, ArrowRight, CheckCircle2, AlertCircle,
} from 'lucide-react'

export default function DashboardTab({ code, password, title, settings, electionId, goTo }) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [resp, setResp] = useState([])
  const [voters, setVoters] = useState([])
  const [positions, setPositions] = useState([])

  const load = useCallback(async () => {
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

  useEffect(() => {
    if (!electionId) return
    const unsub = subscribeElection('intake_responses', electionId, () => load())
    return () => unsub()
  }, [electionId, load])

  if (loading) return <div className="card p-8"><Spinner label="Loading overview…" /></div>

  const totalResponses = resp.length
  const issued = voters.filter((v) => v.voter_code).length
  const voted = voters.filter((v) => v.has_voted).length
  const notVoted = issued - voted
  const allCandidates = positions.flatMap((p) => p.candidates || [])
  const approvedCands = allCandidates.filter((c) => c.status === 'approved').length
  const pendingCands = allCandidates.filter((c) => c.status === 'pending').length
  const totalVotes = positions.reduce((s, p) =>
    s + (p.candidates || []).reduce((a, c) => a + (c.votes || 0), 0), 0)
  const turnout = issued > 0 ? Math.round((voted / issued) * 100) : 0
  const finalized = settings?.is_finalized

  // headline metric: before finalize → registration; after → turnout
  const hero = finalized
    ? { label: 'Voter turnout', pct: turnout, sub: `${voted} of ${issued} voted`, tone: 'var(--violet)' }
    : { label: 'Codes issued', pct: totalResponses ? Math.round((issued / Math.max(totalResponses, issued)) * 100) : 0,
        sub: `${issued} codes · ${totalResponses} responses`, tone: 'var(--violet)' }

  // next-step guidance
  const steps = nextSteps({ totalResponses, issued, approvedCands, pendingCands, finalized, paused: settings?.is_paused, totalVotes })

  const stats = [
    { icon: Clock3,   label: 'Yet to vote',    value: notVoted < 0 ? 0 : notVoted, tone: 'amber', to: 'voters' },
    { icon: ListChecks, label: 'Positions',    value: positions.length, tone: 'violet', to: 'ballot' },
    { icon: AlertCircle, label: 'Pending review', value: pendingCands,  tone: 'amber',  to: 'responses' },
    { icon: Vote,     label: 'Votes cast',     value: totalVotes,     tone: 'green',  to: 'tally' },
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

      {/* HERO — the big numbers, front and center */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Form responses', value: totalResponses, to: 'responses', tone: 'var(--violet)' },
          { label: 'Codes issued',   value: issued,         to: 'voters',    tone: 'var(--violet)' },
          { label: finalized ? 'Have voted' : 'Approved candidates', value: finalized ? voted : approvedCands, to: finalized ? 'voters' : 'ballot', tone: 'var(--green)' },
        ].map((h, i) => (
          <button key={h.label} onClick={() => goTo?.(h.to)}
            className="card vb-glass p-6 text-left vb-rise" style={{ '--i': i, position: 'relative', overflow: 'hidden' }}>
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'radial-gradient(120% 120% at 100% 0%, rgba(110,69,222,.08), transparent 55%)' }} />
            <div style={{ position: 'relative' }}>
              <div className="text-5xl sm:text-6xl font-extrabold leading-none vb-gradient-text">{h.value}</div>
              <div className="text-sm text-muted mt-2 uppercase tracking-wide font-mono">{h.label}</div>
            </div>
          </button>
        ))}
      </div>

      {/* slim status + progress strip */}
      <div className="card p-4 vb-rise" style={{ '--i': 3 }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusChip finalized={finalized} paused={settings?.is_paused} />
            <span className="text-sm text-muted">{hero.label}: <b style={{ color: 'var(--ink)' }}>{hero.pct}%</b> · {hero.sub}</span>
          </div>
          {steps.length > 0 && (
            <button onClick={() => goTo?.(steps[0].to)} className="btn btn-sm btn-primary">
              {steps[0].cta} <ArrowRight size={14} />
            </button>
          )}
        </div>
        <div className="vb-turnout-track mt-3">
          <div className="vb-turnout-fill" style={{ width: `${Math.min(100, hero.pct)}%` }} />
        </div>
      </div>

      {/* checklist of what to do next */}
      {steps.length > 0 && (
        <div className="card p-5 vb-rise" style={{ '--i': 1 }}>
          <div className="font-semibold mb-3">Get to voting day</div>
          <div className="space-y-2">
            {steps.map((s) => (
              <button key={s.key} onClick={() => goTo?.(s.to)}
                className="w-full flex items-center gap-3 text-left rounded-lg px-3 py-2.5 transition hover:opacity-80"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                <span className="shrink-0 h-6 w-6 rounded-full grid place-items-center"
                  style={{ background: s.done ? 'var(--green-bg)' : 'var(--amber-bg)', color: s.done ? 'var(--green)' : 'var(--amber)' }}>
                  {s.done ? <CheckCircle2 size={15} /> : <span className="text-xs font-bold">{s.n}</span>}
                </span>
                <span className="flex-1 text-sm" style={{ color: s.done ? 'var(--muted)' : 'var(--ink)', textDecoration: s.done ? 'line-through' : 'none' }}>
                  {s.text}
                </span>
                {!s.done && <ArrowRight size={15} className="text-faint shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* stat grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s, i) => (
          <button key={s.label} className="stat-card text-left vb-rise" style={{ '--i': i + 2 }} onClick={() => goTo?.(s.to)} title={`Go to ${s.to}`}>
            <s.icon size={18} style={{ color: `var(--${s.tone})` }} />
            <div className="stat-num count-anim mt-2" style={{ color: `var(--${s.tone})` }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </button>
        ))}
      </div>

      {/* per-position breakdown */}
      <div className="card vb-glass p-5 vb-rise" style={{ '--i': 7 }}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">Positions &amp; candidates</div>
          <button className="btn btn-ghost btn-sm" onClick={() => goTo?.('ballot')}>Manage ballot →</button>
        </div>
        {positions.length === 0 ? (
          <p className="text-sm text-muted">No positions yet. Add them in the Ballot tab.</p>
        ) : (
          <div className="space-y-2.5">
            {positions.map((p) => {
              const cs = (p.candidates || [])
              const appr = cs.filter((c) => c.status === 'approved').length
              const pend = cs.length - appr
              return (
                <button key={p.id} onClick={() => goTo?.('ballot')}
                  className="w-full flex items-center justify-between py-2 border-b last:border-0 text-left hover:opacity-70 transition" style={{ borderColor: 'var(--line)' }}>
                  <div className="font-medium">{p.title}
                    <span className="text-faint font-mono text-xs ml-2">{p.max_winners > 1 ? `top ${p.max_winners} win` : '1 seat'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="pill pill-approved">{appr} approved</span>
                    {pend > 0 && <span className="pill pill-pending">{pend} pending</span>}
                    {appr === 0 && pend === 0 && <span className="pill pill-rejected">no candidates</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function nextSteps({ totalResponses, issued, approvedCands, pendingCands, finalized, paused, totalVotes }) {
  if (finalized && totalVotes > 0) return [] // voting underway, nothing to nag about
  const s = [
    { key: 'resp',  n: 1, text: `Collect form responses (${totalResponses} so far)`, done: totalResponses > 0, to: 'responses', cta: 'View responses' },
    { key: 'codes', n: 2, text: `Issue voter codes (${issued} issued)`, done: issued > 0, to: 'voters', cta: 'Issue codes' },
    { key: 'cands', n: 3, text: `Approve candidates (${approvedCands} approved${pendingCands ? `, ${pendingCands} pending` : ''})`, done: approvedCands > 0, to: 'ballot', cta: 'Review candidates' },
    { key: 'final', n: 4, text: finalized ? 'Finalized — voting can open' : 'Finalize the election in Controls', done: !!finalized, to: 'controls', cta: 'Finalize & open voting' },
  ]
  // top CTA = first incomplete step (so the hero button points to the right place)
  const firstPending = s.find((x) => !x.done)
  if (firstPending) s.unshift({ ...firstPending, _hero: true })
  return s.filter((x) => !x._hero) // checklist shows the 4 steps; hero reads steps[0] separately
}

function StatusChip({ finalized, paused }) {
  if (paused) return <span className="pill pill-rejected">Paused</span>
  if (finalized) return <span className="pill pill-approved">Live · voting open</span>
  return <span className="pill pill-pending">Setup · not finalized</span>
}