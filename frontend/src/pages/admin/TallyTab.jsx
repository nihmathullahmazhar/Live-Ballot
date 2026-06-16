import { useEffect, useState, useCallback } from 'react'
import { Spinner } from '../../components/ui'
import { adminGetTally, subscribeElection } from '../../lib/api'
import { downloadCSV } from '../../lib/csv'
import { RefreshCw, Download, Crown } from 'lucide-react'

export default function TallyTab({ code, password, settings, electionId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [animed, setAnimed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await adminGetTally(code, password)) } catch { /* handled */ }
    finally { setLoading(false) }
  }, [code, password])

  useEffect(() => { load() }, [load])

  // trigger bar animation shortly after data lands
  useEffect(() => {
    if (!data) return
    setAnimed(false)
    const t = setTimeout(() => setAnimed(true), 80)
    return () => clearTimeout(t)
  }, [data])

  // live refresh on new votes
  useEffect(() => {
    if (!electionId) return
    const unsub = subscribeElection('votes', electionId, () => load())
    return () => unsub()
  }, [electionId, load])

  if (loading && !data) return <div className="card p-8"><Spinner label="Counting…" /></div>
  if (!data) return <div className="card p-6 text-faint">No tally available.</div>

  function exportCsv() {
    const rows = []
    ;(data.positions || []).forEach((p) => (p.candidates || []).forEach((c) =>
      rows.push({ position: p.title, candidate: c.name, provisional: c.provisional, verified: c.verified })))
    downloadCSV(`${code}-results`, rows,
      [{ key: 'position', label: 'Position' }, { key: 'candidate', label: 'Candidate' },
       { key: 'provisional', label: 'Provisional' }, { key: 'verified', label: 'Verified (counted)' }])
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="section-title">Results</h2>
          <p className="text-sm text-muted mt-0.5">
            Turnout: <span className="font-semibold text-ink">{data.turnout}</span> voter{data.turnout === 1 ? '' : 's'}
            {settings.results_mode === 'hidden' && <span className="ml-2 pill pill-pending">results hidden from voters</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>
          <button className="btn btn-sm" onClick={exportCsv}><Download size={14} /> Export CSV</button>
        </div>
      </div>

      {(data.positions || []).map((p) => {
        const cands = [...(p.candidates || [])].sort((a, b) => (b.verified || 0) - (a.verified || 0))
        const max = Math.max(1, ...cands.map((c) => c.verified || 0))
        const totalForPos = cands.reduce((s, c) => s + (c.verified || 0), 0)
        const seats = Math.max(1, p.max_winners || 1)
        return (
          <div key={p.id} className="card p-5">
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="font-display font-800 text-lg uppercase">{p.title}</h3>
              <span className="font-mono text-xs text-faint">
                {seats > 1 ? `${seats} seats` : '1 seat'} · {totalForPos} vote{totalForPos === 1 ? '' : 's'}
              </span>
            </div>
            <div className="space-y-3.5">
              {cands.length === 0 && <p className="text-sm text-faint">No candidates.</p>}
              {cands.map((c, i) => {
                const pct = max > 0 ? Math.round(((c.verified || 0) / max) * 100) : 0
                const sharePct = totalForPos > 0 ? Math.round(((c.verified || 0) / totalForPos) * 100) : 0
                const isLeading = i < seats && (c.verified || 0) > 0
                return (
                  <div key={c.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {isLeading && <Crown size={15} style={{ color: 'var(--green)' }} className="shrink-0" />}
                        <span className={`font-medium truncate ${isLeading ? '' : 'text-muted'}`}>{c.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 font-mono text-sm">
                        <span className={isLeading ? 'font-bold' : 'text-muted'} style={isLeading ? { color: 'var(--green)' } : {}}>
                          {c.verified}
                        </span>
                        <span className="text-faint text-xs">({sharePct}%)</span>
                      </div>
                    </div>
                    <div className="tally-track">
                      <div className={`tally-fill ${isLeading ? 'tally-fill-win' : ''}`}
                           style={{ width: animed ? `${pct}%` : '0%' }} />
                    </div>
                    {c.provisional !== c.verified && (
                      <div className="text-xs text-faint mt-1 font-mono">
                        {c.provisional} provisional · {c.verified} counted
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="card p-5">
        <div className="eyebrow">Ballot detail</div>
        {settings.admin_can_see_votes ? (
          <BallotList ballots={data.ballots || []} positions={data.positions || []} />
        ) : (
          <p className="text-sm text-muted mt-2">
            This is a secret ballot — individual choices are hidden. You can see who
            voted under <span className="font-semibold">Voters</span>, but not how.
          </p>
        )}
      </div>
    </div>
  )
}

function BallotList({ ballots, positions }) {
  const candName = {}
  positions.forEach((p) => (p.candidates || []).forEach((c) => { candName[c.id] = c.name }))
  if (ballots.length === 0) return <p className="text-faint text-sm mt-2">No votes yet.</p>
  return (
    <div className="mt-3 space-y-2 text-sm font-mono max-h-96 overflow-auto">
      {ballots.map((b) => (
        <div key={b.registration_id} className="border rounded-lg bg-white px-3 py-2" style={{ borderColor: 'var(--line)' }}>
          <span className="font-bold">{b.voter || b.voter_code || b.admission_number || '—'}</span>
          <span className="text-faint"> → </span>
          {(b.choices || []).map((ch, i) => (
            <span key={i} className={ch.is_counted ? '' : 'line-through text-ballot'}>
              {candName[ch.candidate_id] || '?'}{i < b.choices.length - 1 ? ', ' : ''}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}