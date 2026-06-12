import { useEffect, useState, useCallback } from 'react'
import { Spinner, Eyebrow } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { adminGetIntake, adminConvertIntake, adminRejectIntake } from '../../lib/api'
import { Check, X } from 'lucide-react'

export default function IntakeTab({ code, password }) {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await adminGetIntake(code, password)) }
    catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }, [code, password, toast])
  useEffect(() => { load() }, [load])

  const list = rows.filter((r) => filter === 'all' ? true : r.status === filter)

  async function convert(id) {
    try { const r = await adminConvertIntake(code, password, id)
      toast(r.voter_code ? `Approved · code ${r.voter_code}` : 'Approved as voter', 'success'); load() }
    catch (e) { toast(e.message, 'error') }
  }
  async function reject(id) {
    try { await adminRejectIntake(code, password, id); toast('Request rejected', 'success'); load() }
    catch (e) { toast(e.message, 'error') }
  }

  if (loading && rows.length === 0) return <div className="panel p-6"><Spinner /></div>

  return (
    <div className="space-y-4">
      <Eyebrow>Public “request access” submissions. Approve to turn into a code-holding voter.</Eyebrow>
      <div className="flex gap-2">
        {['pending', 'converted', 'rejected', 'all'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`btn text-sm ${filter === s ? 'btn-primary' : ''}`}>{s}</button>
        ))}
      </div>

      <div className="panel divide-y-2 divide-rule/30">
        {list.length === 0 && <div className="p-6 text-faint text-sm">No requests here.</div>}
        {list.map((r) => (
          <div key={r.id} className="p-4 flex flex-wrap gap-3 items-center justify-between">
            <div>
              <div className="font-display font-700">{r.name || 'Unnamed'}
                <span className="ml-2 text-xs font-mono text-faint">· {r.status}</span>
              </div>
              <div className="text-sm text-faint font-mono">
                {r.email}{r.admission_number ? ` · #${r.admission_number}` : ''}{r.grade ? ` · ${r.grade}` : ''}
              </div>
            </div>
            {r.status === 'pending' && (
              <div className="flex gap-2">
                <button className="btn px-3 text-verify" title="Approve → voter" onClick={() => convert(r.id)}><Check size={15} /></button>
                <button className="btn px-3 text-ballot" title="Reject" onClick={() => reject(r.id)}><X size={15} /></button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
