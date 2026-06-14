import { useEffect, useState, useCallback } from 'react'
import { Eyebrow, Rule, Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'
import {
  adminGetResponses, adminDeleteResponse, adminGenerateCodes, adminUpdateResponse,
} from '../../lib/api'
import { Trash2, KeyRound, Search, Download, MessageCircle, Mail, Check, X } from 'lucide-react'
import { downloadCSV } from '../../lib/csv'

export default function ResponsesTab({ code, password }) {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('pending')
  const [sel, setSel] = useState({})            // id -> bool
  const [issued, setIssued] = useState([])       // results of last generate
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(null)         // response being edited

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await adminGetResponses(code, password)) }
    catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }, [code, password, toast])
  useEffect(() => { load() }, [load])

  const list = rows.filter((r) => {
    if (filter !== 'all' && r.status !== filter) return false
    if (!q.trim()) return true
    const hay = `${r.name || ''} ${r.email || ''} ${r.admission_number || ''}`.toLowerCase()
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
    if (!window.confirm('Delete this response?')) return
    try { await adminDeleteResponse(code, password, id); toast('Deleted', 'success'); load() }
    catch (e) { toast(e.message, 'error') }
  }

  function exportIssued() {
    const head = ['name', 'email', 'voter_code']
    const lines = issued.map((x) => [x.name, x.email, x.voter_code].map(csv).join(','))
    download(`codes-${code}.csv`, [head.join(','), ...lines].join('\n'))
  }

  function exportResponses() {
    const data = list.map((r) => ({
      name: r.name || '', email: r.email || '', admission_number: r.admission_number || '',
      status: r.status, wants_candidacy: r.wants_candidacy ? 'yes' : 'no',
      voter_code: r.voter_code || '', answers: r.raw_data || {},
      submitted: r.created_at ? new Date(r.created_at).toLocaleString() : '',
    }))
    if (!downloadCSV(`${code}-responses`, data)) toast('Nothing to export', 'error')
  }

  if (loading && rows.length === 0) return <div className="panel p-6"><Spinner label="Loading responses…" /></div>

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="panel p-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
            <input className="input pl-7 max-w-xs" placeholder="Search name / email"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="converted">Code issued</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn text-sm" disabled={list.length === 0}
            onClick={() => exportResponses()}>
            <Download size={14} className="inline -mt-1 mr-1" /> Export
          </button>
          <button className="btn btn-primary" disabled={busy || selectedIds.length === 0} onClick={generate}>
            <KeyRound size={15} className="inline -mt-1 mr-1" />
            Generate codes ({selectedIds.length})
          </button>
        </div>
      </div>

      {/* Issued panel + distribution */}
      {issued.length > 0 && (
        <div className="panel p-5 border-verify">
          <div className="flex items-center justify-between">
            <Eyebrow className="text-verify">Codes just issued — distribute them</Eyebrow>
            <button className="btn text-sm" onClick={exportIssued}>
              <Download size={14} className="inline -mt-1 mr-1" /> CSV
            </button>
          </div>
          <div className="mt-3 space-y-2 max-h-72 overflow-auto">
            {issued.map((x) => {
              const msg = `Your voting code for the election (${code}) is: ${x.voter_code}. Vote here: ${window.location.origin}/e/${code}`
              const wa = `https://wa.me/?text=${encodeURIComponent(msg)}`
              const mail = `mailto:${x.email || ''}?subject=${encodeURIComponent('Your voting code')}&body=${encodeURIComponent(msg)}`
              return (
                <div key={x.registration_id} className="flex flex-wrap items-center gap-2 justify-between border-2 border-rule bg-white px-3 py-2">
                  <span className="text-sm">{x.name || 'Unnamed'} <span className="text-faint">·</span> <span className="font-mono">{x.voter_code}</span></span>
                  <div className="flex gap-2">
                    <a className="btn px-2 py-1 text-sm text-verify" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={14} /></a>
                    <a className="btn px-2 py-1 text-sm" href={mail}><Mail size={14} /></a>
                    <button className="btn px-2 py-1 text-sm" onClick={() => { navigator.clipboard?.writeText(x.voter_code); toast('Copied', 'success') }}>Copy</button>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-faint mt-2">
            WhatsApp/email buttons open a prepared message (no API needed). Bulk auto-send via
            WhatsApp Business API / Resend can be wired later.
          </p>
        </div>
      )}

      <p className="eyebrow">{list.length} of {rows.length} shown</p>

      {/* Responses list */}
      <div className="panel divide-y-2 divide-rule/30">
        {list.length === 0 && <div className="p-6 text-faint text-sm">No responses.</div>}
        {list.map((r) => (
          <div key={r.id} className="p-4 flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-start gap-3 min-w-0">
              {r.status === 'pending' && (
                <input type="checkbox" className="mt-1" checked={!!sel[r.id]}
                  onChange={(e) => setSel((s) => ({ ...s, [r.id]: e.target.checked }))} />
              )}
              <div className="min-w-0">
                <div className="font-display font-700">
                  {r.name || 'Unnamed'}
                  {r.wants_candidacy && <span className="ml-2 text-xs font-mono text-violet">candidate</span>}
                  {r.dup_email && <span className="ml-2 text-xs font-mono text-ballot">⚑ dup email</span>}
                  {r.dup_admission && <span className="ml-2 text-xs font-mono text-ballot">⚑ dup ID</span>}
                  <span className={`ml-2 text-xs font-mono ${r.status === 'converted' ? 'text-verify' : 'text-faint'}`}>· {r.status}</span>
                </div>
                <div className="text-sm text-faint font-mono truncate">
                  {r.email}{r.admission_number ? ` · #${r.admission_number}` : ''}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn px-3 text-sm" onClick={() => setEdit(r)}>View / edit</button>
              <button className="btn btn-danger px-3" onClick={() => del(r.id)}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>

      {edit && (
        <EditModal r={edit} code={code} password={password} toast={toast}
          onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />
      )}
    </div>
  )
}

function EditModal({ r, code, password, toast, onClose, onSaved }) {
  const [answers, setAnswers] = useState(r.answers || {})
  const [busy, setBusy] = useState(false)
  const keys = Object.keys(answers)

  async function save() {
    setBusy(true)
    try { await adminUpdateResponse(code, password, r.id, answers, null, null); toast('Saved', 'success'); onSaved() }
    catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/70 grid place-items-center p-4" onClick={onClose}>
      <div className="panel p-6 bg-paper max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <Eyebrow>Edit response</Eyebrow>
          <button className="btn px-2 py-1" onClick={onClose}><X size={15} /></button>
        </div>
        <Rule />
        <div className="space-y-3 max-h-[55vh] overflow-auto">
          {keys.length === 0 && <p className="text-faint text-sm">No stored answers.</p>}
          {keys.map((k) => (
            <label key={k} className="block">
              <span className="eyebrow">{k}</span>
              <input className="input"
                value={Array.isArray(answers[k]) ? answers[k].join(', ') : (answers[k] ?? '')}
                onChange={(e) => setAnswers((a) => ({ ...a, [k]: e.target.value }))} />
            </label>
          ))}
        </div>
        {r.wants_candidacy && (
          <p className="text-xs text-violet mt-3 font-mono">
            This person opted into candidacy. Approve their position(s) in the Nominations tab after issuing a code.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/* csv helpers */
function csv(v) { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
function download(name, content) {
  const blob = new Blob([content], { type: 'text/csv' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a')
  a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url)
}