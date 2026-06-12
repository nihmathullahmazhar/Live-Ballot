import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { Eyebrow, Rule, Spinner } from '../components/ui'
import { getResults } from '../lib/api'

export default function ResultsPage() {
  const { code } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try { setData(await getResults(code)) }
      catch (e) { setError(e.message) }
      finally { setLoading(false) }
    })()
  }, [code])

  if (loading) return <Layout code={code}><div className="panel p-8"><Spinner label="Loading results…" /></div></Layout>
  if (error) return (
    <Layout code={code}>
      <div className="panel p-8 text-center">
        <p className="font-display font-700 uppercase text-violet text-xl">Results aren’t available</p>
        <p className="text-faint mt-2 font-mono text-sm">{error}</p>
        <Link to={`/e/${code}`} className="btn mt-5 inline-block">Back to ballot</Link>
      </div>
    </Layout>
  )

  return (
    <Layout code={code}>
      <div className="panel p-6">
        <Eyebrow>Certified results</Eyebrow>
        <h1 className="font-display font-900 text-4xl uppercase mt-2">{data.title}</h1>
      </div>

      {(data.positions || []).map((p) => {
        const total = (p.candidates || []).reduce((s, c) => s + Number(c.votes || 0), 0)
        const top = Math.max(0, ...(p.candidates || []).map((c) => Number(c.votes || 0)))
        return (
          <div key={p.id} className="panel p-6 mt-5">
            <h2 className="font-display font-800 text-2xl uppercase">{p.title}</h2>
            <Rule />
            <div className="space-y-3">
              {(p.candidates || []).map((c) => {
                const v = Number(c.votes || 0)
                const pct = total ? Math.round((v / total) * 100) : 0
                const winner = v === top && v > 0
                return (
                  <div key={c.id}>
                    <div className="flex justify-between items-baseline">
                      <span className={`font-display font-700 ${winner ? 'text-violet' : ''}`}>
                        {c.name} {winner && <span className="stamp text-violet ml-2 text-xs">Lead</span>}
                      </span>
                      <span className="font-mono text-sm">{v} · {pct}%</span>
                    </div>
                    <div className="h-3 border-2 border-rule mt-1 bg-white">
                      <div className={`h-full ${winner ? 'bg-violet' : 'bg-rule'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="eyebrow mt-3">{total} vote{total === 1 ? '' : 's'} for this seat</p>
          </div>
        )
      })}
      <div className="mt-6"><Link to={`/e/${code}`} className="btn">Back to ballot</Link></div>
    </Layout>
  )
}
