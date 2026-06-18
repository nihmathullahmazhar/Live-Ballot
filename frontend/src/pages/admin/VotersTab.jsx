import { useEffect, useState, useCallback } from 'react'
import { Eyebrow, Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'
import {
  adminGetVoters, adminRegenerateCode, adminSetVoterCode, adminImportVoters,
  adminBulkImportVoters, adminDeleteVoter, subscribeElection,
} from '../../lib/api'
import { Copy, Check, RefreshCw, Pencil, Download, Upload, ClipboardPaste, MessageCircle, Mail, Trash2 } from 'lucide-react'

export default function VotersTab({ code, password, settings, electionId, title, whatsappTemplate }) {
  const toast = useToast()
  const [voters, setVoters] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [copiedId, setCopiedId] = useState('')
  const usesCodes = settings.voter_identity_method === 'generated_code'

  const load = useCallback(async () => {
    setLoading(true)
    try { setVoters(await adminGetVoters(code, password)) }
    catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }, [code, password, toast])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!electionId) return
    return subscribeElection('registrations', electionId, () => load())
  }, [electionId, load])

  const [showBulk, setShowBulk] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)

  async function bulkPaste() {
    const rows = parsePastedRows(bulkText)
    if (rows.length === 0) return toast('No rows detected. One person per line, comma or tab separated.', 'error')
    setBulkBusy(true)
    try {
      const res = await adminBulkImportVoters(code, password, rows, true)
      toast(`Imported ${res.imported} — codes ready`, 'success')
      setBulkText(''); setShowBulk(false); load()
    } catch (e) { toast(e.message, 'error') }
    finally { setBulkBusy(false) }
  }

  const filtered = voters.filter((v) => {
    if (filter === 'voted' && !v.has_voted) return false
    if (filter === 'not_voted' && v.has_voted) return false
    if (filter === 'pending' && v.status !== 'pending') return false
    if (filter === 'flagged' && !v.duplicate_selfie) return false
    if (!q.trim()) return true
    const hay = `${v.name || ''} ${v.email || ''} ${v.admission_number || ''} ${v.voter_code || ''}`.toLowerCase()
    return hay.includes(q.toLowerCase())
  })

  function copy(text, id) {
    if (!text) return
    navigator.clipboard?.writeText(text)
    setCopiedId(id); setTimeout(() => setCopiedId(''), 1200)
  }

  async function regen(id, v) {
    if (v?.has_voted && !confirm(
      `⚠️ "${v.name || 'This voter'}" has ALREADY VOTED.\n\n` +
      `Generating a new code does NOT let them vote again — their vote is already counted ` +
      `and the system blocks a second vote.\n\nAre you sure you want a new code anyway?`
    )) return
    try { const r = await adminRegenerateCode(code, password, id); toast(`New code: ${r.voter_code}`, 'success'); load() }
    catch (e) { toast(e.message, 'error') }
  }
  async function override(id, v) {
    if (v?.has_voted && !confirm(
      `⚠️ "${v.name || 'This voter'}" has ALREADY VOTED.\n\n` +
      `Setting a new code does NOT let them vote again — their vote is already counted.\n\nContinue anyway?`
    )) return
    const nc = prompt('Enter the new code for this voter:')
    if (!nc) return
    try { await adminSetVoterCode(code, password, id, nc.trim()); toast('Code updated', 'success'); load() }
    catch (e) { toast(e.message, 'error') }
  }
  async function del(v) {
    if (!confirm(`Delete voter "${v.name || v.email || v.voter_code}"? This cannot be undone.`)) return
    try { await adminDeleteVoter(code, password, v.id); toast('Voter deleted', 'success'); load() }
    catch (e) { toast(e.message, 'error') }
  }

  function exportCsv() {
    const head = ['name', 'email', 'grade', 'batch', 'admission_number', 'voter_code', 'status', 'has_voted']
    const rows = filtered.map((v) => head.map((h) => csvCell(v[h])).join(','))
    downloadCsv(`voters-${code}.csv`, [head.join(','), ...rows].join('\n'))
  }

  async function importCsv(e) {
    const file = e.target.files?.[0]; if (!file) return
    const text = await file.text()
    const rows = parseCsv(text)
    if (rows.length === 0) return toast('No rows found in CSV', 'error')
    try {
      const res = await adminImportVoters(code, password, rows)
      toast(`Imported ${res.imported?.length || 0} voters`, 'success')
      load()
    } catch (err) { toast(err.message, 'error') }
    e.target.value = ''
  }

  if (loading && voters.length === 0) return <div className="panel p-6"><Spinner label="Loading voters…" /></div>

  return (
    <div className="space-y-4">
      <div className="panel p-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 flex-wrap items-center">
          <input className="input max-w-xs" placeholder="Search name / email / code"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="voted">Voted</option>
            <option value="not_voted">Not voted</option>
            <option value="pending">Pending review</option>
            <option value="flagged">Flagged selfie</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn text-sm" onClick={() => setShowBulk((v) => !v)}>
            <ClipboardPaste size={14} className="inline -mt-1 mr-1" /> Paste list
          </button>
          <button className="btn text-sm" onClick={exportCsv}>
            <Download size={14} className="inline -mt-1 mr-1" /> Export CSV
          </button>
          <label className="btn text-sm cursor-pointer">
            <Upload size={14} className="inline -mt-1 mr-1" /> Import CSV
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} />
          </label>
        </div>
      </div>

      {showBulk && (
        <div className="panel p-4 space-y-2 border-violet">
          <div className="font-display font-700 uppercase text-sm">Paste a list — one person per line</div>
          <p className="text-xs text-faint">
            Columns separated by comma or tab. Use the header row to label columns:
            <span className="font-mono"> name, email, phone, admission</span> (any subset works).
            Each row becomes an approved voter with a one-time code generated immediately.
          </p>
          <textarea className="input min-h-[140px] font-mono text-sm" value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`name, email, phone, admission\nAlice, a@x.lk, +94771234567, A001\nBilal, b@x.lk, +94777654321, A002`} />
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={bulkBusy} onClick={bulkPaste}>
              {bulkBusy ? 'Importing…' : 'Import & generate codes'}
            </button>
            <button className="btn" onClick={() => setShowBulk(false)} disabled={bulkBusy}>Cancel</button>
          </div>
        </div>
      )}

      <p className="eyebrow">
        {filtered.length} of {voters.length} shown
        <span className="mx-2">·</span>
        <span style={{ color: 'var(--red)' }}>{voters.filter((v) => v.has_voted).length} voted</span>
        <span className="mx-1">/</span>
        <span style={{ color: 'var(--green)' }}>{voters.filter((v) => !v.has_voted).length} not voted</span>
      </p>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="panel p-8 text-center text-faint">No voters match.</div>
        )}
        {filtered.length === 0 && <div className="p-6 text-faint text-sm">No voters match.</div>}
        {filtered.map((v) => (
          <div key={v.id}
            className="row-card flex flex-wrap items-center gap-3 justify-between"
            style={v.has_voted ? { background: 'var(--red-bg)', borderColor: '#f0c2c8' } : undefined}>
            <div className="min-w-0">
              <div className="font-display font-700 flex items-center gap-2 flex-wrap">
                <span style={v.has_voted ? { color: 'var(--red)', textDecoration: 'line-through', textDecorationThickness: '2px' } : undefined}>
                  {v.name || <span className="text-faint">Unnamed</span>}
                </span>
                {v.has_voted
                  ? <span className="pill pill-rejected" style={{ fontWeight: 800 }}>✓ VOTED</span>
                  : <span className="pill pill-approved">not voted</span>}
                <StatusPill status={v.status} />
                {v.duplicate_selfie && <span className="pill pill-rejected">⚑ dup selfie</span>}
              </div>
              <div className="text-sm text-faint font-mono truncate mt-0.5">
                {v.email}{v.admission_number ? ` · #${v.admission_number}` : ''}{v.grade ? ` · ${v.grade}` : ''}
              </div>
            </div>

            {usesCodes && (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="code-chip" style={v.has_voted ? { opacity: .55, textDecoration: 'line-through' } : undefined}>
                  {v.voter_code || <span className="text-faint text-sm tracking-normal">not issued</span>}
                </span>
                <div className="action-group">
                  {v.voter_code && (
                    <>
                      <button className="icon-btn" title="Copy code" onClick={() => copy(v.voter_code, v.id)}>
                        {copiedId === v.id ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                      <a className="icon-btn icon-btn-green" title="Send on WhatsApp"
                         href={waLink(v, code, title, whatsappTemplate)} target="_blank" rel="noreferrer">
                        <MessageCircle size={16} />
                      </a>
                      <a className="icon-btn" title="Email code" href={mailLink(v, code, title)}>
                        <Mail size={16} />
                      </a>
                    </>
                  )}
                  <button className="icon-btn" title="Regenerate code" onClick={() => regen(v.id, v)}><RefreshCw size={16} /></button>
                  <button className="icon-btn" title="Set custom code" onClick={() => override(v.id, v)}><Pencil size={16} /></button>
                  <button className="icon-btn icon-btn-danger" title="Delete voter" onClick={() => del(v)}><Trash2 size={16} /></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-faint">
        Distribute codes however you like — copy them here, or export the CSV for
        WhatsApp / mail-merge / print.
      </p>
    </div>
  )
}

function StatusDot({ status }) {
  const c = status === 'approved' ? 'text-verify' : status === 'rejected' ? 'text-ballot' : 'text-faint'
  return <span className={`ml-2 text-xs font-mono ${c}`}>· {status}</span>
}

function StatusPill({ status }) {
  const cls = status === 'approved' ? 'pill-approved'
    : status === 'rejected' ? 'pill-rejected'
    : status === 'converted' ? 'pill-converted' : 'pill-pending'
  return <span className={`pill ${cls}`}>{status || 'pending'}</span>
}

/* ---- CSV helpers ---- */
function csvCell(v) {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function downloadCsv(name, content) {
  const blob = new Blob([content], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line)
    const row = {}
    headers.forEach((h, i) => { row[h] = (cells[i] || '').trim() })
    return {
      name: row.name || row['full name'] || '',
      email: row.email || '',
      grade: row.grade || row.class || '',
      batch: row.batch || row.year || '',
      admission_number: row.admission_number || row['admission no'] || row.admission || '',
    }
  })
}
function splitCsvLine(line) {
  const out = []; let cur = ''; let inq = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inq) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') inq = false
      else cur += ch
    } else if (ch === '"') inq = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

// Parse pasted text: header row (name/email/phone/admission), then data rows
// separated by commas or tabs. Tolerant to mixed delimiters and extra spaces.
function parsePastedRows(text) {
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const splitRow = (l) => l.includes('\t') ? l.split('\t') : l.split(',')
  const cells0 = splitRow(lines[0]).map((c) => c.trim().toLowerCase())
  const knownHeaders = ['name', 'email', 'phone', 'whatsapp', 'admission', 'admission_number']
  const hasHeader = cells0.some((c) => knownHeaders.includes(c))
  let header = hasHeader ? cells0 : ['name', 'email', 'phone', 'admission_number']
  // normalise aliases
  header = header.map((h) => h === 'admission' ? 'admission_number'
                            : h === 'whatsapp' ? 'phone' : h)
  const dataLines = hasHeader ? lines.slice(1) : lines
  return dataLines.map((l) => {
    const cells = splitRow(l).map((c) => c.trim())
    const row = {}
    header.forEach((h, i) => { if (cells[i]) row[h] = cells[i] })
    return row
  }).filter((r) => r.name || r.email || r.phone || r.admission_number)
}

// WhatsApp / email link helpers — same template behaviour as ResponsesTab
function normalizePhone(raw) {
  let p = String(raw || '').replace(/[^0-9]/g, '')
  if (!p) return ''
  // already international (starts with country code 94) and long enough
  if (p.startsWith('94') && p.length >= 11) return p
  // local format starting with 0 → drop 0, prepend Sri Lanka code 94
  if (p.startsWith('0')) return '94' + p.slice(1)
  // bare 9-digit local number (e.g. 760912161) → prepend 94
  if (p.length === 9) return '94' + p
  // 10-digit without leading 0 but looks local → prepend 94
  if (p.length === 10 && !p.startsWith('94')) return '94' + p
  return p
}

function waLink(v, code, title, template) {
  const phone = normalizePhone(v.raw_data?.phone || v.raw_data?.phone_number || v.raw_data?.whatsapp)
  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/e/${code}`
  const msg = (template || 'Hello {name}, your one-time code for {election}: *{code}*. Vote here: {link}')
    .replaceAll('{name}', v.name || '')
    .replaceAll('{code}', v.voter_code || '')
    .replaceAll('{election}', title || '')
    .replaceAll('{link}', link)
  const text = encodeURIComponent(msg)
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`
}
function mailLink(v, code, title) {
  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/e/${code}`
  const subj = encodeURIComponent(`Your voting code for ${title || code}`)
  const body = encodeURIComponent(`Hello ${v.name || ''},\n\nYour one-time voting code is: ${v.voter_code}\n\nVote here: ${link}\n`)
  return `mailto:${v.email || ''}?subject=${subj}&body=${body}`
}