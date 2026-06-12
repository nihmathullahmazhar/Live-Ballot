import { useEffect, useState, useCallback } from 'react'
import { Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'
import {
  adminGetVoters, adminApproveRegistration, adminRejectRegistration, signedUrl,
} from '../../lib/api'
import { Check, X, Eye } from 'lucide-react'

export default function RegistrationsTab({ code, password, settings }) {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [photo, setPhoto] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await adminGetVoters(code, password)) }
    catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }, [code, password, toast])
  useEffect(() => { load() }, [load])

  if (!settings.verified_mode)
    return <div className="panel p-6 text-sm text-ink/70">This election doesn’t use verified mode, so there’s nothing to review here.</div>

  const list = rows.filter((r) => filter === 'all' ? true : r.status === filter)

  async function approve(id) {
    try { const r = await adminApproveRegistration(code, password, id)
      toast(r.voter_code ? `Approved · code ${r.voter_code}` : 'Approved', 'success'); load() }
    catch (e) { toast(e.message, 'error') }
  }
  async function reject(id) {
    const reason = prompt('Reason for rejection (required):')
    if (!reason?.trim()) return
    try { await adminRejectRegistration(code, password, id, reason.trim()); toast('Rejected', 'success'); load() }
    catch (e) { toast(e.message, 'error') }
  }
  async function view(path) {
    const url = await signedUrl('voter-photos', path)
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
        {list.length === 0 && <div className="p-6 text-faint text-sm">Nothing here.</div>}
        {list.map((r) => (
          <div key={r.id} className="p-4 flex flex-wrap gap-3 items-center justify-between">
            <div>
              <div className="font-display font-700">
                {r.name || 'Unnamed'}
                {r.duplicate_selfie && <span className="ml-2 text-xs font-mono text-ballot">⚑ duplicate selfie</span>}
              </div>
              <div className="text-sm text-faint font-mono">
                {r.email}{r.admission_number ? ` · #${r.admission_number}` : ''}{r.grade ? ` · ${r.grade}` : ''}{r.batch ? ` · ${r.batch}` : ''}
              </div>
              {r.status === 'rejected' && r.rejection_reason &&
                <div className="text-xs text-ballot mt-1">Reason: {r.rejection_reason}</div>}
            </div>
            <div className="flex gap-2">
              {r.selfie_path && (
                <button className="btn px-3" title="View selfie" onClick={() => view(r.selfie_path)}><Eye size={15} /></button>
              )}
              {r.status !== 'approved' && (
                <button className="btn px-3 text-verify" onClick={() => approve(r.id)}><Check size={15} /></button>
              )}
              {r.status !== 'rejected' && (
                <button className="btn px-3 text-ballot" onClick={() => reject(r.id)}><X size={15} /></button>
              )}
            </div>
          </div>
        ))}
      </div>

      {photo && (
        <div className="fixed inset-0 z-50 bg-ink/70 grid place-items-center p-4" onClick={() => setPhoto(null)}>
          <div className="panel p-3 bg-paper" onClick={(e) => e.stopPropagation()}>
            <img src={photo} alt="voter selfie" className="max-h-[70vh] max-w-full" />
            <button className="btn mt-3 w-full" onClick={() => setPhoto(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
