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
  form_fields_set: 'Form updated',
  form_submitted: 'New form response',
  self_nomination: 'Self-nomination',
  voter_imported: 'Voters imported', bulk_import: 'Voters bulk-imported',
  voter_code_set: 'Voter code changed', voter_code_regenerated: 'Voter code regenerated',
  vote_cast: 'Vote cast', intake_converted: 'Response approved',
  set_max_nominee_positions: 'Nominee limit changed',
  set_code_format: 'Code format changed',
  set_whatsapp_template: 'WhatsApp template updated',
  set_vote_message: 'Post-vote message updated',
  set_self_nomination: 'Self-nomination toggled',
  password_set: 'Sharing password set', password_removed: 'Sharing password removed',
}
function describeMeta(action, meta) {
  if (!meta || Object.keys(meta).length === 0) return null
  if (action === 'codes_generated') return `${meta.count || 0} codes`
  if (action === 'bulk_import') return `${meta.count || 0} voters` + (meta.with_codes ? ' (codes issued)' : '')
  if (action === 'set_code_format') return `${meta.format} · ${meta.length} chars`
  if (action === 'set_max_nominee_positions') return `max = ${meta.value}`
  if (action === 'self_nomination') return meta.name ? `${meta.name}` : null
  if (action === 'form_fields_set') return `${meta.count || 0} fields`
  if (action === 'candidate_added') return meta.name || null
  if (action === 'position_added') return meta.title || null
  return JSON.stringify(meta)
}
const fmt = (s) => new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

export default function ActivityTab({ code, password, electionId }) {
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
                {describeMeta(r.action, r.metadata) && (
                  <div className="text-xs text-faint truncate">{describeMeta(r.action, r.metadata)}</div>
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