import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { Spinner } from '../components/ui'
import { getResults } from '../lib/api'
import { Crown } from 'lucide-react'

export default function ResultsPage() {
  const { code } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    (async () => {
      try { setData(await getResults(code)) }
      catch (e) { setError(e.message) }
      finally { setLoading(false) }
    })()
  }, [code])

  // trigger bar animation shortly after data renders
  useEffect(() => {
    if (data) { const t = setTimeout(() => setRevealed(true), 150); return () => clearTimeout(t) }
  }, [data])

  if (loading) return <Layout code={code} back><div className="card p-8"><Spinner label="Loading results…" /></div></Layout>
  if (error) return (
    <Layout code={code} back>
      <div className="card p-8 text-center vb-fade">
        <p className="text-xl font-extrabold vb-gradient-text">Results aren’t available</p>
        <p className="text-faint mt-2 font-mono text-sm">{error}</p>
        <Link to={`/e/${code}`} className="btn mt-5 inline-block">Back to ballot</Link>
      </div>
    </Layout>
  )

  return (
    <Layout code={code} back>
      <div className="card vb-glass p-6 vb-rise" style={{ '--i': 0 }}>
        <div className="text-xs font-mono uppercase tracking-widest text-muted">Certified results</div>
        <h1 className="text-3xl sm:text-4xl font-extrabold mt-2 vb-gradient-text">{data.title}</h1>
        <div className="vb-accent-bar mt-3" />
      </div>

      {(data.positions || []).map((p, idx) => {
        const maxWinners = Math.max(1, p.max_winners || 1)
        const sorted = [...(p.candidates || [])].sort((a, b) => Number(b.votes || 0) - Number(a.votes || 0))
        const total = sorted.reduce((s, c) => s + Number(c.votes || 0), 0)
        return (
          <div key={p.id} className="card vb-glass p-6 mt-5 vb-rise" style={{ '--i': idx + 1 }}>
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="text-2xl font-extrabold uppercase">{p.title}</h2>
              <span className="pill pill-candidate">{maxWinners > 1 ? `Top ${maxWinners} win` : '1 seat'}</span>
            </div>
            <div className="vb-accent-bar mt-2" style={{ width: 40, opacity: .7 }} />

            <div className="mt-5 space-y-4">
              {sorted.map((c, rank) => {
                const v = Number(c.votes || 0)
                const pct = total ? Math.round((v / total) * 100) : 0
                const isWinner = rank < maxWinners && v > 0
                return (
                  <div key={c.id}>
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="font-bold flex items-center gap-2" style={{ color: isWinner ? 'var(--violet)' : 'var(--ink)' }}>
                        {isWinner && <Crown size={16} style={{ color: '#B8902B' }} />}
                        {c.name}
                        {isWinner && <span className="pill pill-approved" style={{ fontSize: 10 }}>WINNER</span>}
                      </span>
                      <span className="font-mono text-sm tabular-nums" style={{ color: 'var(--muted)' }}>{v} · {pct}%</span>
                    </div>
                    <div className="vb-res-track mt-1.5">
                      <div className={`vb-res-fill ${isWinner ? 'vb-res-win' : ''}`}
                        style={{ width: revealed ? `${pct}%` : '0%', transitionDelay: `${rank * 90}ms` }} />
                    </div>
                  </div>
                )
              })}
              {sorted.length === 0 && <p className="text-faint text-sm">No candidates.</p>}
            </div>
            <p className="text-xs font-mono uppercase tracking-wide text-muted mt-4">{total} vote{total === 1 ? '' : 's'} for this position</p>
          </div>
        )
      })}
      <div className="mt-6"><Link to={`/e/${code}`} className="btn">Back to ballot</Link></div>
      <div className="h-8" />
    </Layout>
  )
}