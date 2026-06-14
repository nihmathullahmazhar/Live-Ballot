import { useEffect, useState } from 'react'
import { useToast } from '../../components/Toast'
import { Spinner } from '../../components/ui'
import { adminGetActivity } from '../../lib/api'
import { downloadCSV } from '../../lib/csv'
import { Download, RefreshCw } from 'lucide-react'

const LABEL = {
  election_created: 'Election created',
  finalized: 'Election finalized', unfinalized: 'Finalization reversed',
  paused: 'Voting paused', resumed: 'Voting resumed',
  registration_toggled: 'Registration toggled',
  codes_generated: 'Codes generated', votes_reset: 'Votes reset',
  results_published: 'Results published', results_unpublished: 'Results unpublished',
  position_added: 'Position added', position_deleted: 'Position deleted',
  candidate_added: 'Candidate added', candidate_deleted: 'Candidate deleted',
  candidate_approved: 'Candidate approved', candidate_rejected: 'Candidate rejected',
  photos_purged: 'Photos purged',
}
const fmt = (s) => new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

export default function ActivityTab({ code, password }) {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try { setRows(await adminGetActivity(code, password)) }
    catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])

  function exportCsv() {
    const ok = downloadCSV(`${code}-activity`,
      rows.map((r) => ({ when: fmt(r.at), action: LABEL[r.action] || r.action, actor: r.actor, details: r.metadata })),
      [{ key: 'when', label: 'When' }, { key: 'action', label: 'Action' }, { key: 'actor', label: 'By' }, { key: 'details', label: 'Details' }])
    if (!ok) toast('Nothing to export', 'error')
  }

  if (loading) return <div className="panel p-6"><Spinner label="Loading activity…" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-800 text-xl uppercase">Activity log</h3>
          <p className="text-faint text-sm mt-1">Admin actions on this election, newest first.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn text-sm" onClick={load}><RefreshCw size={14} className="inline -mt-1 mr-1" />Refresh</button>
          <button className="btn text-sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download size={14} className="inline -mt-1 mr-1" />CSV
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="panel p-8 text-center text-faint">No activity recorded yet.</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="panel p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-600">{LABEL[r.action] || r.action}</div>
                {r.metadata && Object.keys(r.metadata).length > 0 && (
                  <div className="text-xs text-faint font-mono truncate">{JSON.stringify(r.metadata)}</div>
                )}
              </div>
              <div className="text-xs font-mono text-faint shrink-0 text-right">
                <div>{fmt(r.at)}</div>
                <div className="uppercase">{r.actor}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}