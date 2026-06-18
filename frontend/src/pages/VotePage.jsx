import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { Spinner } from '../components/ui'
import { useToast } from '../components/Toast'
import { getElectionPublic, castVote, imageUrl } from '../lib/api'
import { Check } from 'lucide-react'

// One vote per position (DB enforces uniqueness). For positions that elect more
// than one winner, the voter still casts a SINGLE vote and the top-N candidates win.
function seatLabel(maxWinners) {
  const n = Math.max(1, maxWinners || 1)
  return n > 1 ? `Vote 1 · top ${n} win` : 'Vote for 1'
}

// Tiny self-contained confetti — no dependency. Fires a burst from the given x/y.
function fireConfetti() {
  if (typeof window === 'undefined') return
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999'
  canvas.width = window.innerWidth; canvas.height = window.innerHeight
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  const colors = ['#5B34C4', '#6E45DE', '#9b7bf0', '#16915A', '#E8C766', '#C8102E', '#ffffff']
  const N = 160
  const parts = Array.from({ length: N }, () => ({
    x: canvas.width / 2 + (Math.random() - 0.5) * 120,
    y: canvas.height * 0.32,
    vx: (Math.random() - 0.5) * 14,
    vy: Math.random() * -16 - 4,
    g: 0.35 + Math.random() * 0.2,
    size: 5 + Math.random() * 7,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: colors[(Math.random() * colors.length) | 0],
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
    life: 0,
  }))
  let raf
  const start = performance.now()
  function frame(now) {
    const t = now - start
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    parts.forEach((p) => {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.rot += p.vr; p.life = t
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot)
      ctx.globalAlpha = Math.max(0, 1 - t / 2600)
      ctx.fillStyle = p.color
      if (p.shape === 'rect') ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      else { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill() }
      ctx.restore()
    })
    if (t < 2600) raf = requestAnimationFrame(frame)
    else { cancelAnimationFrame(raf); canvas.remove() }
  }
  raf = requestAnimationFrame(frame)
}

export default function VotePage() {
  const { code } = useParams()
  const toast = useToast()
  const [election, setElection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [choices, setChoices] = useState({}) // position_id -> candidate_id (single)
  const [identity, setIdentity] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function load() {
    setLoading(true); setError('')
    try {
      const e = await getElectionPublic(code)
      if (!e) setError('No election found for this code.')
      else setElection(e)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [code])

  const isCode = election?.voter_identity_method === 'generated_code'
  const phase = election?.phase
  const canVote = phase === 'open' || phase === 'voting'

  function pick(positionId, candidateId) {
    setChoices((c) => ({ ...c, [positionId]: c[positionId] === candidateId ? undefined : candidateId }))
  }

  async function submit() {
    if (!identity.trim()) return toast(isCode ? 'Enter your code' : 'Enter your admission number', 'error')
    const votes = Object.entries(choices)
      .filter(([, cid]) => cid)
      .map(([position_id, candidate_id]) => ({ position_id, candidate_id }))
    if (votes.length === 0) return toast('Mark at least one candidate', 'error')

    setBusy(true)
    try {
      await castVote(code, identity.trim(), votes)
      setDone(true)
      fireConfetti()
      toast('Vote recorded', 'success')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  if (loading) return <Layout code={code} back><div className="card p-8"><Spinner label="Loading ballot…" /></div></Layout>
  if (error) return (
    <Layout code={code} back>
      <div className="card p-8 text-center vb-fade">
        <p className="text-xl font-bold" style={{ color: 'var(--red)' }}>{error}</p>
        <Link to="/" className="btn mt-5 inline-block">Back to start</Link>
      </div>
    </Layout>
  )

  if (done) return (
    <Layout code={code} back>
      <div className="card vb-glass p-10 text-center max-w-xl mx-auto vb-rise" style={{ '--i': 0 }}>
        <div className="mx-auto h-20 w-20 rounded-full grid place-items-center vb-ring"
          style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>
          <span className="vb-bigcheck inline-flex"><Check size={44} strokeWidth={3} /></span>
        </div>
        <h1 className="text-3xl font-extrabold mt-5 vb-gradient-text">Ballot cast</h1>
        <p className="text-muted mt-2">Your vote has been counted{isCode ? ' and your code is now used' : ''}.</p>
        {election.vote_message && (
          <div className="mt-5 rounded-xl p-4 text-left whitespace-pre-wrap" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
            {election.vote_message}
          </div>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <Link to={`/e/${code}/results`} className="btn">See results page</Link>
          <Link to="/" className="btn btn-primary">Done</Link>
        </div>
      </div>
    </Layout>
  )

  const totalPicked = Object.values(choices).filter(Boolean).length

  return (
    <Layout code={code} back>
      {/* Masthead */}
      <div className="card vb-glass p-6 vb-rise" style={{ '--i': 0 }}>
        <div className="text-xs font-mono uppercase tracking-widest text-muted">Official ballot · {election.code}</div>
        <h1 className="text-3xl sm:text-4xl font-extrabold mt-2 vb-gradient-text">{election.title}</h1>
        <div className="vb-accent-bar mt-3" />
        {election.description && <p className="text-muted mt-3">{election.description}</p>}
        <div className="mt-3 flex flex-wrap gap-2 items-center text-sm">
          <PhaseBadge phase={phase} />
          <span className="text-faint">·</span>
          <Link to={`/e/${code}/form`} className="underline underline-offset-4" style={{ color: 'var(--violet)' }}>
            {election.enable_self_nomination ? 'Register / stand as candidate' : 'Register'}
          </Link>
        </div>
      </div>

      {!canVote && (
        <div className="card p-5 mt-5 vb-rise" style={{ '--i': 1, borderColor: 'var(--violet)' }}>
          <p className="font-bold uppercase">
            {phase === 'closed' ? 'Voting is closed.'
              : phase === 'paused' ? 'Voting is paused by the organisers.'
              : phase === 'nominations' ? 'Nominations are open — voting hasn’t started.'
              : phase === 'pre_voting' ? 'Nominations closed. Voting opens soon.'
              : phase === 'finalizing' ? 'Registration is open — voting hasn’t started yet.'
              : 'Voting hasn’t opened yet.'}
          </p>
          <Link to={`/e/${code}/form`} className="btn mt-3 inline-block mr-2">Register</Link>
          {election.results_published && (
            <Link to={`/e/${code}/results`} className="btn mt-3 inline-block">View published results</Link>
          )}
        </div>
      )}

      {canVote && (
        <>
          {(election.positions || []).map((p, idx) => (
            <div key={p.id} className="card vb-glass p-6 mt-5 vb-rise" style={{ '--i': idx + 1 }}>
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 className="text-2xl font-extrabold uppercase">{p.title}</h2>
                <span className="pill pill-candidate">{seatLabel(p.max_winners)}</span>
              </div>
              <div className="vb-accent-bar mt-2" style={{ width: 40, opacity: .7 }} />
              <div className="mt-4 grid sm:grid-cols-2 gap-3">
                {(p.candidates || []).length === 0 && (
                  <p className="text-faint text-sm">No candidates yet for this position.</p>
                )}
                {(p.candidates || []).map((c) => (
                  <VoteCandidate key={c.id} c={c}
                    selected={choices[p.id] === c.id}
                    onPick={() => pick(p.id, c.id)} />
                ))}
              </div>
            </div>
          ))}

          {/* Identity + submit */}
          <div className="card vb-glass p-6 mt-5 vb-rise" style={{ '--i': (election.positions?.length || 0) + 1 }}>
            <div className="text-xs font-mono uppercase tracking-widest text-muted">Confirm your identity</div>
            <label className="block font-bold uppercase mt-2 mb-2">
              {isCode ? 'Your voting code' : 'Your admission number'}
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                className="input font-mono tracking-widest sm:max-w-xs"
                placeholder={isCode ? 'e.g. 7K2M9QX4' : 'e.g. 54321'}
                value={identity}
                onChange={(e) => setIdentity(isCode ? e.target.value.toUpperCase() : e.target.value)}
              />
              <button className="btn btn-primary text-lg vb-submit-sheen" disabled={busy} onClick={submit}
                style={{ border: 'none', color: '#fff' }}>
                {busy ? 'Casting…' : `Cast my vote${totalPicked ? ` (${totalPicked})` : ''}`}
              </button>
            </div>
            {isCode && <p className="text-xs text-faint mt-2">Your code works once. After voting it can’t be reused.</p>}
          </div>
        </>
      )}
      <div className="h-8" />
    </Layout>
  )
}

function PhaseBadge({ phase }) {
  const map = {
    open: ['pill-approved', 'Voting open'],
    voting: ['pill-approved', 'Voting open'],
    nominations: ['pill-pending', 'Nominations'],
    pre_voting: ['pill-pending', 'Opening soon'],
    closed: ['pill-rejected', 'Closed'],
    paused: ['pill-rejected', 'Paused'],
    scheduled: ['pill-pending', 'Scheduled'],
  }
  const [cls, label] = map[phase] || ['pill-pending', phase || '—']
  return <span className={`pill ${cls}`}>{label}</span>
}

function VoteCandidate({ c, selected, onPick }) {
  const [photo, setPhoto] = useState(null)
  useEffect(() => { if (c.photo_path) imageUrl('candidate-photos', c.photo_path).then(setPhoto) }, [c.photo_path])
  return (
    <button type="button" onClick={onPick}
      className={`vb-option text-left rounded-xl p-3 flex gap-3 items-center w-full ${selected ? 'vb-option-selected' : ''}`}
      style={{
        border: selected ? '2px solid var(--violet)' : '1px solid var(--line)',
        background: selected ? 'var(--violet-bg)' : 'var(--surface)',
      }}>
      <span className="h-7 w-7 shrink-0 rounded-md grid place-items-center"
        style={{
          border: selected ? '2px solid var(--violet)' : '1.5px solid var(--line-2)',
          background: selected ? 'var(--violet)' : 'var(--surface)',
          color: '#fff',
          transition: 'background .18s ease, border-color .18s ease',
        }}>
        {selected && <span className="vb-check inline-flex"><Check size={18} strokeWidth={3} /></span>}
      </span>
      {c.photo_path && (
        <span className="h-16 w-16 shrink-0 rounded-lg overflow-hidden" style={{ border: '1px solid var(--line-2)', background: 'var(--surface-2)' }}>
          {photo
            ? <img src={photo} alt="" className="h-full w-full object-cover" />
            : <span className="block h-full w-full" />}
        </span>
      )}
      <span className="min-w-0">
        <span className="font-bold text-lg leading-tight block">{c.name}</span>
        {c.bio && <span className="text-sm text-muted block">{c.bio}</span>}
        {c.manifesto && <span className="text-xs text-faint italic block mt-1 line-clamp-3">{c.manifesto}</span>}
      </span>
    </button>
  )
}