import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import InkX from '../components/InkX'
import { Eyebrow } from '../components/ui'
import { useToast } from '../components/Toast'
import { getElectionPublic, submitIntake } from '../lib/api'

export default function RequestAccessPage() {
  const { code } = useParams()
  const toast = useToast()
  const [election, setElection] = useState(null)
  const [f, setF] = useState({ name: '', email: '', grade: '', batch: '', admission_number: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  useEffect(() => { getElectionPublic(code).then(setElection).catch(() => {}) }, [code])

  async function submit() {
    if (!f.name.trim() || !f.email.trim()) return toast('Name and email are required', 'error')
    setBusy(true)
    try {
      await submitIntake(code, {
        name: f.name.trim(), email: f.email.trim(),
        grade: f.grade.trim(), batch: f.batch.trim(),
        admission_number: f.admission_number.trim(),
      })
      setDone(true); toast('Request sent', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  if (done) return (
    <Layout code={code}>
      <div className="panel p-8 max-w-xl mx-auto text-center">
        <div className="text-violet flex justify-center"><InkX size={56} /></div>
        <h1 className="font-display font-900 text-3xl uppercase mt-3">Request received</h1>
        <p className="text-ink/75 mt-2">
          The organisers will review it. If approved, you’ll be issued a voting
          code to take part.
        </p>
        <Link to={`/e/${code}`} className="btn mt-6 inline-block">Back to ballot</Link>
      </div>
    </Layout>
  )

  return (
    <Layout code={code}>
      <h1 className="font-display font-900 text-4xl uppercase">Request access</h1>
      {election && <p className="text-faint font-mono text-sm mt-1">{election.title}</p>}
      <div className="panel p-6 mt-6 space-y-4">
        <Eyebrow>Your details</Eyebrow>
        <div className="grid sm:grid-cols-2 gap-4">
          <F label="Full name"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></F>
          <F label="Email"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></F>
          <F label="Grade / class"><input className="input" value={f.grade} onChange={(e) => set('grade', e.target.value)} /></F>
          <F label="Batch / year"><input className="input" value={f.batch} onChange={(e) => set('batch', e.target.value)} /></F>
          <F label="Admission number"><input className="input" value={f.admission_number} onChange={(e) => set('admission_number', e.target.value)} /></F>
        </div>
        <button className="btn btn-primary text-lg" disabled={busy} onClick={submit}>
          {busy ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </Layout>
  )
}

function F({ label, children }) {
  return (
    <label className="block">
      <span className="font-display font-700 uppercase text-sm">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
