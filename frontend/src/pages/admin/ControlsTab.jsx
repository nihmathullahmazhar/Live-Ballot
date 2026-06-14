import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { Eyebrow, Rule } from '../../components/ui'
import { useToast } from '../../components/Toast'
import {
  adminPublishResults, adminUnpublishResults, adminResetVotes,
  adminPurgePhotos, adminDeleteElection,
  adminFinalizeElection, adminUnfinalizeElection, adminSetResultsMode,
  adminSetPaused, adminSetRegistrationOpen, adminSetPassword, adminSetVoteMessage,
} from '../../lib/api'

export default function ControlsTab({ code, password, settings, onSettingsChange }) {
  const toast = useToast()
  const nav = useNavigate()
  const [published, setPublished] = useState(settings.results_published)
  const [finalized, setFinalized] = useState(settings.is_finalized)
  const [mode, setMode] = useState(settings.results_mode || 'hidden')
  const [paused, setPaused] = useState(settings.is_paused)
  const [regOpen, setRegOpen] = useState(settings.registration_open)
  const [hasPw, setHasPw] = useState(!!settings.has_password)
  const [shareInput, setShareInput] = useState('')
  const [voteMsg, setVoteMsg] = useState(settings.vote_message || '')
  const [busy, setBusy] = useState('')
  const inviteLink = typeof window !== 'undefined' ? `${window.location.origin}/e/${code}/admin` : `/e/${code}/admin`

  async function run(key, fn, confirmMsg, after) {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setBusy(key)
    try { const r = await fn(); after?.(r) }
    catch (e) { toast(e.message, 'error') }
    finally { setBusy('') }
  }

  return (
    <div className="space-y-5">
      {/* Sharing & access */}
      <div className="panel p-6">
        <Eyebrow>Sharing &amp; access</Eyebrow>
        <p className="text-sm text-ink/70 mt-1">
          You manage this election from your dashboard whenever you're logged in — no password.
          A <b>sharing password</b> is optional: set one to let someone <i>without an account</i>
          help manage it. Give them the code <span className="font-mono">{code}</span> + the password,
          and they enter both at the admin page.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[12rem]">
            <span className="font-display font-700 uppercase text-sm">
              {hasPw ? 'Change sharing password' : 'Set a sharing password'}
            </span>
            <input className="input mt-1 font-mono" type="text" value={shareInput}
              placeholder={hasPw ? 'enter a new password' : 'e.g. helper-2026'}
              onChange={(e) => setShareInput(e.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={busy === 'pw'}
            onClick={() => {
              if (shareInput.trim() && shareInput.trim().length < 4) return toast('Use at least 4 characters', 'error')
              run('pw', () => adminSetPassword(code, password, shareInput.trim()),
                null, (r) => { setHasPw(!!r.has_password); setShareInput(''); toast('Sharing password updated', 'success') })
            }}>
            Save
          </button>
          {hasPw && (
            <button className="btn text-ballot" disabled={busy === 'pwx'}
              onClick={() => run('pwx', () => adminSetPassword(code, password, ''),
                'Remove the sharing password? Helpers without an account will lose access (you keep full access).',
                () => { setHasPw(false); setShareInput(''); toast('Sharing password removed', 'success') })}>
              Remove
            </button>
          )}
        </div>
        <p className="text-xs text-faint mt-2 font-mono">
          Status: {hasPw ? 'sharing password is set' : 'no sharing password — owner-only'}
        </p>
        {hasPw && (
          <div className="mt-3 border-2 border-dashed border-rule p-3 bg-white">
            <div className="font-display font-700 uppercase text-xs">Helper access link</div>
            <p className="text-xs text-faint mt-1">Send this link + the sharing password to your helper. No account needed.</p>
            <div className="mt-2 flex gap-2">
              <input className="input font-mono text-xs" readOnly value={inviteLink} onFocus={(e) => e.target.select()} />
              <button className="btn text-sm" onClick={() => { navigator.clipboard?.writeText(inviteLink); toast('Link copied', 'success') }}>Copy</button>
            </div>
          </div>
        )}
      </div>

      {/* Post-vote message */}
      <div className="panel p-6">
        <Eyebrow>Message after voting</Eyebrow>
        <p className="text-sm text-ink/70 mt-1">
          Shown to each voter right after they cast their vote — a thank-you, when results go live, etc.
          Leave blank for none.
        </p>
        <textarea className="input mt-3 min-h-[90px]" value={voteMsg}
          onChange={(e) => setVoteMsg(e.target.value)}
          placeholder="e.g. Thanks for voting! Results will be announced Friday at assembly." />
        <div className="mt-2">
          <button className="btn btn-primary" disabled={busy === 'vm'}
            onClick={() => run('vm', () => adminSetVoteMessage(code, password, voteMsg),
              null, () => { onSettingsChange?.({ vote_message: voteMsg.trim() || null }); toast('Message saved', 'success') })}>
            Save message
          </button>
        </div>
      </div>

      {/* Finalization gate */}
      <div className="panel p-6">
        <Eyebrow>Finalization (the voting gate)</Eyebrow>
        <p className="text-sm text-ink/70 mt-1">
          Voting cannot open until you finalize. Finalize only after you’ve issued
          codes and approved candidates. You can re-open if you finalized too early.
        </p>
        <div className="mt-3">
          {!finalized ? (
            <button className="btn btn-primary" disabled={busy === 'fin'}
              onClick={() => run('fin', () => adminFinalizeElection(code, password),
                'Finalize this election? Voting will be allowed (within your time window).',
                () => { setFinalized(true); onSettingsChange?.({ is_finalized: true }); toast('Election finalized', 'success') })}>
              Finalize election
            </button>
          ) : (
            <button className="btn" disabled={busy === 'unfin'}
              onClick={() => run('unfin', () => adminUnfinalizeElection(code, password),
                'Re-open setup? Voting will lock again until you finalize.',
                () => { setFinalized(false); onSettingsChange?.({ is_finalized: false }); toast('Re-opened for setup', 'success') })}>
              Unfinalize (re-open setup)
            </button>
          )}
        </div>
      </div>

      {/* Live run controls */}
      <div className="panel p-6">
        <Eyebrow>During the run</Eyebrow>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-2 border-rule bg-white/50 p-4">
            <div className="max-w-md">
              <div className="font-display font-700 uppercase text-sm">Pause voting</div>
              <div className="text-sm text-ink/70">Temporarily stop votes without closing. Voters see “voting is paused.”</div>
            </div>
            <button className={`btn ${paused ? 'btn-primary' : 'btn-danger'}`} disabled={busy === 'pause'}
              onClick={() => run('pause', () => adminSetPaused(code, password, !paused), null,
                (r) => { setPaused(r.is_paused); onSettingsChange?.({ is_paused: r.is_paused }); toast(r.is_paused ? 'Voting paused' : 'Voting resumed', 'success') })}>
              {paused ? 'Resume voting' : 'Pause voting'}
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-2 border-rule bg-white/50 p-4">
            <div className="max-w-md">
              <div className="font-display font-700 uppercase text-sm">Registration form</div>
              <div className="text-sm text-ink/70">
                {regOpen ? 'Open — the form accepts new submissions.' : 'Closed — the form is not accepting submissions.'}
              </div>
            </div>
            <button className={`btn ${regOpen ? '' : 'btn-primary'}`} disabled={busy === 'reg'}
              onClick={() => run('reg', () => adminSetRegistrationOpen(code, password, !regOpen), null,
                (r) => { setRegOpen(r.registration_open); onSettingsChange?.({ registration_open: r.registration_open }); toast(r.registration_open ? 'Registration opened' : 'Registration closed', 'success') })}>
              {regOpen ? 'Close registration' : 'Open registration'}
            </button>
          </div>
        </div>
      </div>

      {/* Results visibility mode */}
      <div className="panel p-6">
        <Eyebrow>Results visibility</Eyebrow>
        <p className="text-sm text-ink/70 mt-1">
          <b>Hidden</b>: nobody sees results until you publish. <b>Live</b>: counts
          are public during voting. <b>Admin only</b>: only this panel sees them.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {['hidden', 'live', 'admin_only'].map((m) => (
            <button key={m} disabled={busy === 'mode'}
              className={`btn text-sm ${mode === m ? 'btn-primary' : ''}`}
              onClick={() => run('mode', () => adminSetResultsMode(code, password, m), null,
                () => { setMode(m); onSettingsChange?.({ results_mode: m }); toast(`Results: ${m}`, 'success') })}>
              {m === 'admin_only' ? 'Admin only' : m}
            </button>
          ))}
        </div>
      </div>

      {/* Results publish (used by hidden mode) */}
      <div className="panel p-6">
        <Eyebrow>Publish results</Eyebrow>
        <p className="text-sm text-ink/70 mt-1">
          For <b>hidden</b> mode: release the <Link to={`/e/${code}/results`} className="underline">results page</Link> when ready.
          (Live mode is already public; admin-only never is.)
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