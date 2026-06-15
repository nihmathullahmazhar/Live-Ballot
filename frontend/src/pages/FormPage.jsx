import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import InkX from '../components/InkX'
import { Eyebrow, Rule, Spinner } from '../components/ui'
import { useToast } from '../components/Toast'
import { getFormFields, getElectionPublic, submitFormResponse, uploadPhoto } from '../lib/api'
import { Check, Upload, ArrowRight, ArrowLeft } from 'lucide-react'

export default function FormPage() {
  const { code } = useParams()
  const toast = useToast()
  const [form, setForm] = useState(null)
  const [election, setElection] = useState(null)
  const [answers, setAnswers] = useState({})
  const [files, setFiles] = useState({})
  const [step, setStep] = useState(1) // 1=details, 2=ask candidacy, 3=candidacy details
  const [wantsCandidacy, setWantsCandidacy] = useState(false)
  const [positions, setPositions] = useState([])
  const [candidacy, setCandidacy] = useState({ statement: '', experience: '' })
  const [photo, setPhoto] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const [f, e] = await Promise.all([getFormFields(code), getElectionPublic(code)])
        if (!f) setError('No form found for this code.')
        setForm(f); setElection(e)
      } catch (e) { setError(e.message) }
    })()
  }, [code])

  const set = (k, v) => setAnswers((a) => ({ ...a, [k]: v }))
  const allFields = form?.fields || []
  const voterFields = allFields.filter((f) => f.section === 'voter')
  const candFields = allFields.filter((f) => f.section === 'candidate')

  // conditional visibility: hide a field unless show_if_key answer matches show_if_value
  const isVisible = (f) => {
    if (!f.show_if_key) return true
    const parentVal = answers[f.show_if_key]
    if (Array.isArray(parentVal)) return parentVal.includes(f.show_if_value)
    return String(parentVal ?? '') === String(f.show_if_value ?? '')
  }
  const visibleVoter = voterFields.filter(isVisible)
  const visibleCand = candFields.filter(isVisible)

  const maxPositions = Math.max(1, form?.max_nominee_positions || election?.max_nominee_positions || 1)

  function toggleCheckbox(key, opt) {
    setAnswers((a) => {
      const cur = Array.isArray(a[key]) ? a[key] : []
      return { ...a, [key]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] }
    })
  }

  function nextFromDetails() {
    for (const f of visibleVoter) {
      if (f.required && !answers[f.field_key] && !files[f.field_key])
        return toast(`${f.label} is required`, 'error')
    }
    setStep(form?.enable_self_nomination ? 2 : 9) // 9 = submit immediately
    if (!form?.enable_self_nomination) submit(false, [])
  }

  function answerCandidacy(yes) {
    if (!yes) return submit(false, [])
    setWantsCandidacy(true); setStep(3)
  }

  async function submit(wants, posIds) {
    if (wants && posIds.length === 0)
      return toast('Pick at least one position', 'error')
    if (wants && posIds.length > maxPositions)
      return toast(`At most ${maxPositions} position(s)`, 'error')
    if (wants) {
      for (const f of visibleCand) {
        if (f.required && !answers[f.field_key] && !candidacy[f.field_key] && !files[f.field_key])
          return toast(`${f.label} is required`, 'error')
      }
    }
    setBusy(true)
    try {
      const finalAnswers = { ...answers }
      // strip hidden field answers
      const hiddenKeys = voterFields.filter((f) => !isVisible(f)).map((f) => f.field_key)
      hiddenKeys.forEach((k) => delete finalAnswers[k])
      // upload voter file fields
      for (const f of visibleVoter) {
        if (f.field_type === 'document' && files[f.field_key]) {
          const up = await uploadPhoto('voter-photos', code, files[f.field_key])
          finalAnswers[f.field_key] = up.path
        }
      }
      let cand = {}
      if (wants) {
        let photoPath = null
        if (photo) { const up = await uploadPhoto('candidate-photos', code, photo); photoPath = up.path }
        cand = {
          position_ids: posIds,
          statement: candidacy.statement || '',
          experience: candidacy.experience || '',
          photo_path: photoPath,
        }
      }
      await submitFormResponse(code, finalAnswers, wants, cand)
      setDone(true); toast('Submitted', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  if (error) return (
    <Layout code={code} back><div className="panel p-8 text-center">
      <p className="text-ballot font-display font-700 text-xl uppercase">{error}</p>
      <Link to={`/e/${code}`} className="btn mt-5 inline-block">Back to ballot</Link>
    </div></Layout>
  )
  if (!form) return <Layout code={code} back><div className="panel p-8"><Spinner label="Loading form…" /></div></Layout>

  if (done) return (
    <Layout code={code} back>
      <div className="panel p-8 max-w-xl mx-auto text-center">
        <div className="text-verify flex justify-center"><InkX size={56} /></div>
        <h1 className="font-display font-900 text-3xl uppercase mt-3">Submitted</h1>
        <p className="text-ink/75 mt-2">
          Your registration is in. The organisers will review it and issue your
          voting code{wantsCandidacy ? ', and review your candidacy' : ''}.
        </p>
        <Link to={`/e/${code}`} className="btn mt-6 inline-block">Back to ballot</Link>
      </div>
    </Layout>
  )

  return (
    <Layout code={code} back>
      <h1 className="font-display font-900 text-4xl uppercase">Registration</h1>
      {election && <p className="text-faint font-mono text-sm mt-1">{election.title}</p>}
      <div className="mt-3 flex gap-2 text-xs font-mono text-faint">
        <Stepper active={step === 1}>1. Your details</Stepper>
        {form.enable_self_nomination && <Stepper active={step === 2}>2. Run for office?</Stepper>}
        {form.enable_self_nomination && <Stepper active={step === 3}>3. Candidate info</Stepper>}
      </div>

      {voterFields.length === 0 && (
        <div className="panel p-5 mt-6 border-violet text-sm">
          The organiser hasn’t built the form yet. Check back shortly.
        </div>
      )}

      {step === 1 && (
        <div className="panel p-6 mt-6 space-y-4">
          <Eyebrow>Your details</Eyebrow>
          {visibleVoter.map((f) => (
            <Field key={f.id} f={f} value={answers[f.field_key]} fileVal={files[f.field_key]}
              onChange={(v) => set(f.field_key, v)}
              onFile={(file) => setFiles((s) => ({ ...s, [f.field_key]: file }))}
              onCheckbox={(opt) => toggleCheckbox(f.field_key, opt)} />
          ))}
          <div className="pt-2">
            <button className="btn btn-primary text-lg" disabled={busy || visibleVoter.length === 0}
              onClick={nextFromDetails}>
              {form.enable_self_nomination
                ? <>Next <ArrowRight size={16} className="inline ml-1" /></>
                : (busy ? 'Submitting…' : 'Submit registration')}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="panel p-6 mt-6 space-y-4 max-w-xl">
          <Eyebrow>Run for office?</Eyebrow>
          <p className="text-sm text-ink/75">
            Would you like to stand as a candidate in this election as well as vote?
            {maxPositions > 1 && <> You can stand for up to <b>{maxPositions}</b> position{maxPositions === 1 ? '' : 's'}.</>}
          </p>
          <div className="flex gap-3">
            <button className="btn btn-primary" onClick={() => answerCandidacy(true)} disabled={busy}>
              Yes, nominate me
            </button>
            <button className="btn" onClick={() => answerCandidacy(false)} disabled={busy}>
              {busy ? 'Submitting…' : 'No, just voting'}
            </button>
            <button className="btn px-2 text-faint" onClick={() => setStep(1)} disabled={busy}>
              <ArrowLeft size={14} className="inline" /> Back
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="panel p-6 mt-6 space-y-4">
          <Eyebrow>Your candidacy</Eyebrow>

          <div>
            <span className="font-display font-700 uppercase text-sm">
              Positions you’re standing for {maxPositions > 1 && <span className="text-faint font-mono">(choose up to {maxPositions})</span>}
            </span>
            <div className="grid sm:grid-cols-2 gap-2 mt-2">
              {(election?.positions || []).map((p) => {
                const on = positions.includes(p.id)
                return (
                  <button key={p.id} type="button"
                    onClick={() => setPositions((s) => {
                      if (on) return s.filter((x) => x !== p.id)
                      if (s.length >= maxPositions) {
                        toast(`Maximum ${maxPositions} position${maxPositions === 1 ? '' : 's'}`, 'error')
                        return s
                      }
                      return [...s, p.id]
                    })}
                    className={`text-left border-2 p-3 flex items-center gap-2 ${on ? 'border-violet bg-white' : 'border-rule bg-white/40'}`}>
                    <span className={`h-5 w-5 border-2 border-rule grid place-items-center ${on ? 'bg-violet text-white' : ''}`}>
                      {on && <Check size={13} />}
                    </span>
                    <span className="font-display font-700">{p.title}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {visibleCand.map((f) => (
            <Field key={f.id} f={f} value={answers[f.field_key]} fileVal={files[f.field_key]}
              onChange={(v) => set(f.field_key, v)}
              onFile={(file) => setFiles((s) => ({ ...s, [f.field_key]: file }))}
              onCheckbox={(opt) => toggleCheckbox(f.field_key, opt)} />
          ))}

          <div>
            <span className="font-display font-700 uppercase text-sm">Candidate photo (optional)</span>
            <div className="flex items-center gap-3 mt-2">
              <div className="h-20 w-20 border-2 border-rule bg-white overflow-hidden grid place-items-center">
                {photo
                  ? <img src={URL.createObjectURL(photo)} alt="" className="h-full w-full object-cover" />
                  : <Upload size={20} className="text-faint" />}
              </div>
              <label className="btn cursor-pointer">
                {photo ? 'Change photo' : 'Upload photo'}
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && setPhoto(e.target.files[0])} />
              </label>
              {photo && <span className="text-xs text-verify font-mono">✓ ready to upload</span>}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button className="btn" onClick={() => setStep(2)} disabled={busy}>
              <ArrowLeft size={14} className="inline" /> Back
            </button>
            <button className="btn btn-primary text-lg"
              disabled={busy || positions.length === 0}
              onClick={() => submit(true, positions)}>
              {busy ? 'Submitting…' : 'Submit registration'}
            </button>
            {busy && <Spinner label="Uploading…" />}
          </div>
        </div>
      )}

      <div className="h-8" />
    </Layout>
  )
}

function Stepper({ active, children }) {
  return (
    <span className={`px-2 py-1 border ${active ? 'border-violet text-violet bg-white' : 'border-rule/40'}`}>
      {children}
    </span>
  )
}

function Field({ f, value, fileVal, onChange, onFile, onCheckbox }) {
  const label = (
    <span className="font-display font-700 uppercase text-sm">
      {f.label}{f.required && <span className="text-ballot"> *</span>}
    </span>
  )
  const opts = Array.isArray(f.options) ? f.options : []
  if (f.field_type === 'textarea')
    return (<label className="block"><span>{label}</span><textarea className="input min-h-[110px]" value={value || ''} onChange={(e) => onChange(e.target.value)} /></label>)
  if (f.field_type === 'dropdown')
    return (<label className="block"><span>{label}</span>
      <select className="input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">— select —</option>
        {opts.map((o, i) => <option key={i} value={o}>{o}</option>)}
      </select></label>)
  if (f.field_type === 'radio')
    return (<div><span>{label}</span><div className="mt-2 grid sm:grid-cols-2 gap-2">
      {opts.map((o, i) => (
        <label key={i} className={`border-2 p-2 flex items-center gap-2 cursor-pointer ${value === o ? 'border-violet bg-white' : 'border-rule bg-white/40'}`}>
          <input type="radio" checked={value === o} onChange={() => onChange(o)} />
          <span>{o}</span>
        </label>
      ))}
    </div></div>)
  if (f.field_type === 'checkbox')
    return (<div><span>{label}</span><div className="mt-2 grid sm:grid-cols-2 gap-2">
      {opts.map((o, i) => {
        const arr = Array.isArray(value) ? value : []
        const on = arr.includes(o)
        return (
          <label key={i} className={`border-2 p-2 flex items-center gap-2 cursor-pointer ${on ? 'border-violet bg-white' : 'border-rule bg-white/40'}`}>
            <input type="checkbox" checked={on} onChange={() => onCheckbox(o)} />
            <span>{o}</span>
          </label>
        )
      })}
    </div></div>)
  if (f.field_type === 'document')
    return (<div><span>{label}</span>
      <div className="flex items-center gap-3 mt-2">
        <div className="h-16 w-16 border-2 border-rule bg-white overflow-hidden grid place-items-center">
          {fileVal && fileVal.type?.startsWith('image/')
            ? <img src={URL.createObjectURL(fileVal)} alt="" className="h-full w-full object-cover" />
            : <Upload size={18} className="text-faint" />}
        </div>
        <label className="btn cursor-pointer">
          {fileVal ? 'Change file' : 'Upload file'}
          <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        {fileVal && <span className="text-xs text-verify font-mono truncate">✓ {fileVal.name}</span>}
      </div></div>)
  // text/email/phone/number/nic
  const type = f.field_type === 'email' ? 'email'
             : f.field_type === 'number' ? 'number'
             : f.field_type === 'phone' ? 'tel' : 'text'
  return (<label className="block"><span>{label}</span><input className="input" type={type} value={value || ''} onChange={(e) => onChange(e.target.value)} /></label>)
}