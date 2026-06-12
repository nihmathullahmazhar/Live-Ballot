import { useEffect, useState, useCallback } from 'react'
import { Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'
import {
  adminGetCandidates, adminApproveCandidate, adminRejectCandidate, signedUrl,
} from '../../lib/api'
import { Check, X, Eye } from 'lucide-react'

export default function CandidatesTab({ code, password }) {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [photo, setPhoto] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await adminGetCandidates(code, password)) }
    catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }, [code, password, toast])
  useEffect(() => { load() }, [load])

  const list = rows.filter((r) => filter === 'all' ? true : r.status === filter)

  async function approve(id) {
    try { await adminApproveCandidate(code, password, id); toast('Candidate approved', 'success'); load() }
    catch (e) { toast(e.message, 'error') }
  }
  async function reject(id) {
    const reason = prompt('Reason for rejection (required):')
    if (!reason?.trim()) return
    try { await adminRejectCandidate(code, password, id, reason.trim()); toast('Candidate rejected', 'success'); load() }
    catch (e) { toast(e.message, 'error') }
  }
  async function view(path) {
    const url = await signedUrl('candidate-photos', path)
    if (url) setPhoto(url); else toast('Could not load photo', 'error')
  }

  if (loading && rows.length === 0) return <div className="panel p-6"><Spinner /></div>

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {['pending', 'approved', 'rejected', 'all'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`btn text-sm ${filter === s ? 'btn-primary' : ''}`}>{s}</button>
        ))}
      </div>

      <div className="panel divide-y-2 divide-rule/30">
        {list.length === 0 && <div className="p-6 text-faint text-sm">No nominations here.</div>}
        {list.map((c) => (
          <div key={c.id} className="p-4 flex flex-wrap gap-3 items-start justify-between">
            <div className="max-w-xl">
              <div className="font-display font-700">
                {c.name}
                <span className="ml-2 text-xs font-mono text-faint">→ {c.position_title}</span>
                {c.source === 'self_nominated' && <span className="ml-2 text-xs font-mono text-violet">self-nominated</span>}
              </div>
              {c.bio && <div className="text-sm text-ink/70 mt-1">{c.bio}</div>}
              {c.manifesto && <div className="text-sm text-ink/60 mt-1 italic">{c.manifesto}</div>}
              {c.status === 'rejected' && c.rejection_reason &&
                <div className="text-xs text-ballot mt-1">Reason: {c.rejection_reason}</div>}
            </div>
            <div className="flex gap-2">
              {c.photo_path && <button className="btn px-3" onClick={() => view(c.photo_path)}><Eye size={15} /></button>}
              {c.status !== 'approved' && <button className="btn px-3 text-verify" onClick={() => approve(c.id)}><Check size={15} /></button>}
              {c.status !== 'rejected' && <button className="btn px-3 text-ballot" onClick={() => reject(c.id)}><X size={15} /></button>}
            </div>
          </div>
        ))}
      </div>

      {photo && (
        <div className="fixed inset-0 z-50 bg-ink/70 grid place-items-center p-4" onClick={() => setPhoto(null)}>
          <div className="panel p-3 bg-paper" onClick={(e) => e.stopPropagation()}>
            <img src={photo} alt="candidate" className="max-h-[70vh] max-w-full" />
            <button className="btn mt-3 w-full" onClick={() => setPhoto(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
