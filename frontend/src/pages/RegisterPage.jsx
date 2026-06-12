import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import InkX from '../components/InkX'
import { Eyebrow, Rule, Spinner } from '../components/ui'
import { useToast } from '../components/Toast'
import { getElectionPublic, registerVoter, uploadPhoto } from '../lib/api'
import { Camera, Upload } from 'lucide-react'

export default function RegisterPage() {
  const { code } = useParams()
  const toast = useToast()
  const [election, setElection] = useState(null)
  const [f, setF] = useState({ name: '', email: '', grade: '', batch: '', admission_number: '' })
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const camRef = useRef(null)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  useEffect(() => { getElectionPublic(code).then(setElection).catch(() => {}) }, [code])

  function onFile(e) {
    const fl = e.target.files?.[0]
    if (!fl) return
    setFile(fl); setPreview(URL.createObjectURL(fl))
  }

  async function submit() {
    if (!f.name.trim()) return toast('Enter your name', 'error')
    if (!f.email.trim()) return toast('Email is required', 'error')
    setBusy(true)
    try {
      let selfie = { path: null, hash: null }
      if (file) selfie = await uploadPhoto('voter-photos', code, file)
      const res = await registerVoter({
        p_code: code, p_name: f.name.trim(), p_email: f.email.trim(),
        p_grade: f.grade.trim() || null, p_batch: f.batch.trim() || null,
        p_admission_number: f.admission_number.trim() || null,
        p_selfie_path: selfie.path, p_selfie_hash: selfie.hash,
      })
      setResult(res)
      toast('Registration submitted', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  if (result) {
    const issued = result.code_issued && result.voter_code
    return (
      <Layout code={code}>
        <div className="panel p-8 max-w-xl mx-auto text-center">
          <div className="text-verify flex justify-center"><InkX size={56} /></div>
          <h1 className="font-display font-900 text-3xl uppercase mt-3">You’re registered</h1>
          <p className="text-ink/75 mt-2">
            {result.status === 'pending'
              ? 'The committee will review your registration.'
              : 'Your registration is approved.'}
          </p>
          {result.duplicate_selfie_flag && (
            <p className="text-ballot text-sm mt-2 font-mono">
              Note: a matching photo was already submitted — the committee may check this.
            </p>
          )}
          {issued ? (
            <div className="mt-5 border-2 border-rule bg-white px-4 py-3 inline-block">
              <div className="eyebrow">Your voting code</div>
              <div className="font-mono text-2xl tracking-widest">{result.voter_code}</div>
            </div>
          ) : (
            <p className="text-faint text-sm mt-4 font-mono">
              Your code will be issued once you’re approved.
            </p>
          )}
          <div className="mt-6 flex justify-center gap-3">
            {issued && <Link to={`/e/${code}`} className="btn btn-primary">Go vote</Link>}
            <Link to={`/e/${code}`} className="btn">Back to ballot</Link>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout code={code}>
      <h1 className="font-display font-900 text-4xl uppercase">Register to vote</h1>
      {election && <p className="text-faint font-mono text-sm mt-1">{election.title}</p>}

      <div className="panel p-6 mt-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Full name"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Email" hint="Required">
            <input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Grade / class (optional)"><input className="input" value={f.grade} onChange={(e) => set('grade', e.target.value)} /></Field>
          <Field label="Batch / year (optional)"><input className="input" value={f.batch} onChange={(e) => set('batch', e.target.value)} /></Field>
          <Field label="Admission number (optional)"><input className="input" value={f.admission_number} onChange={(e) => set('admission_number', e.target.value)} /></Field>
        </div>

        <Rule />
        <Eyebrow>Selfie for verification</Eyebrow>
        <p className="text-sm text-ink/70">
          Take or upload a clear photo of yourself. It’s stored privately and only
          the committee can view it.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="h-28 w-28 border-2 border-rule bg-white grid place-items-center overflow-hidden">
            {preview
              ? <img src={preview} alt="selfie preview" className="h-full w-full object-cover" />
              : <Camera size={28} className="text-faint" />}
          </div>
          <div className="flex flex-col gap-2">
            <label className="btn cursor-pointer">
              <Camera size={16} className="inline -mt-1 mr-1" /> Take selfie
              <input ref={camRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onFile} />
            </label>
            <label className="btn cursor-pointer">
              <Upload size={16} className="inline -mt-1 mr-1" /> Upload photo
              <input type="file" accept="image/*" className="hidden" onChange={onFile} />
            </label>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button className="btn btn-primary text-lg" disabled={busy} onClick={submit}>
          {busy ? 'Submitting…' : 'Submit registration'}
        </button>
        {busy && <Spinner label="Uploading…" />}
      </div>
      <div className="h-8" />
    </Layout>
  )
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="font-display font-700 uppercase text-sm">{label}</span>
      {hint && <span className="text-xs text-faint ml-2">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  )
}
