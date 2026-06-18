import { useEffect, useState, useRef } from 'react'
import { useToast } from '../../components/Toast'
import { Rule, Spinner } from '../../components/ui'
import {
  adminGetBallot, adminAddPosition, adminDeletePosition,
  adminAddCandidate, adminDeleteCandidate,
  adminApproveCandidate, adminRejectCandidate,
  adminUpdatePosition, adminReorderPositions, adminReorderCandidates,
  adminSetCandidatePhoto, uploadPhoto,
  subscribeElection, imageUrl,
} from '../../lib/api'
import { Plus, Trash2, Check, X, Download, RefreshCw, ImageIcon,
  ArrowUp, ArrowDown, ArrowUpDown, Pencil, ListOrdered, Camera } from 'lucide-react'
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
  const [reorderPos, setReorderPos] = useState(null) // position id currently in candidate-reorder mode

  async function moveCandidate(position, idx, delta) {
    const cands = [...(position.candidates || [])]
    const tgt = idx + delta
    if (tgt < 0 || tgt >= cands.length) return
    ;[cands[idx], cands[tgt]] = [cands[tgt], cands[idx]]
    // optimistic update
    setPositions((prev) => prev.map((p) => p.id === position.id ? { ...p, candidates: cands } : p))
    try {
      await adminReorderCandidates(code, password, position.id, cands.map((c) => c.id))
    } catch (e) { toast(e.message, 'error'); load() }
  }

  async function setPhoto(candidateId, file) {
    if (!file) return
    try {
      const up = await uploadPhoto('candidate-photos', code, file)
      await adminSetCandidatePhoto(code, password, candidateId, up.path)
      toast('Photo updated', 'success'); load()
    } catch (e) { toast(e.message, 'error') }
  }

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
                  {(p.candidates || []).length > 1 && (
                    <button className={`icon-btn ${reorderPos === p.id ? 'icon-btn-violet' : ''}`}
                      title={reorderPos === p.id ? 'Done reordering' : 'Reorder candidates'}
                      onClick={() => setReorderPos(reorderPos === p.id ? null : p.id)}>
                      {reorderPos === p.id ? <Check size={15} /> : <ArrowUpDown size={15} />}
                    </button>
                  )}
                  <button className="icon-btn" title="Move position up" disabled={idx === 0}
                    onClick={() => moveBy(idx, -1)}><ArrowUp size={15} /></button>
                  <button className="icon-btn" title="Move position down" disabled={idx === positions.length - 1}
                    onClick={() => moveBy(idx, +1)}><ArrowDown size={15} /></button>
                  <button className="icon-btn" title="Edit"
                    onClick={() => { setEditingPos(p.id); setEditTitle(p.title); setEditSeats(p.max_winners) }}>
                    <Pencil size={15} />
                  </button>
                  <button className="icon-btn icon-btn-danger" title="Delete position" onClick={() => delPosition(p.id)}>
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
                {p.candidates.map((c, ci) => (
                  <CandidateRow key={c.id} c={c} onApprove={approve} onReject={reject} onDelete={delCandidate}
                    onSetPhoto={setPhoto}
                    reordering={reorderPos === p.id}
                    canUp={ci > 0} canDown={ci < p.candidates.length - 1}
                    onUp={() => moveCandidate(p, ci, -1)} onDown={() => moveCandidate(p, ci, +1)} />
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

function CandidateRow({ c, onApprove, onReject, onDelete, onSetPhoto, reordering, canUp, canDown, onUp, onDown }) {
  const [url, setUrl] = useState(null)
  const fileRef = useRef(null)
  useEffect(() => { if (c.photo_path) imageUrl('candidate-photos', c.photo_path).then(setUrl) }, [c.photo_path])
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 border" style={{ borderColor: 'var(--line)' }}>
      <div className="flex items-center gap-3 min-w-0">
        {reordering && (
          <div className="flex flex-col gap-0.5 shrink-0">
            <button className="icon-btn !h-6 !w-6" disabled={!canUp} title="Move up" onClick={onUp}><ArrowUp size={13} /></button>
            <button className="icon-btn !h-6 !w-6" disabled={!canDown} title="Move down" onClick={onDown}><ArrowDown size={13} /></button>
          </div>
        )}
        {/* photo with hover-to-change */}
        <div className="relative h-12 w-12 shrink-0 group">
          {c.photo_path && url ? (
            <div className="h-12 w-12 rounded-md overflow-hidden border" style={{ borderColor: 'var(--line-2)' }}>
              <img src={url} alt="" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="h-12 w-12 rounded-md border border-dashed grid place-items-center text-faint" style={{ borderColor: 'var(--line-2)' }}>
              <ImageIcon size={16} />
            </div>
          )}
          {onSetPhoto && !reordering && (
            <button onClick={() => fileRef.current?.click()} title="Change photo"
              className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-violet text-white grid place-items-center shadow-paper">
              <Camera size={12} />
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { onSetPhoto?.(c.id, e.target.files?.[0]); e.target.value = '' }} />
        </div>
        <div className="min-w-0">
          <div className="font-semibold truncate">{c.name}</div>
          {c.bio && <div className="text-faint text-sm truncate">{c.bio}</div>}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`pill ${c.status === 'approved' ? 'pill-approved' : c.status === 'rejected' ? 'pill-rejected' : 'pill-pending'}`}>{c.status}</span>
            {c.source === 'self_nominated' && <span className="pill pill-candidate">nominee</span>}
            {c.source === 'self_nominated' && !c.photo_path && <span className="pill pill-rejected">no photo</span>}
          </div>
        </div>
      </div>
      {!reordering && (
        <div className="action-group shrink-0">
          {c.status === 'pending' && (
            <>
              <button className="icon-btn icon-btn-green" title="Approve" onClick={() => onApprove(c.id)}><Check size={15} /></button>
              <button className="icon-btn icon-btn-danger" title="Reject" onClick={() => onReject(c.id)}><X size={15} /></button>
            </>
          )}
          <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => onDelete(c.id)}><Trash2 size={15} /></button>
        </div>
      )}
    </li>
  )
}