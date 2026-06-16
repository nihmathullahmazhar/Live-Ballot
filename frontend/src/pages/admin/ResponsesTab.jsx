import { useEffect, useState, useCallback, useRef } from 'react'
import { Eyebrow, Spinner } from '../../components/ui'
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
      setRows(resp)
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
      if (!r.dup_email && !r.dup_admission) return false
    } else if (filter !== 'all' && r.status !== filter) return false
    if (!q.trim()) return true
    const hay = `${r.name || ''} ${r.email || ''} ${r.admission_number || ''} ${r.voter_code || ''}`.toLowerCase()
    return hay.includes(q.toLowerCase())
  })
  const selectedIds = Object.keys(sel).filter((id) => sel[id])

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

  if (loading && rows.length === 0) return <div className="panel p-6"><Spinner label="Loading responses…" /></div>

  return (
    <div className="space-y-4">
      <div className="panel p-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
            <input className="input pl-7 max-w-xs" placeholder="Search name / email / code"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="converted">Code issued</option>
            <option value="duplicates">Duplicates only</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn text-sm" onClick={load} title="Refresh">
            <RefreshCw size={14} className="inline -mt-1 mr-1" /> Refresh
          </button>
          <button className="btn text-sm" disabled={list.length === 0} onClick={exportResponses}>
            <Download size={14} className="inline -mt-1 mr-1" /> Export
          </button>
          <button className="btn btn-primary" disabled={busy || selectedIds.length === 0} onClick={generate}>
            <KeyRound size={15} className="inline -mt-1 mr-1" />
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
          {list.length} of {rows.length} responses
          {electionId && <span className="ml-2 text-verify font-mono">● live</span>}
        </span>
      </div>

      {issued.length > 0 && (
        <div className="panel p-5 border-verify">
          <div className="flex items-center justify-between mb-2">
            <Eyebrow className="text-verify">Codes just issued — share via WhatsApp / email / copy</Eyebrow>
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
        <div className="panel divide-y-2 divide-rule/30">
          {list.length === 0 && <div className="p-6 text-faint text-sm">No responses.</div>}
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
    <div className="p-4">
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div className="flex items-start gap-3 min-w-0">
          {r.status === 'pending' && (
            <input type="checkbox" className="mt-1" checked={!!sel[r.id]}
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
          <div className="min-w-0">
            <div className="font-display font-700 flex flex-wrap items-center gap-2">
              <button onClick={() => setOpen((v) => !v)} className="hover:text-violet">
                {r.name || 'Unnamed'}
              </button>
              {r.voter_code && (
                <button onClick={() => { navigator.clipboard?.writeText(r.voter_code); toast('Code copied', 'success') }}
                  className="text-xs font-mono px-2 py-0.5 border-2 border-verify text-verify bg-white hover:bg-verify hover:text-white"
                  title="Click to copy">
                  <KeyRound size={11} className="inline -mt-0.5 mr-1" />{r.voter_code}
                </button>
              )}
              {r.wants_candidacy && (
                <span className="text-xs font-mono text-violet">candidate
                  {r.candidate_positions?.length > 0 && ` · ${r.candidate_positions.join(', ')}`}</span>
              )}
              {r.has_voted && <span className="text-xs font-mono text-verify">✓ voted</span>}
              {r.dup_email && <span className="text-xs font-mono text-ballot">⚑ dup email</span>}
              {r.dup_admission && <span className="text-xs font-mono text-ballot">⚑ dup ID</span>}
              <span className={`text-xs font-mono ${r.status === 'converted' ? 'text-verify' : 'text-faint'}`}>· {r.status}</span>
            </div>
            <div className="text-xs text-faint font-mono flex items-center gap-2">
              {r.created_at && <span>{new Date(r.created_at).toLocaleString()}</span>}
              {r.email && <span>· {r.email}</span>}
              {r.admission_number && <span>· #{r.admission_number}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-start">
          <button className="btn px-2 py-1 text-sm" onClick={() => setOpen((v) => !v)} title={open ? 'Collapse' : 'Expand'}>
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {r.voter_code && (
            <>
              <a className="btn px-2 py-1 text-sm text-verify" href={wa} target="_blank" rel="noreferrer" title="WhatsApp">
                <MessageCircle size={14} />
              </a>
              <a className="btn px-2 py-1 text-sm" href={mail} title="Email">
                <Mail size={14} />
              </a>
              <button className="btn px-2 py-1 text-sm" onClick={() => { navigator.clipboard?.writeText(r.voter_code); toast('Copied', 'success') }} title="Copy code">
                <Copy size={14} />
              </button>
            </>
          )}
          <div className="relative">
            <button className="btn px-2 py-1 text-sm text-violet" onClick={() => setShowPick((v) => !v)} title="Make candidate">
              <UserPlus size={14} />
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
          <button className="btn btn-danger px-3" onClick={() => del(r.id)}><Trash2 size={15} /></button>
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
  if (!fields || fields.length === 0)
    return <div className="panel p-6 text-faint text-sm">Build your form (Form tab) to see a question-by-question summary here.</div>
  const total = rows.length
  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <span className="font-display font-900 text-2xl">{total}</span>
        <span className="text-faint ml-2">response{total === 1 ? '' : 's'}</span>
      </div>
      {fields.map((f) => {
        const isChoice = ['dropdown', 'radio', 'checkbox'].includes(f.field_type)
        const answered = rows.filter((r) => valOf(r, f.field_key) !== '')
        return (
          <div key={f.field_key} className="panel p-4">
            <div className="font-display font-700">{f.label || f.field_key}</div>
            <div className="text-xs text-faint font-mono mb-2">{f.field_type} · {answered.length}/{total} answered</div>
            {isChoice ? (
              <ChoiceBars rows={rows} field={f} options={Array.isArray(f.options) ? f.options : []} />
            ) : (
              <ul className="text-sm space-y-0.5 max-h-52 overflow-auto">
                {answered.length === 0 && <li className="text-faint">No answers yet.</li>}
                {answered.slice(0, 100).map((r, i) => (
                  <li key={i} className="border-b border-dashed border-rule/40 py-0.5 break-words">{valOf(r, f.field_key)}</li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
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
  const max = Math.max(1, ...Object.values(counts), blank)
  return (
    <div className="space-y-1">
      {Object.entries(counts).map(([opt, c]) => (
        <div key={opt} className="flex items-center gap-2 text-sm">
          <span className="min-w-[7rem] sm:min-w-[10rem] shrink-0 truncate">{opt}</span>
          <span className="flex-1 bg-paper2 h-4 border border-rule/30">
            <span className="block h-full bg-violet" style={{ width: `${(c / max) * 100}%` }} />
          </span>
          <span className="font-mono text-xs w-8 text-right">{c}</span>
        </div>
      ))}
      {blank > 0 && <div className="text-xs text-faint mt-1">No answer: {blank}</div>}
    </div>
  )
}