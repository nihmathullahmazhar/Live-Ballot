import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import InkX from '../components/InkX'
import { Eyebrow, Rule, Spinner } from '../components/ui'
import { useToast } from '../components/Toast'
import { getFormFields, getElectionPublic, submitFormResponse, uploadPhoto } from '../lib/api'
import { Check, Upload } from 'lucide-react'

export default function FormPage() {
  const { code } = useParams()
  const toast = useToast()
  const [form, setForm] = useState(null)
  const [election, setElection] = useState(null)
  const [answers, setAnswers] = useState({})
  const [files, setFiles] = useState({})            // field_key -> File
  const [wantsCandidacy, setWantsCandidacy] = useState(false)
  const [positions, setPositions] = useState([])    // selected position ids
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
  const voterFields = (form?.fields || []).filter((f) => f.section === 'voter')
  const candFields = (form?.fields || []).filter((f) => f.section === 'candidate')

  function toggleCheckbox(key, opt) {
    setAnswers((a) => {
      const cur = Array.isArray(a[key]) ? a[key] : []
      return { ...a, [key]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] }
    })
  }

  async function submit() {
    // required validation
    for (const f of voterFields) {
      if (f.required && !answers[f.field_key] && !files[f.field_key])
        return toast(`${f.label} is required`, 'error')
    }
    if (wantsCandidacy && positions.length === 0)
      return toast('Pick at least one position to stand for', 'error')

    setBusy(true)
    try {
      const finalAnswers = { ...answers }
      // upload any file fields
      for (const f of voterFields) {
        if (f.field_type === 'document' && files[f.field_key]) {
          const up = await uploadPhoto('voter-photos', code, files[f.field_key])
          finalAnswers[f.field_key] = up.path
        }
      }
      let cand = {}
      if (wantsCandidacy) {
        let photoPath = null
        if (photo) { const up = await uploadPhoto('candidate-photos', code, photo); photoPath = up.path }
        cand = {
          position_ids: positions,
          statement: candidacy.statement || '',
          experience: candidacy.experience || '',
          photo_path: photoPath,
        }
      }
      await submitFormResponse(code, finalAnswers, wantsCandidacy, cand)
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

      {voterFields.length === 0 && (
        <div className="panel p-5 mt-6 border-violet text-sm">
          The organiser hasn’t built the form yet. Check back shortly.
        </div>
      )}

      <div className="panel p-6 mt-6 space-y-4">
        <Eyebrow>Your details</Eyebrow>
        {voterFields.map((f) => (
          <Field key={f.id} f={f} value={answers[f.field_key]}
            onChange={(v) => set(f.field_key, v)}
            onFile={(file) => setFiles((s) => ({ ...s, [f.field_key]: file }))}
            onCheckbox={(opt) => toggleCheckbox(f.field_key, opt)} />
        ))}
      </div>

      {/* Self-nomination */}
      {form.enable_self_nomination && (
        <div className="panel p-6 mt-6 space-y-4">
          <Eyebrow>Stand as a candidate?</Eyebrow>
          <div className="flex gap-3">
            <button type="button" onClick={() => setWantsCandidacy(false)}
              className={`btn ${!wantsCandidacy ? 'btn-primary' : ''}`}>No, just voting</button>
            <button type="button" onClick={() => setWantsCandidacy(true)}
              className={`btn ${wantsCandidacy ? 'btn-primary' : ''}`}>Yes, nominate me</button>
          </div>

          {wantsCandidacy && (
            <div className="space-y-4 pt-2">
              <div>
                <span className="font-display font-700 uppercase text-sm">Positions you’re standing for</span>
                <div className="grid sm:grid-cols-2 gap-2 mt-2">
                  {(election?.positions || []).map((p) => {
                    const on = positions.includes(p.id)
                    return (
                      <button key={p.id} type="button"
                        onClick={() => setPositions((s) => on ? s.filter((x) => x !== p.id) : [...s, p.id])}
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

              {candFields.map((f) => (
                <Field key={f.id} f={f}
                  value={f.field_key === 'statement' ? candidacy.statement
                       : f.field_key === 'experience' ? candidacy.experience : answers[f.field_key]}
                  onChange={(v) => {
                    if (f.field_key === 'statement') setCandidacy((c) => ({ ...c, statement: v }))
                    else if (f.field_key === 'experience') setCandidacy((c) => ({ ...c, experience: v }))
                    else set(f.field_key, v)
                  }}
                  onFile={(file) => setFiles((s) => ({ ...s, [f.field_key]: file }))}
                  onCheckbox={(opt) => toggleCheckbox(f.field_key, opt)} />
              ))}

              <div>
                <span className="font-display font-700 uppercase text-sm">Candidate photo (optional)</span>
                <div className="flex items-center gap-3 mt-2">
                  <div className="h-20 w-20 border-2 border-rule bg-white overflow-hidden grid place-items-center">
                    {photo ? <img src={URL.createObjectURL(photo)} alt="" className="h-full w-full object-cover" /> : <Upload size={20} className="text-faint" />}
                  </div>
                  <label className="btn cursor-pointer">Upload
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => e.target.files?.[0] && setPhoto(e.target.files[0])} />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4">
        <button className="btn btn-primary text-lg" disabled={busy || voterFields.length === 0} onClick={submit}>
          {busy ? 'Submitting…' : 'Submit registration'}
        </button>
        {busy && <Spinner label="Uploading…" />}
      </div>
      <div className="h-8" />
    </Layout>
  )
}

function Field({ f, value, onChange, onFile, onCheckbox }) {
  const label = (
    <span className="font-display font-700 uppercase text-sm">
      {f.label}{f.required && <span className="text-ballot"> *</span>}
    </span>
  )
  const opts = Array.isArray(f.options) ? f.options : []
  return (
    <label className="block">
      {label}
      <div className="mt-1">
        {f.field_type === 'textarea' ? (
          <textarea className="input" rows={3} value={value || ''} onChange={(e) => onChange(e.target.value)} />
        ) : f.field_type === 'dropdown' ? (
          <select className="input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
            <option value="">— select —</option>
            {opts.map((o, i) => <option key={i} value={o}>{o}</option>)}
          </select>
        ) : f.field_type === 'radio' ? (
          <div className="flex flex-wrap gap-2">
            {opts.map((o, i) => (
              <button key={i} type="button" onClick={() => onChange(o)}
                className={`btn text-sm ${value === o ? 'btn-primary' : ''}`}>{o}</button>
            ))}
          </div>
        ) : f.field_type === 'checkbox' ? (
          <div className="flex flex-wrap gap-2">
            {opts.map((o, i) => {
              const on = Array.isArray(value) && value.includes(o)
              return <button key={i} type="button" onClick={() => onCheckbox(o)}
                className={`btn text-sm ${on ? 'btn-primary' : ''}`}>{o}</button>
            })}
          </div>
        ) : f.field_type === 'document' ? (
          <label className="btn cursor-pointer inline-block">
            <Upload size={14} className="inline -mt-1 mr-1" /> Upload file
            <input type="file" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        ) : (
          <input
            className="input"
            type={f.field_type === 'email' ? 'email' : f.field_type === 'number' ? 'number' : f.field_type === 'phone' ? 'tel' : 'text'}
            value={value || ''} onChange={(e) => onChange(e.target.value)} />
        )}
      </div>
    </label>
  )
}