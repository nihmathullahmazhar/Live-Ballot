import { useEffect, useState } from 'react'
import { useToast } from '../../components/Toast'
import { Rule, Spinner } from '../../components/ui'
import {
  adminGetBallot, adminAddPosition, adminDeletePosition,
  adminAddCandidate, adminDeleteCandidate,
  adminApproveCandidate, adminRejectCandidate,
} from '../../lib/api'
import { Plus, Trash2, Check, X, Download } from 'lucide-react'
import { downloadCSV } from '../../lib/csv'

export default function BallotTab({ code, password }) {
  const toast = useToast()
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pTitle, setPTitle] = useState('')
  const [pSeats, setPSeats] = useState(1)
  const [candDraft, setCandDraft] = useState({}) // positionId -> {name, bio}

  async function load() {
    try { setPositions(await adminGetBallot(code, password)) }
    catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])

  async function addPosition() {
    if (!pTitle.trim()) return toast('Enter a position title', 'error')
    setBusy(true)
    try {
      await adminAddPosition(code, password, pTitle.trim(), Number(pSeats) || 1)
      setPTitle(''); setPSeats(1); await load(); toast('Position added', 'success')
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  async function delPosition(id) {
    if (!confirm('Delete this position and all its candidates/votes?')) return
    try { await adminDeletePosition(code, password, id); await load(); toast('Position deleted', 'success') }
    catch (e) { toast(e.message, 'error') }
  }
  async function addCandidate(positionId) {
    const d = candDraft[positionId] || {}
    if (!d.name?.trim()) return toast('Enter a candidate name', 'error')
    try {
      await adminAddCandidate(code, password, positionId, d.name.trim(), d.bio?.trim() || null)
      setCandDraft((s) => ({ ...s, [positionId]: { name: '', bio: '' } }))
      await load(); toast('Candidate added', 'success')
    } catch (e) { toast(e.message, 'error') }
  }
  async function delCandidate(id) {
    try { await adminDeleteCandidate(code, password, id); await load() }
    catch (e) { toast(e.message, 'error') }
  }
  async function approve(id) {
    try { await adminApproveCandidate(code, password, id); await load() }
    catch (e) { toast(e.message, 'error') }
  }
  async function reject(id) {
    try { await adminRejectCandidate(code, password, id, null); await load() }
    catch (e) { toast(e.message, 'error') }
  }

  if (loading) return <div className="panel p-6"><Spinner label="Loading ballot…" /></div>

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-800 text-xl uppercase">Ballot setup</h3>
          <p className="text-faint text-sm mt-1">
            Add the positions people vote for and who's standing. You can do this any time —
            before or after collecting form responses and nominations.
          </p>
        </div>
        <button className="btn text-sm shrink-0" disabled={positions.length === 0}
          onClick={() => {
            const rows = []
            positions.forEach((p) => (p.candidates || []).forEach((c) =>
              rows.push({ position: p.title, candidate: c.name, bio: c.bio || '', status: c.status, source: c.source })))
            if (!downloadCSV(`${code}-candidates`, rows,
              [{ key: 'position', label: 'Position' }, { key: 'candidate', label: 'Candidate' },
               { key: 'bio', label: 'Bio' }, { key: 'status', label: 'Status' }, { key: 'source', label: 'Source' }]))
              toast('No candidates to export', 'error')
          }}>
          <Download size={14} className="inline -mt-1 mr-1" /> Export
        </button>
      </div>

      {/* add a position */}
      <div className="panel p-4 flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-[12rem]">
          <span className="font-display font-700 uppercase text-sm">New position</span>
          <input className="input mt-1" placeholder="e.g. President"
            value={pTitle} onChange={(e) => setPTitle(e.target.value)} />
        </label>
        <label className="w-28">
          <span className="font-display font-700 uppercase text-sm">Seats</span>
          <input className="input mt-1" type="number" min={1} value={pSeats}
            onChange={(e) => setPSeats(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={busy} onClick={addPosition}>
          <Plus size={16} className="inline -mt-1 mr-1" /> Add position
        </button>
      </div>

      {positions.length === 0 ? (
        <div className="panel p-8 text-center text-ink/70">
          No positions yet. Add one above when you're ready to set up voting — your form keeps
          collecting registrations and nominations in the meantime.
        </div>
      ) : positions.map((p) => {
        const d = candDraft[p.id] || { name: '', bio: '' }
        return (
          <div key={p.id} className="panel p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-display font-800 text-lg uppercase">{p.title}</div>
                <div className="text-xs text-faint font-mono">{p.max_winners} seat{p.max_winners > 1 ? 's' : ''}</div>
              </div>
              <button className="btn px-2 py-1 text-ballot" title="Delete position" onClick={() => delPosition(p.id)}>
                <Trash2 size={15} />
              </button>
            </div>

            <Rule />

            {(p.candidates || []).length === 0 ? (
              <p className="text-sm text-faint">No candidates yet.</p>
            ) : (
              <ul className="space-y-2">
                {p.candidates.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 border-2 border-rule bg-white px-3 py-2">
                    <div className="min-w-0">
                      <span className="font-600">{c.name}</span>
                      {c.bio && <span className="text-faint text-sm"> — {c.bio}</span>}
                      <span className="ml-2 text-[11px] font-mono uppercase border border-rule px-1">
                        {c.status}{c.source === 'self_nominated' ? ' · nominee' : ''}
                      </span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {c.status === 'pending' && (
                        <>
                          <button className="btn px-2 py-1 text-green-700" title="Approve" onClick={() => approve(c.id)}><Check size={14} /></button>
                          <button className="btn px-2 py-1 text-ballot" title="Reject" onClick={() => reject(c.id)}><X size={14} /></button>
                        </>
                      )}
                      <button className="btn px-2 py-1" title="Delete" onClick={() => delCandidate(c.id)}><Trash2 size={14} /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* add candidate */}
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <input className="input flex-1 min-w-[10rem]" placeholder="Candidate name"
                value={d.name} onChange={(e) => setCandDraft((s) => ({ ...s, [p.id]: { ...d, name: e.target.value } }))} />
              <input className="input flex-1 min-w-[10rem]" placeholder="Short bio (optional)"
                value={d.bio} onChange={(e) => setCandDraft((s) => ({ ...s, [p.id]: { ...d, bio: e.target.value } }))} />
              <button className="btn" onClick={() => addCandidate(p.id)}>
                <Plus size={14} className="inline -mt-1 mr-1" /> Add
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}