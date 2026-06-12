import { useEffect, useState, useCallback } from 'react'
import { Rule, Spinner, Eyebrow } from '../../components/ui'
import { adminGetTally } from '../../lib/api'
import { RefreshCw } from 'lucide-react'

export default function TallyTab({ code, password, settings }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await adminGetTally(code, password)) } catch { /* toast handled elsewhere */ }
    finally { setLoading(false) }
  }, [code, password])

  useEffect(() => { load() }, [load])

  if (loading && !data) return <div className="panel p-6"><Spinner label="Counting…" /></div>
  if (!data) return <div className="panel p-6 text-faint">No tally available.</div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="font-mono text-sm">
          Turnout: <span className="font-bold">{data.turnout}</span> voter{data.turnout === 1 ? '' : 's'}
        </div>
        <button className="btn text-sm" onClick={load}>
          <RefreshCw size={14} className="inline -mt-1 mr-1" /> Refresh
        </button>
      </div>

      {(data.positions || []).map((p) => (
        <div key={p.id} className="panel p-6">
          <h3 className="font-display font-800 text-xl uppercase">{p.title}</h3>
          <Rule />
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left eyebrow">
                <th className="pb-2">Candidate</th>
                <th className="pb-2 text-right">Provisional</th>
                <th className="pb-2 text-right">Verified</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {(p.candidates || []).map((c) => (
                <tr key={c.id} className="border-t border-rule/40">
                  <td className="py-2 font-body">{c.name}</td>
                  <td className="py-2 text-right">{c.provisional}</td>
                  <td className="py-2 text-right text-verify font-bold">{c.verified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="panel p-5">
        <Eyebrow>Ballot detail</Eyebrow>
        {settings.admin_can_see_votes ? (
          <BallotList ballots={data.ballots || []} positions={data.positions || []} />
        ) : (
          <p className="text-sm text-ink/70 mt-2">
            This is a secret ballot — individual choices are hidden. You can see who
            voted under <span className="font-semibold">Voters &amp; codes</span>, but not
            how. (Set at creation.)
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
        <div key={b.registration_id} className="border-2 border-rule bg-white px-3 py-2">
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
