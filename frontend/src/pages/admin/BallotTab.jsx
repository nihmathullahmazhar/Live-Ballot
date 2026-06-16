import { useEffect, useState } from 'react'
import { useToast } from '../../components/Toast'
import { Rule, Spinner } from '../../components/ui'
import {
  adminGetBallot, adminAddPosition, adminDeletePosition,
  adminAddCandidate, adminDeleteCandidate,
  adminApproveCandidate, adminRejectCandidate,
  adminUpdatePosition, adminReorderPositions,
  subscribeElection, imageUrl,
} from '../../lib/api'
import { Plus, Trash2, Check, X, Download, RefreshCw, ImageIcon,
  ArrowUp, ArrowDown, Pencil } from 'lucide-react'
import { downloadCSV } from '../../lib/csv'

export default function BallotTab({ code, password, electionId }) {
  const toast = useToast()
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pTitle, setPTitle] = useState('')
  const [pSeats, setPSeats] = useState(1)
  const [candDraft, setCandDraft] = useState({}) // positionId -> {name, bio}
  const [editingPos, setEditingPos] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editSeats, setEditSeats] = useState(1)

  async function savePos(id) {
    try {
      await adminUpdatePosition(code, password, id, editTitle, Number(editSeats) || 1)
      toast('Position updated', 'success'); setEditingPos(null); load()
    } catch (e) { toast(e.message, 'error') }
  }

  async function moveBy(idx, delta) {
    const next = [...positions]
    const tgt = idx + delta
    if (tgt < 0 || tgt >= next.length) return
    ;[next[idx], next[tgt]] = [next[tgt], next[idx]]
    setPositions(next) // optimistic
    try {
      await adminReorderPositions(code, password, next.map((p) => p.id))
    } catch (e) { toast(e.message, 'error'); load() }
  }

  async function load() {
    try { setPositions(await adminGetBallot(code, password)) }
    catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])
  useEffect(() => {
    if (!electionId) return
    const a = subscribeElection('candidates', electionId, () => load())
    const b = subscribeElection('positions', electionId, () => load())
    return () => { a(); b() }
    /* eslint-disable-next-line */
  }, [electionId])

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
        <div className="flex gap-2 shrink-0">
          <button className="btn text-sm" onClick={load} title="Refresh">
            <RefreshCw size={14} className="inline -mt-1 mr-1" /> Refresh
          </button>
          <button className="btn text-sm" disabled={positions.length === 0}
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
        {electionId && <span className="ml-2 text-xs font-mono text-verify self-center hidden sm:inline">● live</span>}
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
      ) : positions.map((p, idx) => {
        const d = candDraft[p.id] || { name: '', bio: '' }
        const isEditing = editingPos === p.id
        return (
          <div key={p.id} className="panel p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input className="input flex-1 min-w-[10rem]" value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)} />
                    <label className="text-xs font-mono text-faint flex items-center gap-1">
                      seats <input className="input w-16" type="number" min={1}
                        value={editSeats} onChange={(e) => setEditSeats(e.target.value)} />
                    </label>
                    <button className="btn btn-primary px-3 text-sm" onClick={() => savePos(p.id)}>Save</button>
                    <button className="btn px-3 text-sm" onClick={() => setEditingPos(null)}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <div className="font-display font-800 text-lg uppercase">{p.title}</div>
                    <div className="text-xs text-faint font-mono">{p.max_winners} seat{p.max_winners > 1 ? 's' : ''}</div>
                  </>
                )}
              </div>
              {!isEditing && (
                <div className="flex gap-1 shrink-0">
                  <button className="btn px-2 py-1" title="Move up" disabled={idx === 0}
                    onClick={() => moveBy(idx, -1)}><ArrowUp size={14} /></button>
                  <button className="btn px-2 py-1" title="Move down" disabled={idx === positions.length - 1}
                    onClick={() => moveBy(idx, +1)}><ArrowDown size={14} /></button>
                  <button className="btn px-2 py-1" title="Edit"
                    onClick={() => { setEditingPos(p.id); setEditTitle(p.title); setEditSeats(p.max_winners) }}>
                    <Pencil size={14} />
                  </button>
                  <button className="btn px-2 py-1 text-ballot" title="Delete position" onClick={() => delPosition(p.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>

            <Rule />

            {(p.candidates || []).length === 0 ? (
              <p className="text-sm text-faint">No candidates yet.</p>
            ) : (
              <ul className="space-y-2">
                {p.candidates.map((c) => (
                  <CandidateRow key={c.id} c={c} onApprove={approve} onReject={reject} onDelete={delCandidate} />
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

function CandidateRow({ c, onApprove, onReject, onDelete }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { if (c.photo_path) imageUrl('candidate-photos', c.photo_path).then(setUrl) }, [c.photo_path])
  return (
    <li className="flex items-center justify-between gap-2 border-2 border-rule bg-white px-3 py-2">
      <div className="flex items-center gap-3 min-w-0">
        {c.photo_path ? (
          <div className="h-12 w-12 border-2 border-rule overflow-hidden shrink-0">
            {url
              ? <img src={url} alt="" className="h-full w-full object-cover" />
              : <div className="h-full w-full grid place-items-center text-faint"><ImageIcon size={16} /></div>}
          </div>
        ) : c.source === 'self_nominated' ? (
          <div className="h-12 w-12 border-2 border-dashed border-rule grid place-items-center text-faint shrink-0" title="No photo uploaded">
            <ImageIcon size={16} />
          </div>
        ) : null}
        <div className="min-w-0">
          <div className="font-600 truncate">{c.name}</div>
          {c.bio && <div className="text-faint text-sm truncate">{c.bio}</div>}
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <span className="text-[11px] font-mono uppercase border border-rule px-1">{c.status}</span>
            {c.source === 'self_nominated' && (
              <span className="text-[11px] font-mono uppercase border border-violet text-violet px-1">nominee</span>
            )}
            {c.source === 'self_nominated' && !c.photo_path && (
              <span className="text-[11px] font-mono text-ballot">no photo</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        {c.status === 'pending' && (
          <>
            <button className="btn px-2 py-1 text-green-700" title="Approve" onClick={() => onApprove(c.id)}><Check size={14} /></button>
            <button className="btn px-2 py-1 text-ballot" title="Reject" onClick={() => onReject(c.id)}><X size={14} /></button>
          </>
        )}
        <button className="btn px-2 py-1" title="Delete" onClick={() => onDelete(c.id)}><Trash2 size={14} /></button>
      </div>
    </li>
  )
}
