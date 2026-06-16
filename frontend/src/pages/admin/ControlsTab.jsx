import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { Eyebrow, Rule } from '../../components/ui'
import { useToast } from '../../components/Toast'
import {
  adminPublishResults, adminUnpublishResults, adminResetVotes,
  adminPurgePhotos, adminDeleteElection,
  adminFinalizeElection, adminUnfinalizeElection, adminSetResultsMode,
  adminSetPaused, adminSetRegistrationOpen, adminSetPassword, adminSetVoteMessage,
  adminSetMaxNomineePositions, adminSetCodeFormat, adminSetWhatsappTemplate,
  adminSetWindows, adminGetSyncToken, adminRotateSyncToken,
} from '../../lib/api'
import { supabaseUrl, supabaseAnonKey } from '../../lib/supabase'
import { Copy } from 'lucide-react'

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
  const [waTpl, setWaTpl] = useState(settings.whatsapp_template
    || 'Hello {name}, you are invited to vote in {election}. Your one-time code: *{code}*. Vote here: {link}')
  const [maxPos, setMaxPos] = useState(settings.max_nominee_positions || 1)
  const [codeFmt, setCodeFmt] = useState(settings.code_format || 'alphanumeric')
  const [codeLen, setCodeLen] = useState(settings.code_length || 8)
  // schedule window inputs (datetime-local needs "YYYY-MM-DDTHH:mm" with no TZ)
  const toLocalInput = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d)) return ''
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const [nomOpen, setNomOpen]   = useState(toLocalInput(settings.nominations_open_at))
  const [nomClose, setNomClose] = useState(toLocalInput(settings.nominations_close_at))
  const [voteOpen, setVoteOpen]   = useState(toLocalInput(settings.voting_open_at))
  const [voteClose, setVoteClose] = useState(toLocalInput(settings.voting_close_at))
  const [syncToken, setSyncToken] = useState(null)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    adminGetSyncToken(code, password).then((r) => setSyncToken(r?.sync_token || null)).catch(() => {})
    // eslint-disable-next-line
  }, [])
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
        <h3 className="font-semibold text-base">Sharing &amp; access</h3>
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
          <div className="mt-3 rounded-lg border border-dashed border-[var(--line-2)] p-3 bg-white">
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
        <h3 className="font-semibold text-base">Message after voting</h3>
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

      {/* Election schedule (nominations + voting windows) */}
      <div className="panel p-6">
        <h3 className="font-semibold text-base">Election schedule</h3>
        <p className="text-sm text-ink/70 mt-1">
          Optional. If you set a nominations window, self-nominations are accepted only inside it.
          If you set a voting window, voting opens automatically when it starts and closes when it ends.
          Leave any field blank to skip that gate.
        </p>

        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <div className="border-2 border-rule p-3 bg-white/40">
            <div className="font-display font-700 uppercase text-sm">Nominations window</div>
            <p className="text-xs text-faint mt-0.5">When candidates can apply</p>
            <label className="block mt-2">
              <span className="eyebrow">Opens</span>
              <input type="datetime-local" className="input"
                value={nomOpen} onChange={(e) => setNomOpen(e.target.value)} />
            </label>
            <label className="block mt-2">
              <span className="eyebrow">Closes</span>
              <input type="datetime-local" className="input"
                value={nomClose} onChange={(e) => setNomClose(e.target.value)} />
            </label>
            <button className="btn text-xs mt-2"
              onClick={() => run('nw_clear',
                () => adminSetWindows(code, password, { clear_nominations: true }),
                'Clear nomination dates?',
                () => { setNomOpen(''); setNomClose(''); onSettingsChange?.({ nominations_open_at: null, nominations_close_at: null }); toast('Nominations dates cleared', 'success') })}>
              Clear nominations
            </button>
          </div>

          <div className="border-2 border-rule p-3 bg-white/40">
            <div className="font-display font-700 uppercase text-sm">Voting window</div>
            <p className="text-xs text-faint mt-0.5">When ballots can be cast</p>
            <label className="block mt-2">
              <span className="eyebrow">Opens</span>
              <input type="datetime-local" className="input"
                value={voteOpen} onChange={(e) => setVoteOpen(e.target.value)} />
            </label>
            <label className="block mt-2">
              <span className="eyebrow">Closes</span>
              <input type="datetime-local" className="input"
                value={voteClose} onChange={(e) => setVoteClose(e.target.value)} />
            </label>
            <button className="btn text-xs mt-2"
              onClick={() => run('vw_clear',
                () => adminSetWindows(code, password, { clear_voting: true }),
                'Clear voting dates?',
                () => { setVoteOpen(''); setVoteClose(''); onSettingsChange?.({ voting_open_at: null, voting_close_at: null }); toast('Voting dates cleared', 'success') })}>
              Clear voting
            </button>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button className="btn btn-primary" disabled={busy === 'win'}
            onClick={() => {
              const toIso = (s) => s ? new Date(s).toISOString() : null
              run('win',
                () => adminSetWindows(code, password, {
                  nominations_open_at:  toIso(nomOpen),
                  nominations_close_at: toIso(nomClose),
                  voting_open_at:       toIso(voteOpen),
                  voting_close_at:      toIso(voteClose),
                }),
                null,
                () => { onSettingsChange?.({
                  nominations_open_at:  toIso(nomOpen),
                  nominations_close_at: toIso(nomClose),
                  voting_open_at:       toIso(voteOpen),
                  voting_close_at:      toIso(voteClose),
                }); toast('Schedule saved', 'success') })
            }}>
            Save schedule
          </button>
          <span className="self-center text-xs font-mono text-faint">
            Times are in your device's timezone.
          </span>
        </div>
      </div>

      {/* Voter-code format */}
      <div className="panel p-6">
        <h3 className="font-semibold text-base">Voter-code format</h3>
        <p className="text-sm text-ink/70 mt-1">
          How the one-time codes look. You can change this any time before voting starts;
          codes already issued stay the same.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label>
            <span className="font-display font-700 uppercase text-sm">Format</span>
            <select className="input mt-1" value={codeFmt} onChange={(e) => setCodeFmt(e.target.value)}>
              <option value="numeric">Numeric (0-9)</option>
              <option value="alphanumeric">Alphanumeric (A-Z + 0-9)</option>
              <option value="special">Letters + numbers + symbols</option>
            </select>
          </label>
          <label>
            <span className="font-display font-700 uppercase text-sm">Length</span>
            <input className="input mt-1 w-24" type="number" min={4} max={24}
              value={codeLen} onChange={(e) => setCodeLen(e.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={busy === 'cf'}
            onClick={() => run('cf',
              () => adminSetCodeFormat(code, password, codeFmt, Number(codeLen) || 8),
              null,
              () => { onSettingsChange?.({ code_format: codeFmt, code_length: Number(codeLen) || 8 }); toast('Code format saved', 'success') })}>
            Save format
          </button>
        </div>
      </div>

      {/* Max positions a nominee can stand for */}
      <div className="panel p-6">
        <h3 className="font-semibold text-base">Self-nomination limit</h3>
        <p className="text-sm text-ink/70 mt-1">
          The maximum number of positions one person can stand for in this election.
        </p>
        <div className="mt-3 flex items-end gap-3">
          <label>
            <span className="font-display font-700 uppercase text-sm">Max positions per person</span>
            <input className="input mt-1 w-24" type="number" min={1} max={50}
              value={maxPos} onChange={(e) => setMaxPos(e.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={busy === 'mp'}
            onClick={() => run('mp',
              () => adminSetMaxNomineePositions(code, password, Number(maxPos) || 1),
              null,
              () => { onSettingsChange?.({ max_nominee_positions: Number(maxPos) || 1 }); toast('Limit saved', 'success') })}>
            Save
          </button>
        </div>
      </div>

      {/* WhatsApp / email message template */}
      <div className="panel p-6">
        <h3 className="font-semibold text-base">WhatsApp message template</h3>
        <p className="text-sm text-ink/70 mt-1">
          Used when you tap the WhatsApp button next to a voter in Responses. Placeholders get
          filled in automatically:
          <span className="font-mono text-xs"> {'{name}'}, {'{code}'}, {'{election}'}, {'{link}'}</span>.
        </p>
        <textarea className="input mt-3 min-h-[90px]" value={waTpl}
          onChange={(e) => setWaTpl(e.target.value)} />
        <div className="mt-2 flex gap-2 flex-wrap">
          <button className="btn btn-primary" disabled={busy === 'wa'}
            onClick={() => run('wa',
              () => adminSetWhatsappTemplate(code, password, waTpl),
              null,
              () => { onSettingsChange?.({ whatsapp_template: waTpl }); toast('Template saved', 'success') })}>
            Save template
          </button>
          <button className="btn text-sm" onClick={() => setWaTpl(
            'Hello {name}, you are invited to vote in {election}. Your one-time code: *{code}*. Vote here: {link}'
          )}>Reset to default</button>
        </div>
      </div>

      {/* Google Sheets live sync */}
      <div className="panel p-6">
        <h3 className="font-semibold text-base">Google Sheets sync</h3>
        <p className="text-sm text-ink/70 mt-1">
          Mirror this election into a Google Sheet that updates automatically every few minutes — responses,
          voters, candidates, live vote counts. Free, no third-party service.
        </p>

        {!syncToken && (
          <div className="mt-3">
            <button className="btn btn-primary" disabled={busy === 'tok'}
              onClick={() => run('tok',
                () => adminRotateSyncToken(code, password),
                'Generate a sync token? Keep it private — anyone with this token can read (but not change) your election data.',
                (r) => { setSyncToken(r.sync_token); toast('Sync token created', 'success') })}>
              Generate sync token
            </button>
          </div>
        )}

        {syncToken && (
          <>
            <div className="mt-3 space-y-2 text-sm">
              <SyncRow label="Project URL" value={supabaseUrl} />
              <SyncRow label="Election code" value={code} />
              <SyncRow label="Sync token" value={syncToken} secret />
              <SyncRow label="Anon key" value={supabaseAnonKey} secret />
            </div>

            <details className="mt-4 rounded-lg p-3 bg-paper2 border border-[var(--line)] p-3">
              <summary className="font-display font-700 uppercase text-sm cursor-pointer">
                Setup steps (Google Sheets · 5 min, one-time)
              </summary>
              <ol className="mt-2 list-decimal pl-5 text-sm space-y-1">
                <li>Open a new Google Sheet at <a className="underline text-violet" href="https://sheets.new" target="_blank" rel="noreferrer">sheets.new</a>.</li>
                <li>Menu: <b>Extensions → Apps Script</b>.</li>
                <li>Delete the placeholder code, paste the script below, then <b>Save</b> (💾).</li>
                <li>Run the function <b>setup</b> once (top toolbar → choose <b>setup</b> → ▶ Run). Approve permissions when asked — this is your own script accessing your own sheet.</li>
                <li>That's it. The sheet now refreshes every 5 minutes automatically. To force a refresh, run <b>sync</b> manually.</li>
              </ol>
              <button className="btn text-sm mt-3" onClick={() => {
                const txt = appsScriptTemplate({ url: supabaseUrl, anon: supabaseAnonKey, code, token: syncToken })
                navigator.clipboard?.writeText(txt).then(() => toast('Script copied — paste into Apps Script', 'success'))
              }}>
                <Copy size={14} className="inline -mt-1 mr-1" /> Copy Apps Script
              </button>
            </details>

            <div className="mt-3 flex gap-2 flex-wrap">
              <button className="btn text-sm" disabled={busy === 'rot'}
                onClick={() => run('rot',
                  () => adminRotateSyncToken(code, password),
                  'Rotate the sync token? Existing Google Sheets using the old token will stop working until you update them with the new one.',
                  (r) => { setSyncToken(r.sync_token); toast('Token rotated', 'success') })}>
                Rotate token
              </button>
            </div>
          </>
        )}
      </div>

      {/* Finalization gate */}
      <div className="panel p-6">
        <h3 className="font-semibold text-base">Finalization (the voting gate)</h3>
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
        <h3 className="font-semibold text-base">During the run</h3>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-paper2 border border-[var(--line)] p-4">
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-paper2 border border-[var(--line)] p-4">
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
        <h3 className="font-semibold text-base">Results visibility</h3>
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
        <h3 className="font-semibold text-base">Publish results</h3>
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
        <h3 className="font-semibold text-base">Maintenance</h3>
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
      <div className="panel p-6">
        <h3 className="font-semibold text-base" style={{color:"var(--red)"}}>Danger zone</h3>
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-paper2 border border-[var(--line)] p-4">
      <div className="max-w-md">
        <div className="font-display font-700 uppercase text-sm">{title}</div>
        <div className="text-sm text-ink/70">{desc}</div>
      </div>
      {children}
    </div>
  )
}

function SyncRow({ label, value, secret }) {
  const [show, setShow] = useState(!secret)
  const shown = show ? value : '•'.repeat(Math.min(24, value?.length || 8))
  return (
    <div className="flex items-center gap-2">
      <span className="text-faint min-w-[7rem] shrink-0">{label}</span>
      <code className="flex-1 break-all border-2 border-rule bg-white px-2 py-1 text-xs">{shown}</code>
      {secret && (
        <button className="btn px-2 py-1 text-xs" onClick={() => setShow((v) => !v)}>
          {show ? 'Hide' : 'Show'}
        </button>
      )}
      <button className="btn px-2 py-1 text-xs"
        onClick={() => navigator.clipboard?.writeText(value)} title="Copy">
        <Copy size={12} />
      </button>
    </div>
  )
}

function appsScriptTemplate({ url, anon, code, token }) {
  return `/**
 * Live Ballot → Google Sheets sync
 * Auto-pulls responses, voters, candidates, vote tallies every 5 minutes.
 * Generated for election ${code}. Keep this script private.
 */
const SUPABASE_URL  = ${JSON.stringify(url)};
const SUPABASE_ANON = ${JSON.stringify(anon)};
const ELECTION_CODE = ${JSON.stringify(code)};
const SYNC_TOKEN    = ${JSON.stringify(token)};

function setup() {
  // create the time-driven trigger (every 5 minutes)
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => { if (t.getHandlerFunction() === 'sync') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(5).create();
  sync();
  SpreadsheetApp.getActive().toast('Live Ballot sync set up — refreshes every 5 minutes');
}

function sync() {
  const res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/sheet_sync', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON },
    payload: JSON.stringify({ p_code: ELECTION_CODE, p_token: SYNC_TOKEN }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) {
    throw new Error('Sync failed: ' + res.getContentText());
  }
  const data = JSON.parse(res.getContentText());
  const ss = SpreadsheetApp.getActive();

  writeSheet_(ss, 'Responses', data.responses, [
    ['Submitted', r => fmtDate_(r.created_at)],
    ['Name', r => r.name],
    ['Email', r => r.email],
    ['Phone', r => r.phone],
    ['Admission #', r => r.admission_number],
    ['Voter code', r => r.voter_code || ''],
    ['Voted?', r => r.has_voted ? '✓' : ''],
    ['Status', r => r.status],
    ['Wants candidacy', r => r.wants_candidacy ? 'YES' : ''],
    ['Standing for', r => (r.candidate_positions || []).join(', ')],
    ['Answers', r => JSON.stringify(r.answers || {})],
  ]);

  writeSheet_(ss, 'Voters', data.voters, [
    ['Created', r => fmtDate_(r.created_at)],
    ['Name', r => r.name],
    ['Email', r => r.email],
    ['Admission #', r => r.admission_number],
    ['Voter code', r => r.voter_code || ''],
    ['Voted?', r => r.has_voted ? '✓' : ''],
    ['Status', r => r.status],
  ]);

  const tally = [];
  (data.positions || []).forEach(p => {
    (p.candidates || []).forEach(c => {
      tally.push({ position: p.title, candidate: c.name,
                   status: c.status, source: c.source, votes: c.votes });
    });
  });
  writeSheet_(ss, 'Candidates & Tally', tally, [
    ['Position',  r => r.position],
    ['Candidate', r => r.candidate],
    ['Status',    r => r.status],
    ['Source',    r => r.source],
    ['Votes',     r => r.votes],
  ]);

  writeSheet_(ss, 'Sync info', [{
    election: data.election.code, title: data.election.title,
    phase: data.election.phase, fetched: fmtDate_(data.election.fetched_at),
  }], [
    ['Election', r => r.election],
    ['Title',    r => r.title],
    ['Phase',    r => r.phase],
    ['Last sync',r => r.fetched],
  ]);
}

function writeSheet_(ss, name, rows, cols) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  const header = cols.map(c => c[0]);
  const body = (rows || []).map(r => cols.map(c => c[1](r)));
  sh.getRange(1, 1, 1, header.length).setValues([header])
    .setFontWeight('bold').setBackground('#f3f3f3');
  if (body.length) sh.getRange(2, 1, body.length, header.length).setValues(body);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, header.length);
}

function fmtDate_(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}
`
}