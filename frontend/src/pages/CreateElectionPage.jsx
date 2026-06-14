import { useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { Eyebrow, Rule, Spinner } from '../components/ui'
import { useToast } from '../components/Toast'
import { createElection } from '../lib/api'
import { rememberElection } from '../lib/localElections'
import { Plus, Trash2, Copy, Check } from 'lucide-react'

const blankCandidate = () => ({ name: '', bio: '' })
const blankPosition = () => ({ title: '', max_winners: 1, candidates: [blankCandidate()] })

export default function CreateElectionPage() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(null) // {code, password}
  const [copied, setCopied] = useState('')

  const [f, setF] = useState({
    title: '',
    description: '',
    admin_password: '',
    voter_identity_method: 'admission_number',
    admission_min: 10000,
    admission_max: 99999,
    code_format: 'alphanumeric',
    code_length: 8,
    code_issue_timing: 'at_approval',
    verified_mode: false,
    admin_can_see_votes: false,
    auto_email_codes: false,
    enable_self_nomination: false,
    results_mode: 'hidden',
    nominations_open_at: '',
    nominations_close_at: '',
    voting_open_at: '',
    voting_close_at: '',
  })
  const [positions, setPositions] = useState([blankPosition()])

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const isCode = f.voter_identity_method === 'generated_code'

  function tsOrNull(v) { return v ? new Date(v).toISOString() : null }

  function copy(text, key) {
    navigator.clipboard?.writeText(text)
    setCopied(key); setTimeout(() => setCopied(''), 1500)
  }

  async function submit() {
    if (!f.title.trim()) return toast('Add a title for the election', 'error')
    if (f.admin_password.trim() && f.admin_password.trim().length < 4)
      return toast('If you set a sharing password it needs at least 4 characters', 'error')
    const cleanPositions = positions
      .filter((p) => p.title.trim())
      .map((p) => ({
        title: p.title.trim(),
        max_winners: Number(p.max_winners) || 1,
        candidates: p.candidates
          .filter((c) => c.name.trim())
          .map((c) => ({ name: c.name.trim(), bio: c.bio.trim() })),
      }))

    setBusy(true)
    try {
      const rows = await createElection({
        p_title: f.title.trim(),
        p_admin_password: f.admin_password,
        p_description: f.description.trim() || null,
        p_voter_identity_method: f.voter_identity_method,
        p_admission_min: Number(f.admission_min),
        p_admission_max: Number(f.admission_max),
        p_code_format: f.code_format,
        p_code_length: Number(f.code_length),
        p_code_issue_timing: f.code_issue_timing,
        p_verified_mode: f.verified_mode,
        p_admin_can_see_votes: f.admin_can_see_votes,
        p_auto_email_codes: f.auto_email_codes,
        p_enable_self_nomination: f.enable_self_nomination,
        p_results_mode: f.results_mode,
        p_nominations_open_at: tsOrNull(f.nominations_open_at),
        p_nominations_close_at: tsOrNull(f.nominations_close_at),
        p_voting_open_at: tsOrNull(f.voting_open_at),
        p_voting_close_at: tsOrNull(f.voting_close_at),
        p_positions: cleanPositions,
      })
      const row = Array.isArray(rows) ? rows[0] : rows
      rememberElection(row.code, f.title.trim())
      setCreated({ code: row.code, password: f.admin_password })
      toast('Election created', 'success')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <Layout>
        <div className="panel p-8 max-w-2xl mx-auto">
          <Eyebrow>Save these now — there is no recovery</Eyebrow>
          <h1 className="font-display font-900 text-3xl uppercase mt-2">Election ready</h1>
          <p className="text-ink/80 mt-2 text-sm">
            Voters use the code. You manage it from your dashboard while logged in —
            no password needed.{created.password ? ' The sharing password lets a helper without an account in; keep it safe (no recovery).' : ' You can add a sharing password later from the admin Controls tab if you want to delegate.'}
          </p>

          <div className="mt-6 space-y-3">
            <KeyRow label="Election code" value={created.code}
              onCopy={() => copy(created.code, 'code')} copied={copied === 'code'} />
            {created.password && (
              <KeyRow label="Sharing password" value={created.password}
                onCopy={() => copy(created.password, 'pw')} copied={copied === 'pw'} />
            )}
          </div>

          <Rule />
          <div className="flex flex-wrap gap-3">
            <Link to={`/e/${created.code}/admin`} className="btn btn-primary">Open admin panel</Link>
            <Link to="/dashboard" className="btn">My dashboard</Link>
            <Link to={`/e/${created.code}`} className="btn">View voter page</Link>
            <Link to="/create" className="btn" onClick={() => setCreated(null)}>Create another</Link>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <h1 className="font-display font-900 text-4xl uppercase">Create an election</h1>
      <p className="text-faint font-mono text-sm mt-1">Form LB-1 · setup</p>

      {/* Basics */}
      <div className="panel p-6 mt-6 space-y-4">
        <Eyebrow>Basics</Eyebrow>
        <Labeled label="Title">
          <input className="input" value={f.title} onChange={(e) => set('title', e.target.value)}
            placeholder="Student Council Election 2026" />
        </Labeled>
        <Labeled label="Description (optional)">
          <textarea className="input" rows={2} value={f.description}
            onChange={(e) => set('description', e.target.value)} />
        </Labeled>
        <Labeled label="Sharing password — optional" hint="Leave blank: only you (logged in) can manage it. Set one only to let a helper without an account in. No recovery — write it down.">
          <input className="input font-mono" type="text" value={f.admin_password}
            onChange={(e) => set('admin_password', e.target.value)} placeholder="leave blank, or set a share password" />
        </Labeled>
      </div>

      {/* Identity method */}
      <div className="panel p-6 mt-6 space-y-4">
        <Eyebrow>How voters prove identity</Eyebrow>
        <div className="grid sm:grid-cols-2 gap-3">
          <Choice active={f.voter_identity_method === 'admission_number'}
            onClick={() => set('voter_identity_method', 'admission_number')}
            title="Admission number" desc="Vote with a number in a range you set." />
          <Choice active={isCode}
            onClick={() => set('voter_identity_method', 'generated_code')}
            title="Unique code" desc="Each voter gets a personal one-time code, burned after use." />
        </div>

        {!isCode && (
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Lowest number"><input type="number" className="input"
              value={f.admission_min} onChange={(e) => set('admission_min', e.target.value)} /></Labeled>
            <Labeled label="Highest number"><input type="number" className="input"
              value={f.admission_max} onChange={(e) => set('admission_max', e.target.value)} /></Labeled>
          </div>
        )}

        {isCode && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <Labeled label="Code characters">
                <select className="input" value={f.code_format} onChange={(e) => set('code_format', e.target.value)}>
                  <option value="numeric">Numbers only</option>
                  <option value="alphanumeric">Letters + numbers</option>
                  <option value="special">Letters, numbers, symbols</option>
                </select>
              </Labeled>
              <Labeled label="Code length">
                <input type="number" min={4} max={24} className="input"
                  value={f.code_length} onChange={(e) => set('code_length', e.target.value)} />
              </Labeled>
              <Labeled label="When to issue codes">
                <select className="input" value={f.code_issue_timing} onChange={(e) => set('code_issue_timing', e.target.value)}>
                  <option value="at_approval">After committee approves</option>
                  <option value="at_registration">Right at registration</option>
                </select>
              </Labeled>
            </div>
            <Toggle checked={f.auto_email_codes} onChange={(v) => set('auto_email_codes', v)}
              label="Auto-email each voter their code"
              hint="Needs Resend set up. Off = you distribute codes yourself from the admin list." />
          </div>
        )}
      </div>

      {/* Verification + secrecy */}
      <div className="panel p-6 mt-6 space-y-4">
        <Eyebrow>Verification &amp; privacy</Eyebrow>
        <Toggle checked={f.verified_mode} onChange={(v) => set('verified_mode', v)}
          label="Verified mode"
          hint="Voters register (name, email, selfie) and a committee approves before their vote counts. Self-nomination opens too." />
        <Toggle checked={f.admin_can_see_votes} onChange={(v) => set('admin_can_see_votes', v)}
          label="Admin can see how each person voted"
          hint="Off = you see who voted but not their choices (secret ballot). On = you can see each voter's selections." />
        <Toggle checked={f.enable_self_nomination} onChange={(v) => set('enable_self_nomination', v)}
          label="Enable candidate self-nomination"
          hint="Adds a 'stand as a candidate' section to your registration form. Applicants pick positions; you approve them onto the ballot." />
        <div>
          <span className="font-display font-700 uppercase text-sm">Results visibility</span>
          <span className="block text-xs text-faint mb-1">Hidden = release manually · Live = public during voting · Admin only = private.</span>
          <select className="input mt-1 sm:max-w-xs" value={f.results_mode} onChange={(e) => set('results_mode', e.target.value)}>
            <option value="hidden">Hidden until I publish</option>
            <option value="live">Live results</option>
            <option value="admin_only">Admin only</option>
          </select>
        </div>
      </div>

      {/* Time windows */}
      <div className="panel p-6 mt-6 space-y-4">
        <Eyebrow>Time windows (optional)</Eyebrow>
        <p className="text-sm text-faint">Leave blank to open voting immediately and keep it open.</p>
        {f.verified_mode && (
          <div className="grid sm:grid-cols-2 gap-3">
            <Labeled label="Nominations open"><input type="datetime-local" className="input"
              value={f.nominations_open_at} onChange={(e) => set('nominations_open_at', e.target.value)} /></Labeled>
            <Labeled label="Nominations close"><input type="datetime-local" className="input"
              value={f.nominations_close_at} onChange={(e) => set('nominations_close_at', e.target.value)} /></Labeled>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <Labeled label="Voting opens"><input type="datetime-local" className="input"
            value={f.voting_open_at} onChange={(e) => set('voting_open_at', e.target.value)} /></Labeled>
          <Labeled label="Voting closes"><input type="datetime-local" className="input"
            value={f.voting_close_at} onChange={(e) => set('voting_close_at', e.target.value)} /></Labeled>
        </div>
      </div>

      {/* Positions + candidates */}
      <div className="panel p-6 mt-6 space-y-5">
        <div className="flex items-center justify-between">
          <Eyebrow>Positions &amp; candidates — optional</Eyebrow>
          {f.verified_mode && (
            <span className="text-xs font-mono text-faint">
              In verified mode candidates can also self-nominate.
            </span>
          )}
        </div>
        <p className="text-sm text-ink/70 -mt-2">
          You can skip this for now. Create the election with just a name, collect registrations
          and nominations through the form first, and add positions and candidates later from the
          admin panel's <span className="font-600">Ballot</span> tab.
        </p>

        {positions.map((p, pi) => (
          <div key={pi} className="border-2 border-rule p-4 bg-white/60">
            <div className="flex gap-3 items-end">
              <Labeled label={`Position ${pi + 1}`} className="flex-1">
                <input className="input" value={p.title} placeholder="e.g. President"
                  onChange={(e) => setPositions((ps) => ps.map((x, i) => i === pi ? { ...x, title: e.target.value } : x))} />
              </Labeled>
              <Labeled label="Seats" className="w-24">
                <input type="number" min={1} className="input" value={p.max_winners}
                  onChange={(e) => setPositions((ps) => ps.map((x, i) => i === pi ? { ...x, max_winners: e.target.value } : x))} />
              </Labeled>
              {positions.length > 1 && (
                <button className="btn btn-danger px-3" title="Remove position"
                  onClick={() => setPositions((ps) => ps.filter((_, i) => i !== pi))}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <div className="mt-3 space-y-2">
              {p.candidates.map((c, ci) => (
                <div key={ci} className="flex gap-2">
                  <input className="input" placeholder="Candidate name" value={c.name}
                    onChange={(e) => setPositions((ps) => ps.map((x, i) => i === pi
                      ? { ...x, candidates: x.candidates.map((y, j) => j === ci ? { ...y, name: e.target.value } : y) } : x))} />
                  <input className="input" placeholder="Short bio (optional)" value={c.bio}
                    onChange={(e) => setPositions((ps) => ps.map((x, i) => i === pi
                      ? { ...x, candidates: x.candidates.map((y, j) => j === ci ? { ...y, bio: e.target.value } : y) } : x))} />
                  {p.candidates.length > 1 && (
                    <button className="btn px-3" title="Remove candidate"
                      onClick={() => setPositions((ps) => ps.map((x, i) => i === pi
                        ? { ...x, candidates: x.candidates.filter((_, j) => j !== ci) } : x))}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              <button className="btn text-sm" onClick={() => setPositions((ps) => ps.map((x, i) =>
                i === pi ? { ...x, candidates: [...x.candidates, blankCandidate()] } : x))}>
                <Plus size={14} className="inline -mt-1 mr-1" /> Add candidate
              </button>
            </div>
          </div>
        ))}

        <button className="btn" onClick={() => setPositions((ps) => [...ps, blankPosition()])}>
          <Plus size={16} className="inline -mt-1 mr-1" /> Add position
        </button>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button className="btn btn-primary text-lg" disabled={busy} onClick={submit}>
          {busy ? 'Creating…' : 'Create election'}
        </button>
        {busy && <Spinner label="Setting up…" />}
      </div>
      <div className="h-10" />
    </Layout>
  )
}

/* ---- small local helpers ---- */
function Labeled({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="font-display font-700 uppercase text-sm tracking-wide">{label}</span>
      {hint && <span className="block text-xs text-faint mb-1">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  )
}

function Choice({ active, onClick, title, desc }) {
  return (
    <button type="button" onClick={onClick}
      className={`text-left border-2 p-4 transition ${active ? 'border-violet bg-white shadow-paper' : 'border-rule bg-white/40 hover:bg-white'}`}>
      <div className="font-display font-700 uppercase">{title}</div>
      <div className="text-sm text-ink/70 mt-1">{desc}</div>
    </button>
  )
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-3 text-left">
      <span className={`mt-0.5 h-6 w-6 shrink-0 border-2 border-rule grid place-items-center ${checked ? 'bg-violet text-white' : 'bg-white'}`}>
        {checked && <Check size={16} />}
      </span>
      <span>
        <span className="font-display font-700 uppercase text-sm">{label}</span>
        {hint && <span className="block text-xs text-faint">{hint}</span>}
      </span>
    </button>
  )
}

function KeyRow({ label, value, onCopy, copied }) {
  return (
    <div className="flex items-center justify-between border-2 border-rule bg-white px-4 py-3">
      <div>
        <div className="eyebrow">{label}</div>
        <div className="font-mono text-xl tracking-wide">{value}</div>
      </div>
      <button className="btn px-3" onClick={onCopy}>
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  )
}