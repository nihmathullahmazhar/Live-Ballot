import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import InkX from '../components/InkX'
import { Eyebrow, Spinner } from '../components/ui'
import { useToast } from '../components/Toast'
import { getElectionPublic, selfNominate, uploadPhoto } from '../lib/api'
import { Upload } from 'lucide-react'

export default function NominatePage() {
  const { code } = useParams()
  const toast = useToast()
  const [election, setElection] = useState(null)
  const [f, setF] = useState({ position_id: '', name: '', bio: '', manifesto: '' })
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  useEffect(() => {
    getElectionPublic(code).then((e) => {
      setElection(e)
      if (e?.positions?.length) set('position_id', e.positions[0].id)
    }).catch(() => {})
  }, [code])

  async function submit() {
    if (!f.position_id) return toast('Pick a position', 'error')
    if (!f.name.trim()) return toast('Enter your name', 'error')
    setBusy(true)
    try {
      let photo = { path: null }
      if (file) photo = await uploadPhoto('candidate-photos', code, file)
      await selfNominate({
        p_code: code, p_position_id: f.position_id, p_name: f.name.trim(),
        p_bio: f.bio.trim() || null, p_manifesto: f.manifesto.trim() || null,
        p_photo_path: photo.path, p_registration_id: null,
      })
      setDone(true)
      toast('Nomination submitted', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  if (done) return (
    <Layout code={code}>
      <div className="panel p-8 max-w-xl mx-auto text-center">
        <div className="text-violet flex justify-center"><InkX size={56} /></div>
        <h1 className="font-display font-900 text-3xl uppercase mt-3">Nomination in</h1>
        <p className="text-ink/75 mt-2">The committee will review it. If approved you’ll appear on the ballot.</p>
        <Link to={`/e/${code}`} className="btn mt-6 inline-block">Back to ballot</Link>
      </div>
    </Layout>
  )

  return (
    <Layout code={code}>
      <h1 className="font-display font-900 text-4xl uppercase">Self-nominate</h1>
      {election && <p className="text-faint font-mono text-sm mt-1">{election.title}</p>}

      <div className="panel p-6 mt-6 space-y-4">
        <label className="block">
          <span className="font-display font-700 uppercase text-sm">Position</span>
          <select className="input mt-1" value={f.position_id} onChange={(e) => set('position_id', e.target.value)}>
            {(election?.positions || []).map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-display font-700 uppercase text-sm">Your name</span>
          <input className="input mt-1" value={f.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label className="block">
          <span className="font-display font-700 uppercase text-sm">Short bio</span>
          <input className="input mt-1" value={f.bio} onChange={(e) => set('bio', e.target.value)} />
        </label>
        <label className="block">
          <span className="font-display font-700 uppercase text-sm">Manifesto / contributions</span>
          <textarea className="input mt-1" rows={4} value={f.manifesto} onChange={(e) => set('manifesto', e.target.value)} />
        </label>

        <Eyebrow>Photo (optional)</Eyebrow>
        <div className="flex items-center gap-4">
          <div className="h-24 w-24 border-2 border-rule bg-white overflow-hidden grid place-items-center">
            {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <Upload size={24} className="text-faint" />}
          </div>
          <label className="btn cursor-pointer">
            <Upload size={16} className="inline -mt-1 mr-1" /> Upload photo
            <input type="file" accept="image/*" className="hidden"
              onChange={(e) => { const fl = e.target.files?.[0]; if (fl) { setFile(fl); setPreview(URL.createObjectURL(fl)) } }} />
          </label>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button className="btn btn-primary text-lg" disabled={busy} onClick={submit}>
          {busy ? 'Submitting…' : 'Submit nomination'}
        </button>
        {busy && <Spinner />}
      </div>
      <div className="h-8" />
    </Layout>
  )
}
