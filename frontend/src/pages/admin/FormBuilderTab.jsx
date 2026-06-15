import { useEffect, useState, useCallback } from 'react'
import { Eyebrow, Rule, Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { getFormFields, adminSetFormFields, adminSetSelfNomination } from '../../lib/api'
import { Plus, Trash2, ArrowUp, ArrowDown, Copy, Check } from 'lucide-react'

const TYPES = [
  ['text', 'Short text'], ['textarea', 'Paragraph'], ['email', 'Email'],
  ['phone', 'Phone'], ['number', 'Number'], ['nic', 'NIC / ID'],
  ['dropdown', 'Dropdown'], ['radio', 'Single choice'], ['checkbox', 'Multi choice'],
  ['document', 'File upload'],
]

const starter = () => ([
  { section: 'voter', field_key: 'name', label: 'Full Name', field_type: 'text', required: true, options: [] },
  { section: 'voter', field_key: 'email', label: 'Email', field_type: 'email', required: true, options: [] },
  { section: 'voter', field_key: 'admission_number', label: 'Admission / Student ID', field_type: 'text', required: false, options: [] },
])

export default function FormBuilderTab({ code, password, settings, onSettingsChange }) {
  const toast = useToast()
  const [fields, setFields] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState('')
  const [selfNom, setSelfNom] = useState(!!settings.enable_self_nomination)

  async function toggleSelfNom() {
    const next = !selfNom
    setSelfNom(next)
    try {
      await adminSetSelfNomination(code, password, next)
      onSettingsChange?.({ enable_self_nomination: next })
      toast(next ? 'Nominations added to this form' : 'Nominations turned off', 'success')
    } catch (e) { setSelfNom(!next); toast(e.message, 'error') }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const f = await getFormFields(code)
      setFields((f?.fields || []).map(({ id, ...rest }) => ({
        ...rest,
        options: Array.isArray(rest.options) ? rest.options.join(', ') : (rest.options || ''),
      })))
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }, [code, toast])
  useEffect(() => { load() }, [load])
  useEffect(() => { setLink(`${window.location.origin}/e/${code}/form`) }, [code])

  const update = (i, k, v) => setFields((fs) => fs.map((f, idx) => idx === i ? { ...f, [k]: v } : f))
  const move = (i, d) => setFields((fs) => {
    const j = i + d; if (j < 0 || j >= fs.length) return fs
    const c = [...fs]; [c[i], c[j]] = [c[j], c[i]]; return c
  })
  const add = (section) => setFields((fs) => [...fs, {
    section, field_key: `field_${fs.length + 1}`, label: '', field_type: 'text', required: false, options: '',
  }])

  async function save() {
    // basic validation: keys present + unique within section
    for (const f of fields) {
      if (!f.label.trim()) return toast('Every field needs a label', 'error')
      if (!f.field_key.trim()) return toast('Every field needs a key', 'error')
    }
    setBusy(true)
    try {
      const payload = fields.map((f, i) => ({
        ...f,
        field_key: f.field_key.trim().toLowerCase().replace(/\s+/g, '_'),
        sort_order: i,
        options: Array.isArray(f.options) ? f.options
               : String(f.options || '').split(',').map((x) => x.trim()).filter(Boolean),
      }))
      const r = await adminSetFormFields(code, password, payload)
      toast(`Saved ${r.count} fields`, 'success')
      load()
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  if (loading) return <div className="panel p-6"><Spinner /></div>

  const voter = fields.map((f, i) => ({ f, i })).filter((x) => x.f.section === 'voter')
  const cand = fields.map((f, i) => ({ f, i })).filter((x) => x.f.section === 'candidate')

  return (
    <div className="space-y-5">
      <div className="panel p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <Eyebrow>Shareable registration link</Eyebrow>
          <code className="font-mono text-violet break-all">{link}</code>
        </div>
        <button className="btn text-sm" onClick={() => { navigator.clipboard?.writeText(link); toast('Link copied', 'success') }}>
          <Copy size={14} className="inline -mt-1 mr-1" /> Copy link
        </button>
      </div>

      {/* One form, both jobs: registration + (optional) candidate nominations */}
      <div className="panel p-4 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <div className="font-display font-700 uppercase text-sm">Collect candidate nominations in this form</div>
          <p className="text-xs text-faint mt-1">
            On = the same form asks "do you want to stand as a candidate?", shows your positions,
            and collects their statement — one link does both registration and nominations.
          </p>
        </div>
        <button type="button" onClick={toggleSelfNom}
          className={`btn ${selfNom ? 'btn-primary' : ''}`}>
          <span className={`inline-grid place-items-center h-4 w-4 border-2 border-current mr-2 align-middle ${selfNom ? 'bg-white text-violet' : ''}`}>
            {selfNom && <Check size={12} />}
          </span>
          {selfNom ? 'Nominations ON' : 'Nominations OFF'}
        </button>
      </div>

      {fields.length === 0 && (
        <div className="panel p-6 text-center">
          <p className="text-ink/70">No form yet. Start from a common set or build from scratch.</p>
          <div className="mt-3 flex justify-center gap-3">
            <button className="btn btn-primary" onClick={() => setFields(starter())}>Use starter fields</button>
            <button className="btn" onClick={() => add('voter')}>Add a blank field</button>
          </div>
        </div>
      )}

      {fields.length > 0 && (
        <>
          <Section title="Voter fields" hint="Everyone fills these in." items={voter}
            TYPES={TYPES} update={update} move={move} remove={(i) => setFields((fs) => fs.filter((_, x) => x !== i))} />
          <button className="btn text-sm" onClick={() => add('voter')}>
            <Plus size={14} className="inline -mt-1 mr-1" /> Add voter field
          </button>

          {selfNom && (
            <>
              <Rule />
              <Section title="Candidate fields" hint="Shown only to people who opt into self-nomination. Use keys 'statement' and 'experience' to map into the candidate record."
                items={cand} TYPES={TYPES} update={update} move={move}
                remove={(i) => setFields((fs) => fs.filter((_, x) => x !== i))} />
              <button className="btn text-sm" onClick={() => add('candidate')}>
                <Plus size={14} className="inline -mt-1 mr-1" /> Add candidate field
              </button>
            </>
          )}

          <div className="pt-2">
            <button className="btn btn-primary text-lg" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save form'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Section({ title, hint, items, TYPES, update, move, remove }) {
  return (
    <div className="panel p-5">
      <Eyebrow>{title}</Eyebrow>
      {hint && <p className="text-xs text-faint mt-1">{hint}</p>}
      <div className="mt-3 space-y-3">
        {items.length === 0 && <p className="text-faint text-sm">No fields in this section.</p>}
        {items.map(({ f, i }) => {
          const needsOptions = ['dropdown', 'radio', 'checkbox'].includes(f.field_type)
          return (
            <div key={i} className="border-2 border-rule bg-white/60 p-3">
              <div className="grid sm:grid-cols-12 gap-2 items-end">
                <label className="sm:col-span-4">
                  <span className="eyebrow">Label</span>
                  <input className="input" value={f.label} onChange={(e) => update(i, 'label', e.target.value)} />
                </label>
                <label className="sm:col-span-3">
                  <span className="eyebrow">Key</span>
                  <input className="input font-mono text-sm" value={f.field_key} onChange={(e) => update(i, 'field_key', e.target.value)} />
                </label>
                <label className="sm:col-span-3">
                  <span className="eyebrow">Type</span>
                  <select className="input" value={f.field_type} onChange={(e) => update(i, 'field_type', e.target.value)}>
                    {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <div className="sm:col-span-2 flex gap-1 justify-end">
                  <button className="btn px-2 py-2" onClick={() => move(i, -1)} title="Up"><ArrowUp size={14} /></button>
                  <button className="btn px-2 py-2" onClick={() => move(i, 1)} title="Down"><ArrowDown size={14} /></button>
                  <button className="btn btn-danger px-2 py-2" onClick={() => remove(i)} title="Remove"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={f.required} onChange={(e) => update(i, 'required', e.target.checked)} />
                  Required
                </label>
                {needsOptions && (
                  <label className="flex-1 text-sm">
                    <span className="eyebrow">Options (comma-separated)</span>
                    <input className="input"
                      value={Array.isArray(f.options) ? f.options.join(', ') : f.options}
                      onChange={(e) => update(i, 'options', e.target.value)} />
                  </label>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}