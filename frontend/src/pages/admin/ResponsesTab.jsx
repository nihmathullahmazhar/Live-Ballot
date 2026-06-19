import { useEffect, useState, useCallback, useRef } from 'react'
import { Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'
import {
  adminGetResponses, adminDeleteResponse, adminGenerateCodes, adminUpdateResponse,
  getFormFields, subscribeElection, imageUrl,
  adminGetBallot, adminPromoteToCandidate,
} from '../../lib/api'
import {
  Trash2, KeyRound, Search, Download, MessageCircle, Mail, Check, X,
  RefreshCw, Copy, ImageIcon, ChevronDown, ChevronUp, UserPlus,
} from 'lucide-react'
import { downloadCSV } from '../../lib/csv'

export default function ResponsesTab({ code, password, electionId, whatsappTemplate, title }) {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('newest')
  const [sel, setSel] = useState({})
  const [issued, setIssued] = useState([])
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(null)
  const [fields, setFields] = useState([])
  const [view, setView] = useState('individual')
  const [positions, setPositions] = useState([])
  const liveRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [resp, ff, bal] = await Promise.all([
        adminGetResponses(code, password),
        getFormFields(code).catch(() => null),
        adminGetBallot(code, password).catch(() => []),
      ])
      setRows(annotateDuplicates(resp))
      setFields((ff?.fields || []).filter((f) => f.section === 'voter'))
      setPositions(bal || [])
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }, [code, password, toast])
  useEffect(() => { load() }, [load])

  // realtime: refresh on any intake_responses change
  useEffect(() => {
    if (!electionId) return
    const unsub = subscribeElection('intake_responses', electionId, () => {
      liveRef.current = Date.now(); load()
    })
    return unsub
  }, [electionId, load])

  const list = rows.filter((r) => {
    if (filter === 'duplicates') {
      if (!r.flagged) return false
    } else if (filter === 'candidacy') {
      if (!r.wants_candidacy) return false
    } else if (filter === 'voted') {
      if (!r.has_voted) return false
    } else if (filter === 'not_issued') {
      if (r.voter_code) return false
    } else if (filter !== 'all' && r.status !== filter) return false
    if (!q.trim()) return true
    const hay = `${r.name || ''} ${r.email || ''} ${r.admission_number || ''} ${r.voter_code || ''}`.toLowerCase()
    return hay.includes(q.toLowerCase())
  }).sort((a, b) => {
    if (sort === 'name') return (a.name || '').localeCompare(b.name || '')
    if (sort === 'oldest') return new Date(a.created_at || 0) - new Date(b.created_at || 0)
    return new Date(b.created_at || 0) - new Date(a.created_at || 0) // newest (default)
  })

  // headline counts for the summary strip
  const counts = {
    total: rows.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    issued: rows.filter((r) => r.voter_code).length,
    candidacy: rows.filter((r) => r.wants_candidacy).length,
    voted: rows.filter((r) => r.has_voted).length,
    duplicates: rows.filter((r) => r.flagged).length,
  }
  const selectedIds = Object.keys(sel).filter((id) => sel[id])

  function selectAllPending() {
    const next = {}
    list.forEach((r) => { if (r.status === 'pending') next[r.id] = true })
    setSel(next)
  }
  function clearSel() { setSel({}) }

  async function generate() {
    if (selectedIds.length === 0) return toast('Select people first', 'error')
    setBusy(true)
    try {
      const r = await adminGenerateCodes(code, password, selectedIds)
      setIssued(r.issued || [])
      setSel({})
      toast(`Generated ${r.issued?.length || 0} codes`, 'success')
      load()
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function del(id) {
    if (!confirm('Delete this response?')) return
    try { await adminDeleteResponse(code, password, id); toast('Deleted', 'success'); load() }
    catch (e) { toast(e.message, 'error') }
  }

  function exportResponses() {
    const data = list.map((r) => ({
      name: r.name || '', email: r.email || '', admission: r.admission_number || '',
      voter_code: r.voter_code || '', voting_status: r.has_voted ? 'voted' : '',
      status: r.status, wants_candidacy: r.wants_candidacy ? 'yes' : 'no',
      candidate_positions: (r.candidate_positions || []).join(' | '),
      submitted: r.created_at,
      ...Object.fromEntries(Object.entries(r.answers || {}).map(([k, v]) =>
        [`q_${k}`, Array.isArray(v) ? v.join(' | ') : v])),
    }))
    if (!downloadCSV(`${code}-responses`, data)) toast('Nothing to export', 'error')
  }
  function exportIssued() {
    if (issued.length === 0) return
    downloadCSV(`${code}-codes`, issued)
  }

  if (loading && rows.length === 0) return <div className="card p-6"><Spinner label="Loading responses…" /></div>

  return (
    <div className="space-y-4">
      {/* clickable summary strip */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[
          ['all', 'Total', counts.total, 'violet'],
          ['pending', 'Pending', counts.pending, 'amber'],
          ['converted', 'Code issued', counts.issued, 'green'],
          ['candidacy', 'Want to run', counts.candidacy, 'violet'],
          ['voted', 'Voted', counts.voted, 'green'],
          ['duplicates', 'Flagged', counts.duplicates, 'red'],
        ].map(([key, label, value, tone]) => (
          <button key={key} onClick={() => setFilter(key)}
            className="stat-card text-left"
            style={filter === key ? { borderColor: `var(--${tone})`, boxShadow: `0 0 0 1px var(--${tone})` } : undefined}>
            <div className="stat-num" style={{ color: `var(--${tone})`, fontSize: '1.6rem' }}>{value}</div>
            <div className="stat-label">{label}</div>
          </button>
        ))}
      </div>

      <div className="card p-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
            <input className="input pl-7 max-w-xs" placeholder="Search name / email / code"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="converted">Code issued</option>
            <option value="not_issued">No code yet</option>
            <option value="rejected">Rejected</option>
            <option value="candidacy">Wants candidacy</option>
            <option value="voted">Has voted</option>
            <option value="duplicates">Flagged (possible cheating)</option>
          </select>
          <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-sm" onClick={load} title="Refresh">
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn-sm" disabled={list.length === 0} onClick={exportResponses}>
            <Download size={14} /> Export
          </button>
          {selectedIds.length > 0
            ? <button className="btn btn-sm btn-ghost" onClick={clearSel}>Clear ({selectedIds.length})</button>
            : <button className="btn btn-sm" onClick={selectAllPending}>Select all pending</button>}
          <button className="btn btn-sm btn-primary" disabled={busy || selectedIds.length === 0} onClick={generate}>
            <KeyRound size={15} />
            Generate codes ({selectedIds.length})
          </button>
        </div>
      </div>

      <div className="flex gap-2 items-center">
        {[['individual', 'Individual'], ['summary', 'Summary']].map(([v, l]) => (
          <button key={v} onClick={() => setView(v)}
            className={`btn text-sm ${view === v ? 'btn-primary' : ''}`}>{l}</button>
        ))}
        <span className="ml-auto eyebrow">
          {list.length} of {rows.length} shown
          {electionId && <span className="ml-2" style={{ color: 'var(--green)' }}>● live</span>}
        </span>
      </div>

      {issued.length > 0 && (
        <div className="card p-5" style={{ borderColor: 'var(--violet)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--violet)' }}>Codes just issued — share via WhatsApp / email / copy</div>
            <button className="btn text-sm" onClick={exportIssued}>
              <Download size={14} className="inline -mt-1 mr-1" /> CSV
            </button>
          </div>
          <IssuedList issued={issued} code={code} title={title}
            whatsappTemplate={whatsappTemplate} toast={toast} />
        </div>
      )}

      {view === 'summary' && <Summary rows={list} fields={fields} />}

      {view === 'individual' && (
        <div className="space-y-2.5">
          {list.length === 0 && <div className="card p-6 text-faint text-sm">No responses.</div>}
          {list.map((r) => (
            <ResponseCard key={r.id} r={r} fields={fields} code={code} password={password}
              positions={positions}
              sel={sel} setSel={setSel} setEdit={setEdit} del={del}
              whatsappTemplate={whatsappTemplate} title={title} toast={toast} onChange={load} />
          ))}
        </div>
      )}

      {edit && (
        <EditModal r={edit} code={code} password={password} toast={toast}
          onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />
      )}
    </div>
  )
}

/* ------------ one response card with photo + answers + code ----------- */
function ResponseCard({ r, fields, code, password, positions, sel, setSel, setEdit, del,
                       whatsappTemplate, title, toast, onChange }) {
  const [photo, setPhoto] = useState(null)
  const [open, setOpen] = useState(false)
  const [showPick, setShowPick] = useState(false)
  const [promoting, setPromoting] = useState(false)
  useEffect(() => {
    if (r.candidate_photo_path) imageUrl('candidate-photos', r.candidate_photo_path).then(setPhoto)
  }, [r.candidate_photo_path])
  const wa = waLink(r, code, title, whatsappTemplate)
  const mail = mailLink(r, code, title)

  async function promote(positionId) {
    setPromoting(true)
    try {
      await adminPromoteToCandidate(code, password, r.id, positionId)
      toast('Added as candidate', 'success'); setShowPick(false); onChange?.()
    } catch (e) { toast(e.message, 'error') }
    finally { setPromoting(false) }
  }

  return (
    <div className="row-card">
      <div className="flex items-start gap-3 justify-between">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {r.status === 'pending' && (
            <input type="checkbox" className="mt-1.5" checked={!!sel[r.id]}
              onChange={(e) => setSel((s) => ({ ...s, [r.id]: e.target.checked }))} />
          )}
          {r.candidate_photo_path ? (
            <div className="h-14 w-14 border-2 border-rule bg-white overflow-hidden shrink-0">
              {photo
                ? <img src={photo} alt="" className="h-full w-full object-cover" />
                : <div className="h-full w-full grid place-items-center text-faint"><ImageIcon size={18} /></div>}
            </div>
          ) : r.wants_candidacy ? (
            <div className="h-14 w-14 border-2 border-dashed border-rule grid place-items-center text-faint shrink-0">
              <ImageIcon size={18} />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="font-semibold flex flex-wrap items-center gap-2">
              <button onClick={() => setOpen((v) => !v)} className="hover:text-violet text-left">
                {r.name || 'Unnamed'}
              </button>
              {r.voter_code && (
                <button onClick={() => { navigator.clipboard?.writeText(r.voter_code); toast('Code copied', 'success') }}
                  className="text-xs font-mono px-2 py-0.5 rounded-md border text-verify hover:bg-verify hover:text-white transition"
                  style={{ borderColor: 'var(--green)' }}
                  title="Click to copy">
                  <KeyRound size={11} className="inline -mt-0.5 mr-1" />{r.voter_code}
                </button>
              )}
              {r.wants_candidacy && (
                <span className="pill pill-candidate">candidate{r.candidate_positions?.length > 0 && ` · ${r.candidate_positions.join(', ')}`}</span>
              )}
              {r.has_voted && <span className="pill pill-approved">voted</span>}
              {r.dup_email && <span className="pill pill-rejected">dup email</span>}
              {r.dup_admission && <span className="pill pill-rejected">dup ID</span>}
              {r.dup_phone && <span className="pill pill-rejected">dup phone</span>}
              {r.similar_to?.length > 0 && (
                <span className="pill pill-rejected" title={`Similar name to: ${r.similar_to.join(', ')}`}>
                  ⚠ similar name
                </span>
              )}
              <StatusPill status={r.status} />
            </div>
            <div className="text-xs text-faint font-mono flex flex-wrap items-center gap-x-2 mt-0.5">
              {r.created_at && <span>{new Date(r.created_at).toLocaleString()}</span>}
              {r.email && <span>· {r.email}</span>}
              {r.admission_number && <span>· #{r.admission_number}</span>}
            </div>
            {r.similar_to?.length > 0 && (
              <div className="text-xs mt-1" style={{ color: 'var(--red)' }}>
                ⚠ Name resembles: {[...new Set(r.similar_to)].join(', ')} — check for a duplicate registration.
              </div>
            )}
          </div>
        </div>
        <div className="action-group items-start shrink-0 flex-nowrap">
          <button className="icon-btn" onClick={() => setOpen((v) => !v)} title={open ? 'Collapse' : 'Expand'}>
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {r.voter_code && (
            <>
              <a className="icon-btn icon-btn-green" href={wa} target="_blank" rel="noreferrer" title="Send on WhatsApp">
                <MessageCircle size={16} />
              </a>
              <a className="icon-btn" href={mail} title="Email code">
                <Mail size={16} />
              </a>
              <button className="icon-btn" onClick={() => { navigator.clipboard?.writeText(r.voter_code); toast('Copied', 'success') }} title="Copy code">
                <Copy size={16} />
              </button>
            </>
          )}
          <div className="relative">
            <button className="icon-btn icon-btn-violet" onClick={() => setShowPick((v) => !v)} title="Make candidate">
              <UserPlus size={16} />
            </button>
            {showPick && (
              <div className="absolute right-0 top-full mt-1 z-10 bg-paper border-4 border-ink min-w-[14rem] max-h-60 overflow-auto shadow-paper">
                <div className="px-3 py-2 text-xs font-mono text-faint border-b border-rule">Add to position…</div>
                {positions.length === 0 && <div className="px-3 py-2 text-sm text-faint">No positions yet — add some in Ballot tab.</div>}
                {positions.map((p) => (
                  <button key={p.id} className="block w-full text-left px-3 py-2 hover:bg-paper2 text-sm"
                    disabled={promoting} onClick={() => promote(p.id)}>
                    {p.title}
                  </button>
                ))}
                <button className="block w-full text-left px-3 py-2 hover:bg-paper2 text-xs text-faint border-t border-rule"
                  onClick={() => setShowPick(false)}>Cancel</button>
              </div>
            )}
          </div>
          <button className="btn px-3 text-sm" onClick={() => setEdit(r)}>Edit</button>
          <button className="icon-btn icon-btn-danger" onClick={() => del(r.id)} title="Delete"><Trash2 size={16} /></button>
        </div>
      </div>

      {open && (
        <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {answerRows(r, fields).map(({ label, value, isFile }, k) => (
            <div key={k} className="flex gap-2 border-b border-dashed border-rule/40 py-1">
              <dt className="text-faint min-w-[8rem] shrink-0">{label}</dt>
              <dd className="font-600 break-words flex-1">
                {isFile || looksLikeImagePath(value)
                  ? <FilePreview path={value} bucket="voter-photos" />
                  : (value || <span className="text-faint font-normal">—</span>)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

function FilePreview({ path, bucket }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { if (path) imageUrl(bucket, path).then(setUrl) }, [path, bucket])
  if (!path) return <span className="text-faint font-normal">—</span>
  return (
    <a href={url || '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 underline text-violet">
      {url && <img src={url} className="h-10 w-10 object-cover border border-rule" alt="" />}
      View file
    </a>
  )
}

function IssuedList({ issued, code, title, whatsappTemplate, toast }) {
  return (
    <div className="space-y-1.5">
      {issued.map((x, i) => {
        const r = { name: x.name, email: x.email, voter_code: x.voter_code, answers: { phone: x.phone } }
        return (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm border-b border-dashed border-rule/30 py-1">
            <span className="font-display font-700 min-w-[10rem]">{x.name || '—'}</span>
            <span className="font-mono text-xs text-faint">{x.email}</span>
            <span className="font-mono text-xs px-2 py-0.5 border-2 border-verify text-verify">{x.voter_code}</span>
            <span className="ml-auto flex gap-1">
              <a className="btn px-2 py-1 text-xs text-verify" href={waLink(r, code, title, whatsappTemplate)} target="_blank" rel="noreferrer"><MessageCircle size={12} /></a>
              <a className="btn px-2 py-1 text-xs" href={mailLink(r, code, title)}><Mail size={12} /></a>
              <button className="btn px-2 py-1 text-xs" onClick={() => { navigator.clipboard?.writeText(x.voter_code); toast('Copied', 'success') }}><Copy size={12} /></button>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function EditModal({ r, code, password, toast, onClose, onSaved }) {
  const [answers, setAnswers] = useState(r.answers || {})
  const [busy, setBusy] = useState(false)
  const keys = Object.keys(answers)
  async function save() {
    setBusy(true)
    try {
      await adminUpdateResponse(code, password, r.id, answers)
      toast('Saved', 'success'); onSaved()
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 bg-ink/40 grid place-items-center p-4 z-50" onClick={onClose}>
      <div className="bg-paper border-4 border-ink p-5 max-w-xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-900 text-xl uppercase">Edit response</h3>
          <button className="btn px-2" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="space-y-2">
          {keys.length === 0 && <p className="text-sm text-faint">No fields.</p>}
          {keys.map((k) => (
            <label key={k} className="block">
              <span className="eyebrow">{k}</span>
              <input className="input" value={String(answers[k] ?? '')}
                onChange={(e) => setAnswers((a) => ({ ...a, [k]: e.target.value }))} />
            </label>
          ))}
        </div>
        <div className="mt-4 flex gap-2 justify-end">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : <><Check size={14} className="inline -mt-1 mr-1" /> Save</>}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---- helpers ---- */
function looksLikeImagePath(v) {
  if (typeof v !== 'string') return false
  return /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(v) && (v.includes('/') || v.length > 20)
}
// ---- Integrity / duplicate detection -------------------------------------
// Flags responses that look like the same person registering twice:
//  • exact duplicate email / admission number / phone
//  • near-duplicate NAME (fuzzy) — catches altered spellings like
//    "Mohamed Munthasir" vs "Mohammed Munthasir"
function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, ' ')                       // drop punctuation
    .replace(/\s+/g, ' ').trim()
}
function phoneDigits(r) {
  const raw = r.raw_data?.phone || r.raw_data?.phone_number || r.raw_data?.whatsapp || r.phone || ''
  return String(raw).replace(/[^0-9]/g, '').replace(/^0/, '').replace(/^94/, '')
}
// Levenshtein distance (small strings, fine for a few hundred rows)
function lev(a, b) {
  if (a === b) return 0
  const m = a.length, n = b.length
  if (!m) return n; if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}
function nameSimilar(a, b) {
  const x = normName(a), y = normName(b)
  if (!x || !y || x.length < 3 || y.length < 3) return false
  if (x === y) return true
  // token-set: same words in any order (handles reordered/extra middle names)
  const xs = new Set(x.split(' ')), ys = new Set(y.split(' '))
  const inter = [...xs].filter((t) => ys.has(t)).length
  const tokenScore = inter / Math.max(xs.size, ys.size)
  if (tokenScore >= 0.6 && inter >= 1) return true
  // edit distance: within ~15% of length (catches 1–2 char spelling tweaks)
  const d = lev(x, y)
  return d <= Math.max(1, Math.round(Math.max(x.length, y.length) * 0.15))
}
function annotateDuplicates(rows) {
  const out = rows.map((r) => ({ ...r, dup_phone: false, similar_to: [] }))
  // exact phone duplicates
  const byPhone = {}
  out.forEach((r) => { const p = phoneDigits(r); if (p) (byPhone[p] = byPhone[p] || []).push(r) })
  Object.values(byPhone).forEach((g) => { if (g.length > 1) g.forEach((r) => { r.dup_phone = true }) })
  // fuzzy name clusters
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      if (nameSimilar(out[i].name, out[j].name)) {
        out[i].similar_to.push(out[j].name || '—')
        out[j].similar_to.push(out[i].name || '—')
      }
    }
  }
  out.forEach((r) => { r.flagged = r.dup_email || r.dup_admission || r.dup_phone || r.similar_to.length > 0 })
  return out
}

function valOf(r, key) {
  let v = r.answers?.[key]
  if (v === undefined || v === null || v === '') {
    if (key === 'name') v = r.name
    else if (key === 'email') v = r.email
    else if (key === 'admission_number') v = r.admission_number
  }
  if (Array.isArray(v)) return v.join(', ')
  return v == null ? '' : String(v)
}
function answerRows(r, fields) {
  if (fields && fields.length) {
    return fields.map((f) => ({
      label: f.label || f.field_key,
      value: valOf(r, f.field_key),
      isFile: f.field_type === 'document',
    }))
  }
  const out = []
  if (r.name) out.push({ label: 'Name', value: r.name })
  if (r.email) out.push({ label: 'Email', value: r.email })
  if (r.admission_number) out.push({ label: 'Admission number', value: String(r.admission_number) })
  Object.entries(r.answers || {}).forEach(([k, v]) =>
    out.push({ label: k, value: Array.isArray(v) ? v.join(', ') : String(v ?? '') }))
  return out
}
function waLink(r, code, title, template) {
  const phone = String(r.answers?.phone || r.answers?.phone_number || r.answers?.whatsapp || '').replace(/[^0-9]/g, '')
  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/e/${code}`
  const msg = (template || 'Hello {name}, your one-time code for {election}: *{code}*. Vote here: {link}')
    .replaceAll('{name}', r.name || '')
    .replaceAll('{code}', r.voter_code || '')
    .replaceAll('{election}', title || '')
    .replaceAll('{link}', link)
    .replaceAll('{election_link}', link)
  const text = encodeURIComponent(msg)
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`
}
function mailLink(r, code, title) {
  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/e/${code}`
  const subj = encodeURIComponent(`Your voting code for ${title || code}`)
  const body = encodeURIComponent(`Hello ${r.name || ''},\n\nYour one-time voting code is: ${r.voter_code}\n\nVote here: ${link}\n`)
  return `mailto:${r.email || ''}?subject=${subj}&body=${body}`
}

function Summary({ rows, fields }) {
  const total = rows.length
  const answeredRate = (f) => rows.filter((r) => valOf(r, f.field_key) !== '').length

  return (
    <div className="space-y-4">
      {/* headline metrics */}
      <div className="card vb-glass p-6">
        <div className="text-xs font-mono uppercase tracking-widest text-muted">Form summary</div>
        <div className="flex items-end gap-3 mt-1">
          <span className="text-4xl font-extrabold vb-gradient-text">{total}</span>
          <span className="text-muted mb-1">response{total === 1 ? '' : 's'} collected</span>
        </div>
        <div className="vb-accent-bar mt-3" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <Metric label="Want to run" value={rows.filter((r) => r.wants_candidacy).length} tone="violet" />
          <Metric label="Code issued" value={rows.filter((r) => r.voter_code).length} tone="green" />
          <Metric label="Pending" value={rows.filter((r) => r.status === 'pending').length} tone="amber" />
          <Metric label="Duplicates" value={rows.filter((r) => r.dup_email || r.dup_admission).length} tone="red" />
        </div>
      </div>

      {(!fields || fields.length === 0) ? (
        <div className="card p-6 text-muted text-sm">Build your form (Form tab) to see a question-by-question breakdown here.</div>
      ) : fields.map((f) => {
        const isChoice = ['dropdown', 'radio', 'checkbox'].includes(f.field_type)
        const answered = answeredRate(f)
        const pct = total ? Math.round((answered / total) * 100) : 0
        return (
          <div key={f.field_key} className="card p-5">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div className="font-semibold">{f.label || f.field_key}</div>
              <div className="text-xs text-faint font-mono">{f.field_type} · {answered}/{total} answered ({pct}%)</div>
            </div>
            <div className="mt-3">
              {isChoice ? (
                <ChoiceBars rows={rows} field={f} options={Array.isArray(f.options) ? f.options : []} />
              ) : (
                <ul className="text-sm space-y-1 max-h-52 overflow-auto pr-1">
                  {answered === 0 && <li className="text-faint">No answers yet.</li>}
                  {rows.filter((r) => valOf(r, f.field_key) !== '').slice(0, 100).map((r, i) => (
                    <li key={i} className="py-1 break-words" style={{ borderBottom: '1px dashed var(--line)' }}>
                      <span className="text-faint font-mono text-xs mr-2">{r.name || '—'}:</span>{valOf(r, f.field_key)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Metric({ label, value, tone }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
      <div className="text-2xl font-extrabold" style={{ color: `var(--${tone})` }}>{value}</div>
      <div className="text-xs text-muted mt-0.5">{label}</div>
    </div>
  )
}

function ChoiceBars({ rows, field, options }) {
  const counts = {}; options.forEach((o) => { counts[o] = 0 }); let blank = 0
  rows.forEach((r) => {
    const raw = r.answers?.[field.field_key]
    if (field.field_type === 'checkbox') {
      const arr = Array.isArray(raw) ? raw : (raw ? [raw] : [])
      if (arr.length === 0) blank++
      arr.forEach((x) => { counts[x] = (counts[x] || 0) + 1 })
    } else {
      if (raw === undefined || raw === null || raw === '') blank++
      else counts[raw] = (counts[raw] || 0) + 1
    }
  })
  const totalAns = Math.max(1, ...Object.values(counts), blank)
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return (
    <div className="space-y-2">
      {sorted.map(([opt, c]) => {
        const pct = Math.round((c / totalAns) * 100)
        return (
          <div key={opt}>
            <div className="flex justify-between text-sm mb-1">
              <span className="truncate pr-2">{opt}</span>
              <span className="font-mono text-xs text-muted shrink-0">{c} · {pct}%</span>
            </div>
            <div className="vb-res-track" style={{ height: 12 }}>
              <div className="vb-res-fill vb-res-win" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
      {blank > 0 && <div className="text-xs text-faint mt-1">No answer: {blank}</div>}
    </div>
  )
}

function StatusPill({ status }) {
  const cls = status === 'approved' ? 'pill-approved'
    : status === 'rejected' ? 'pill-rejected'
    : status === 'converted' ? 'pill-converted' : 'pill-pending'
  return <span className={`pill ${cls}`}>{status || 'pending'}</span>
}