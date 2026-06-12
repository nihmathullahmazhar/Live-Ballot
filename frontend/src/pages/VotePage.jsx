import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import InkX from '../components/InkX'
import { Eyebrow, Rule, Spinner, Stamp } from '../components/ui'
import { useToast } from '../components/Toast'
import { getElectionPublic, castVote } from '../lib/api'

export default function VotePage() {
  const { code } = useParams()
  const toast = useToast()
  const [election, setElection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [choices, setChoices] = useState({}) // position_id -> candidate_id
  const [identity, setIdentity] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function load() {
    setLoading(true); setError('')
    try {
      const e = await getElectionPublic(code)
      if (!e) setError('No election found for this code.')
      else setElection(e)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [code])

  const isCode = election?.voter_identity_method === 'generated_code'
  const phase = election?.phase
  const canVote = phase === 'open' || phase === 'voting'

  function pick(positionId, candidateId) {
    setChoices((c) => ({ ...c, [positionId]: c[positionId] === candidateId ? undefined : candidateId }))
  }

  async function submit() {
    if (!identity.trim()) return toast(isCode ? 'Enter your code' : 'Enter your admission number', 'error')
    const votes = Object.entries(choices)
      .filter(([, cid]) => cid)
      .map(([position_id, candidate_id]) => ({ position_id, candidate_id }))
    if (votes.length === 0) return toast('Mark at least one candidate', 'error')

    setBusy(true)
    try {
      await castVote(code, identity.trim(), votes)
      setDone(true)
      toast('Vote recorded', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  if (loading) return <Layout code={code}><div className="panel p-8"><Spinner label="Loading ballot…" /></div></Layout>
  if (error) return (
    <Layout code={code}>
      <div className="panel p-8 text-center">
        <p className="text-ballot font-display font-700 text-xl uppercase">{error}</p>
        <Link to="/" className="btn mt-5 inline-block">Back to start</Link>
      </div>
    </Layout>
  )

  if (done) return (
    <Layout code={code}>
      <div className="panel p-10 text-center max-w-xl mx-auto">
        <div className="text-verify flex justify-center"><InkX size={64} /></div>
        <h1 className="font-display font-900 text-3xl uppercase mt-3">Ballot cast</h1>
        <p className="text-ink/70 mt-2">Your mark has been counted{isCode ? ' and your code is now used' : ''}.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to={`/e/${code}/results`} className="btn">See results page</Link>
          <Link to="/" className="btn btn-primary">Done</Link>
        </div>
      </div>
    </Layout>
  )

  return (
    <Layout code={code}>
      {/* Masthead */}
      <div className="panel p-6">
        <Eyebrow>Official ballot · {election.code}</Eyebrow>
        <h1 className="font-display font-900 text-4xl uppercase mt-2">{election.title}</h1>
        {election.description && <p className="text-ink/75 mt-2">{election.description}</p>}
        <div className="mt-3 flex flex-wrap gap-2 items-center text-sm">
          <PhaseBadge phase={phase} />
          {election.verified_mode && (
            <>
              <Link to={`/e/${code}/register`} className="underline underline-offset-4 hover:text-violet">Register to vote</Link>
              <span className="text-faint">·</span>
              <Link to={`/e/${code}/nominate`} className="underline underline-offset-4 hover:text-violet">Self-nominate</Link>
            </>
          )}
          <span className="text-faint">·</span>
          <Link to={`/e/${code}/request`} className="underline underline-offset-4 hover:text-violet">Request access</Link>
        </div>
      </div>

      {!canVote && (
        <div className="panel p-5 mt-5 border-violet">
          <p className="font-display font-700 uppercase">
            {phase === 'closed' ? 'Voting is closed.'
              : phase === 'nominations' ? 'Nominations are open — voting hasn’t started.'
              : phase === 'pre_voting' ? 'Nominations closed. Voting opens soon.'
              : 'Voting hasn’t opened yet.'}
          </p>
          {election.results_published && (
            <Link to={`/e/${code}/results`} className="btn mt-3 inline-block">View published results</Link>
          )}
        </div>
      )}

      {canVote && (
        <>
          {(election.positions || []).map((p, i) => (
            <div key={p.id} className="panel p-6 mt-5">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display font-800 text-2xl uppercase">{p.title}</h2>
                <span className="eyebrow">Seat {i + 1} · mark one</span>
              </div>
              <Rule />
              {(p.candidates || []).length === 0 && (
                <p className="text-faint font-mono text-sm">No candidates yet for this seat.</p>
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                {(p.candidates || []).map((c) => {
                  const selected = choices[p.id] === c.id
                  return (
                    <button key={c.id} type="button" onClick={() => pick(p.id, c.id)}
                      className={`text-left border-2 p-4 flex gap-3 items-start transition ${selected ? 'border-violet bg-white shadow-paper' : 'border-rule bg-white/50 hover:bg-white'}`}>
                      <span className={`h-9 w-9 shrink-0 border-2 border-rule grid place-items-center bg-white ${selected ? 'text-ballot' : 'text-transparent'}`}>
                        <InkX size={26} />
                      </span>
                      <span>
                        <span className="font-display font-700 text-lg leading-tight block">{c.name}</span>
                        {c.bio && <span className="text-sm text-ink/70">{c.bio}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Identity + submit */}
          <div className="panel p-6 mt-5">
            <Eyebrow>Confirm your identity</Eyebrow>
            <label className="block font-display font-700 uppercase mt-2 mb-1">
              {isCode ? 'Your voting code' : 'Your admission number'}
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                className="input font-mono tracking-widest sm:max-w-xs"
                placeholder={isCode ? 'e.g. 7K2M9QX4' : 'e.g. 54321'}
                value={identity}
                onChange={(e) => setIdentity(isCode ? e.target.value.toUpperCase() : e.target.value)}
              />
              <button className="btn btn-primary text-lg" disabled={busy} onClick={submit}>
                {busy ? 'Casting…' : 'Cast my vote'}
              </button>
            </div>
            {isCode && <p className="text-xs text-faint mt-2">Your code works once. After voting it can’t be reused.</p>}
          </div>
        </>
      )}
      <div className="h-8" />
    </Layout>
  )
}

function PhaseBadge({ phase }) {
  const map = {
    open: ['voted', 'Voting open'],
    voting: ['voted', 'Voting open'],
    nominations: ['pending', 'Nominations'],
    pre_voting: ['pending', 'Opening soon'],
    closed: ['sealed', 'Closed'],
    scheduled: ['pending', 'Scheduled'],
  }
  const [kind, label] = map[phase] || ['pending', phase || '—']
  return <Stamp kind={kind}>{label}</Stamp>
}
