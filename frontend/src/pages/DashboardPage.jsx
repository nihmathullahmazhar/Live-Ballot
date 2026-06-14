import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import InkX from '../components/InkX'
import { Eyebrow, Rule, Spinner } from '../components/ui'
import { supabase } from '../lib/supabase'
import { getMyElections, getMyElection } from '../lib/api'
import { Plus, Settings, BarChart3, Vote, Copy, LogOut, X, Users, CheckCircle2, Search } from 'lucide-react'

const fmtDate = (s) => s ? new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const isPast = (e) => e.phase === 'closed'
// green = voting now, red = finished, yellow = pending (everything in between)
function statusBucket(e) {
  if (e.phase === 'closed') return 'red'
  if (e.phase === 'voting') return 'green'
  return 'yellow'
}
const BUCKET = {
  green:  { bar: 'bg-verify', tag: 'border-verify text-verify', label: 'Ongoing' },
  yellow: { bar: 'bg-amber-400', tag: 'border-amber-500 text-amber-700', label: 'Pending' },
  red:    { bar: 'bg-ballot', tag: 'border-ballot text-ballot', label: 'Finished' },
}

export default function DashboardPage() {
  const nav = useNavigate()
  const [session, setSession] = useState(undefined)
  const [mine, setMine] = useState([])
  const [loading, setLoading] = useState(true)
  const [openCode, setOpenCode] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { nav('/auth'); return }
      setSession(data.session)
    })
  }, [nav])

  useEffect(() => {
    if (!session) return
    ;(async () => {
      try { setMine(await getMyElections()) } catch { setMine([]) }
      finally { setLoading(false) }
    })()
  }, [session])

  async function signOut() { await supabase.auth.signOut(); nav('/') }

  if (session === undefined)
    return <Layout back="/"><div className="panel p-6"><Spinner label="Loading…" /></div></Layout>

  const ql = query.trim().toLowerCase()
  const shown = ql
    ? mine.filter((e) => `${e.title} ${e.code}`.toLowerCase().includes(ql))
    : mine
  const active = shown.filter((e) => !isPast(e))
  const past = shown.filter(isPast)
  const totalVotes = mine.reduce((n, e) => n + (e.turnout || 0), 0)

  return (
    <Layout back="/">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Organiser workspace</Eyebrow>
          <h1 className="font-display font-900 text-3xl sm:text-4xl uppercase">Your elections</h1>
          {session?.user?.email && <p className="text-faint font-mono text-xs mt-1">{session.user.email}</p>}
        </div>
        <div className="flex gap-2">
          <Link to="/create" className="btn btn-primary">
            <Plus size={16} className="inline -mt-1 mr-1" /> New election
          </Link>
          <button className="btn" onClick={signOut} title="Log out"><LogOut size={15} /></button>
        </div>
      </div>

      {/* summary strip */}
      {mine.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mt-5">
          <Stat label="Elections" value={mine.length} />
          <Stat label="Active" value={active.length} />
          <Stat label="Votes cast" value={totalVotes} />
        </div>
      )}

      {/* search */}
      {mine.length > 0 && (
        <div className="relative mt-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input className="input pl-9" placeholder="Search your elections by name or code…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}

      <Rule />

      {loading ? (
        <div className="panel p-6"><Spinner label="Loading your elections…" /></div>
      ) : mine.length === 0 ? (
        <div className="panel p-8 sm:p-10 text-center">
          <h2 className="font-display font-800 text-2xl uppercase">Set up your first election</h2>
          <p className="text-ink/70 mt-2 max-w-md mx-auto">
            Create one with just a name, build its form, collect nominations, and add the ballot
            whenever you're ready — all tied to your account.
          </p>
          <Link to="/create" className="btn btn-primary mt-5 inline-block text-lg">
            <Plus size={18} className="inline -mt-1 mr-1" /> Create an election
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          <Group title="Active" items={active} onOpen={setOpenCode}
            empty="Nothing active right now." />
          <Group title="Past" items={past} onOpen={setOpenCode}
            empty="No finished elections yet." />
        </div>
      )}

      {openCode && <DetailModal code={openCode} onClose={() => setOpenCode(null)} nav={nav} />}

      {/* NWS promo */}
      <section className="mt-8 panel p-6 sm:p-8 bg-violet text-white border-violet">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.22em] text-white/70">NWS Digital Services</div>
            <h3 className="font-display font-900 text-2xl sm:text-3xl uppercase mt-1">
              Need a custom system for your business?
            </h3>
            <p className="text-white/85 mt-2 max-w-xl text-sm">
              We build web apps, CRMs, booking systems, and tools for schools, clinics, hotels,
              and growing companies. Live Ballot is one of ours.
            </p>
          </div>
          <a href="https://nihmathullah.com" target="_blank" rel="noreferrer"
            className="btn bg-white text-violet border-white shrink-0 text-center">
            Visit nihmathullah.com
          </a>
        </div>
      </section>
    </Layout>
  )
}

function Stat({ label, value }) {
  return (
    <div className="panel p-4 text-center">
      <div className="font-display font-900 text-3xl">{value}</div>
      <div className="font-mono text-[11px] uppercase tracking-widest text-faint mt-1">{label}</div>
    </div>
  )
}

function Group({ title, items, onOpen, empty }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h2 className="font-display font-800 text-lg uppercase">{title}</h2>
        <span className="font-mono text-xs text-faint">{items.length}</span>
      </div>
      <Rule />
      {items.length === 0 ? (
        <p className="text-sm text-faint">{empty}</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((e) => {
            const b = BUCKET[statusBucket(e)]
            return (
            <button key={e.code} onClick={() => onOpen(e.code)}
              className="panel p-0 text-left hover:border-ink transition-colors overflow-hidden flex">
              <span className={`w-1.5 shrink-0 ${b.bar}`} aria-hidden />
              <span className="block flex-1 p-5">
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0 block">
                  <span className="block font-display font-800 text-lg uppercase truncate">{e.title}</span>
                  <span className="block font-mono text-sm text-faint">{e.code}</span>
                </span>
                <span className={`border-2 ${b.tag} bg-white px-2 py-0.5 text-xs font-mono shrink-0`}>{b.label}</span>
              </span>
              <span className="mt-3 flex items-center gap-3 text-xs font-mono text-faint">
                <span>{e.turnout ?? 0} voted</span>
                {e.is_paused && <span className="text-ballot">paused</span>}
                {e.is_finalized && <span>finalized</span>}
              </span>
              <span className="mt-2 block text-xs text-violet font-600">View details →</span>
              </span>
            </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DetailModal({ code, onClose, nav }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    getMyElection(code).then((x) => live && setD(x)).catch((e) => live && setErr(e.message))
    return () => { live = false }
  }, [code])

  const pct = d && d.registered > 0 ? Math.round((d.voted / d.registered) * 100) : null

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-start sm:items-center justify-center p-3 overflow-y-auto"
      onClick={onClose}>
      <div className="panel bg-paper w-full max-w-2xl my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-5 border-b-2 border-rule">
          <div className="min-w-0">
            <div className="font-mono text-xs text-faint">{code}</div>
            <h2 className="font-display font-900 text-2xl uppercase truncate">{d?.title || '…'}</h2>
          </div>
          <button className="btn px-2 py-1" onClick={onClose}><X size={16} /></button>
        </div>

        {err ? (
          <div className="p-6 text-ballot">{err}</div>
        ) : !d ? (
          <div className="p-6"><Spinner label="Loading details…" /></div>
        ) : (
          <div className="p-5 space-y-5">
            {d.description && <p className="text-ink/80">{d.description}</p>}

            <div className="grid grid-cols-3 gap-3">
              <Mini icon={<Users size={16} />} label="Registered" value={d.registered} />
              <Mini icon={<CheckCircle2 size={16} />} label="Voted" value={d.voted} />
              <Mini icon={<BarChart3 size={16} />} label="Turnout" value={pct === null ? '—' : `${pct}%`} />
            </div>

            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <Row k="Status" v={<span className="font-mono">{d.phase}{d.is_paused ? ' · paused' : ''}</span>} />
              <Row k="Created" v={fmtDate(d.created_at)} />
              <Row k="Voting opens" v={fmtDate(d.voting_open_at)} />
              <Row k="Voting closes" v={fmtDate(d.voting_close_at)} />
              <Row k="Finalized" v={d.is_finalized ? fmtDate(d.finalized_at) : 'No'} />
              <Row k="Results" v={d.results_published ? 'Published' : d.results_mode} />
            </div>

            <div>
              <h3 className="font-display font-800 uppercase text-sm mb-2">Positions &amp; standing</h3>
              {(!d.positions || d.positions.length === 0) ? (
                <p className="text-sm text-faint">No positions yet — add them in the Ballot tab.</p>
              ) : (
                <div className="space-y-3">
                  {d.positions.map((p, i) => {
                    const anyVotes = (p.candidates || []).some((c) => c.votes > 0)
                    return (
                      <div key={i} className="border-2 border-rule bg-white p-3">
                        <div className="flex items-baseline justify-between">
                          <span className="font-700">{p.title}</span>
                          <span className="text-xs font-mono text-faint">{p.max_winners} seat{p.max_winners > 1 ? 's' : ''}</span>
                        </div>
                        {(p.candidates || []).length === 0 ? (
                          <p className="text-xs text-faint mt-1">No candidates.</p>
                        ) : (
                          <ul className="mt-2 space-y-1">
                            {p.candidates.map((c, ci) => {
                              const leading = anyVotes && ci < p.max_winners
                              return (
                                <li key={ci} className="flex items-center justify-between text-sm">
                                  <span className="flex items-center gap-1">
                                    {leading && <span className="text-violet"><InkX size={13} /></span>}
                                    <span className={leading ? 'font-700' : ''}>{c.name}</span>
                                  </span>
                                  <span className="font-mono text-faint">{c.votes}</span>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <Rule />
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={() => nav(`/e/${code}/admin`)}>
                <Settings size={15} className="inline -mt-1 mr-1" /> Admin panel
              </button>
              <button className="btn" onClick={() => nav(`/e/${code}/results`)}>
                <BarChart3 size={15} className="inline -mt-1 mr-1" /> Results
              </button>
              <button className="btn" onClick={() => nav(`/e/${code}`)}>
                <Vote size={15} className="inline -mt-1 mr-1" /> Ballot
              </button>
              <button className="btn" onClick={() => navigator.clipboard?.writeText(code)}>
                <Copy size={15} className="inline -mt-1 mr-1" /> Copy code
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Mini({ icon, label, value }) {
  return (
    <div className="border-2 border-rule bg-white p-3 text-center">
      <div className="flex justify-center text-faint">{icon}</div>
      <div className="font-display font-900 text-2xl mt-1">{value}</div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-faint">{label}</div>
    </div>
  )
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between gap-3 py-1 border-b border-dashed border-rule/60">
      <span className="text-faint">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  )
}