import { useEffect, useState, useCallback } from 'react'
import { Eyebrow, Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'
import {
  adminGetVoters, adminRegenerateCode, adminSetVoterCode, adminImportVoters,
} from '../../lib/api'
import { Copy, Check, RefreshCw, Pencil, Download, Upload } from 'lucide-react'

export default function VotersTab({ code, password, settings }) {
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

  async function regen(id) {
    try { const r = await adminRegenerateCode(code, password, id); toast(`New code: ${r.voter_code}`, 'success'); load() }
    catch (e) { toast(e.message, 'error') }
  }
  async function override(id) {
    const nc = prompt('Enter the new code for this voter:')
    if (!nc) return
    try { await adminSetVoterCode(code, password, id, nc.trim()); toast('Code updated', 'success'); load() }
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
          <button className="btn text-sm" onClick={exportCsv}>
            <Download size={14} className="inline -mt-1 mr-1" /> Export CSV
          </button>
          <label className="btn text-sm cursor-pointer">
            <Upload size={14} className="inline -mt-1 mr-1" /> Import CSV
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} />
          </label>
        </div>
      </div>

      <p className="eyebrow">{filtered.length} of {voters.length} shown</p>

      <div className="panel divide-y-2 divide-rule/30">
        {filtered.length === 0 && <div className="p-6 text-faint text-sm">No voters match.</div>}
        {filtered.map((v) => (
          <div key={v.id} className="p-4 flex flex-wrap items-center gap-3 justify-between">
            <div className="min-w-0">
              <div className="font-display font-700">
                {v.name || <span className="text-faint">Unnamed</span>}
                <StatusDot status={v.status} />
                {v.has_voted && <span className="ml-2 text-xs font-mono text-violet">voted</span>}
                {v.duplicate_selfie && <span className="ml-2 text-xs font-mono text-ballot">⚑ dup selfie</span>}
              </div>
              <div className="text-sm text-faint font-mono truncate">
                {v.email}{v.admission_number ? ` · #${v.admission_number}` : ''}{v.grade ? ` · ${v.grade}` : ''}
              </div>
            </div>

            {usesCodes && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg tracking-widest border-2 border-rule bg-white px-3 py-1">
                  {v.voter_code || <span className="text-faint text-sm">not issued</span>}
                </span>
                {v.voter_code && (
                  <button className="btn px-2 py-2" title="Copy code" onClick={() => copy(v.voter_code, v.id)}>
                    {copiedId === v.id ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                )}
                <button className="btn px-2 py-2" title="Regenerate" onClick={() => regen(v.id)}><RefreshCw size={15} /></button>
                <button className="btn px-2 py-2" title="Override code" onClick={() => override(v.id)}><Pencil size={15} /></button>
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
