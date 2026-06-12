import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { Eyebrow, Rule } from '../../components/ui'
import { useToast } from '../../components/Toast'
import {
  adminPublishResults, adminUnpublishResults, adminResetVotes,
  adminPurgePhotos, adminDeleteElection,
} from '../../lib/api'

export default function ControlsTab({ code, password, settings }) {
  const toast = useToast()
  const nav = useNavigate()
  const [published, setPublished] = useState(settings.results_published)
  const [busy, setBusy] = useState('')

  async function run(key, fn, confirmMsg, after) {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setBusy(key)
    try { const r = await fn(); after?.(r) }
    catch (e) { toast(e.message, 'error') }
    finally { setBusy('') }
  }

  return (
    <div className="space-y-5">
      {/* Results */}
      <div className="panel p-6">
        <Eyebrow>Results</Eyebrow>
        <p className="text-sm text-ink/70 mt-1">
          Results stay sealed until you publish. Once published, anyone with the
          code can view <Link to={`/e/${code}/results`} className="underline">the results page</Link>.
        </p>
        <div className="mt-3 flex gap-3">
          {!published ? (
            <button className="btn btn-primary" disabled={busy === 'pub'}
              onClick={() => run('pub', () => adminPublishResults(code, password), null,
                () => { setPublished(true); toast('Results published', 'success') })}>
              Publish results
            </button>
          ) : (
            <button className="btn" disabled={busy === 'unpub'}
              onClick={() => run('unpub', () => adminUnpublishResults(code, password), null,
                () => { setPublished(false); toast('Results sealed again', 'success') })}>
              Unpublish (re-seal)
            </button>
          )}
        </div>
      </div>

      {/* Maintenance */}
      <div className="panel p-6">
        <Eyebrow>Maintenance</Eyebrow>
        <div className="mt-3 space-y-3">
          <Row title="Reset all votes"
            desc="Deletes every vote and lets registered voters vote again. Registrations and codes stay.">
            <button className="btn btn-danger" disabled={busy === 'reset'}
              onClick={() => run('reset', () => adminResetVotes(code, password),
                'Delete ALL votes for this election? Voters can vote again. This cannot be undone.',
                (r) => toast(`Removed ${r.deleted} votes`, 'success'))}>
              Reset votes
            </button>
          </Row>
          <Row title="Purge photos"
            desc="Returns every stored selfie/candidate photo path and clears references so you can delete them from Storage.">
            <button className="btn btn-danger" disabled={busy === 'purge'}
              onClick={() => run('purge', () => adminPurgePhotos(code, password),
                'Clear all photo references? Do this after the election. The files in Storage must be deleted separately (paths are returned).',
                (r) => { console.log('Paths to delete from Storage:', r.paths); toast('Photo references cleared (see console for paths)', 'success') })}>
              Purge photos
            </button>
          </Row>
        </div>
      </div>

      {/* Danger */}
      <div className="panel p-6 border-ballot">
        <Eyebrow className="text-ballot">Danger zone</Eyebrow>
        <Rule />
        <Row title="Delete this election"
          desc="Permanently removes the election and everything in it. No recovery.">
          <button className="btn btn-danger" disabled={busy === 'del'}
            onClick={() => run('del', () => adminDeleteElection(code, password),
              `Type-check: this permanently deletes election ${code} and ALL its data. Continue?`,
              (r) => { console.log('Paths to delete from Storage:', r.paths); toast('Election deleted', 'success'); nav('/') })}>
            Delete election
          </button>
        </Row>
      </div>
    </div>
  )
}

function Row({ title, desc, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-2 border-rule bg-white/50 p-4">
      <div className="max-w-md">
        <div className="font-display font-700 uppercase text-sm">{title}</div>
        <div className="text-sm text-ink/70">{desc}</div>
      </div>
      {children}
    </div>
  )
}
