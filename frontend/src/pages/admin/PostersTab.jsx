import { useEffect, useState, useCallback, useRef } from 'react'
import { Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { adminGetBallot, imageUrl } from '../../lib/api'
import { Download, FileDown, RefreshCw, Crown, Check } from 'lucide-react'

const INK = '#1A1A22', PAPER = '#FAF6EC', VIOLET = '#5B34C4', VIOLET2 = '#6E45DE'
const GOLD = '#B8902B', GOLD_LT = '#E8C766'

export default function PostersTab({ code, password, title }) {
  const toast = useToast()
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('per_candidate') // per_candidate | per_position | winners
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState({})  // id -> bool

  const load = useCallback(async () => {
    setLoading(true)
    try { setPositions(await adminGetBallot(code, password)) }
    catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }, [code, password, toast])
  useEffect(() => { load() }, [load])

  const approved = []
  positions.forEach((p) => (p.candidates || []).forEach((c) => {
    if (c.status === 'approved') approved.push({ ...c, position: p.title })
  }))

  const winners = []
  positions.forEach((p) => {
    const cs = (p.candidates || []).filter((c) => c.status === 'approved')
      .sort((a, b) => (b.votes || 0) - (a.votes || 0))
    const n = Math.max(1, p.max_winners || 1)
    cs.slice(0, n).forEach((c) => { if ((c.votes || 0) > 0) winners.push({ ...c, position: p.title }) })
  })

  // which posters are currently rendered (depends on mode)
  const renderedKeys = mode === 'per_position'
    ? positions.filter((p) => (p.candidates || []).some((c) => c.status === 'approved')).map((p) => `position-${p.id}`)
    : (mode === 'winners' ? winners : approved).map((c) => `cand-${c.id}`)

  const selectedKeys = renderedKeys.filter((k) => sel[k])
  const anySelected = selectedKeys.length > 0

  function toggle(key) { setSel((s) => ({ ...s, [key]: !s[key] })) }
  function selectAll() { const next = {}; renderedKeys.forEach((k) => { next[k] = true }); setSel(next) }
  function clearSel() { setSel({}) }

  // render one node to PNG data url
  async function nodeToPng(el) {
    const { toPng } = await import('html-to-image')
    return toPng(el, { pixelRatio: 2.5, backgroundColor: PAPER, cacheBust: true })
  }

  async function waitImages(scope) {
    await Promise.all([...scope.querySelectorAll('img')].map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve()
      return new Promise((res) => { img.onload = img.onerror = res })
    }))
  }

  // download a single poster by its data-poster key
  async function downloadOne(key, niceName) {
    setBusy(true)
    try {
      const el = document.querySelector(`[data-poster="${key}"]`)
      if (!el) throw new Error('Poster not found')
      await waitImages(el)
      const url = await nodeToPng(el)
      downloadDataUrl(url, `${niceName || key}.png`)
      toast('Downloaded', 'success')
    } catch (e) { toast(`Failed: ${e.message}`, 'error') }
    finally { setBusy(false) }
  }

  // download many: PNGs (sequential) or one combined PDF
  async function downloadMany(keys, kind) {
    if (keys.length === 0) { toast('Nothing selected', 'error'); return }
    setBusy(true)
    try {
      const els = keys.map((k) => document.querySelector(`[data-poster="${k}"]`)).filter(Boolean)
      await waitImages(document)
      if (kind === 'png') {
        for (const el of els) {
          const url = await nodeToPng(el)
          downloadDataUrl(url, `${el.dataset.name || el.dataset.poster}.png`)
          await new Promise((r) => setTimeout(r, 350))
        }
      } else {
        const { jsPDF } = await import('jspdf')
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
        const PAGE_W = 210, PAGE_H = 297, M = 8
        const maxW = PAGE_W - M * 2, maxH = PAGE_H - M * 2
        for (let i = 0; i < els.length; i++) {
          const el = els[i]
          const png = await nodeToPng(el)
          // use the rendered element's real pixel ratio to preserve aspect
          const ratio = el.offsetHeight / el.offsetWidth || 1.4
          let w = maxW, h = maxW * ratio
          if (h > maxH) { h = maxH; w = maxH / ratio }
          const x = (PAGE_W - w) / 2
          if (i > 0) pdf.addPage()
          pdf.addImage(png, 'PNG', x, M, w, h, undefined, 'FAST')
        }
        pdf.save(`${code}-${mode}.pdf`)
      }
      toast('Downloaded', 'success')
    } catch (e) { toast(`Failed: ${e.message}`, 'error') }
    finally { setBusy(false) }
  }

  if (loading) return <div className="card p-8"><Spinner label="Loading…" /></div>

  const showList = mode === 'winners' ? winners : approved

  return (
    <div className="space-y-5">
      {/* header */}
      <div>
        <h2 className="section-title">Posters</h2>
        <p className="text-sm text-muted mt-0.5">Generate share-ready posters. Download one, a selection, or all.</p>
      </div>

      {/* mode + bulk controls */}
      <div className="card p-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-1.5 items-center flex-wrap">
          {[['per_candidate','Per candidate'], ['per_position','By position'], ['winners','Winners']].map(([v,l]) => (
            <button key={v} onClick={() => { setMode(v); clearSel() }}
              className={`btn btn-sm ${mode === v ? 'btn-primary' : ''}`}>
              {v === 'winners' && <Crown size={13} />}{l}
            </button>
          ))}
          <span className="text-xs text-faint ml-1">
            {mode === 'winners' ? `${winners.length} winners` : mode === 'per_position' ? `${renderedKeys.length} positions` : `${approved.length} candidates`}
          </span>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {anySelected
            ? <>
                <span className="text-xs text-violet font-semibold">{selectedKeys.length} selected</span>
                <button className="btn btn-sm" disabled={busy} onClick={() => downloadMany(selectedKeys, 'png')}><Download size={14} /> PNGs</button>
                <button className="btn btn-sm" disabled={busy} onClick={() => downloadMany(selectedKeys, 'pdf')}><FileDown size={14} /> PDF</button>
                <button className="btn btn-sm btn-ghost" onClick={clearSel}>Clear</button>
              </>
            : <>
                <button className="btn btn-sm btn-ghost" onClick={selectAll}>Select all</button>
                <button className="btn btn-sm" onClick={load}><RefreshCw size={14} /></button>
                <button className="btn btn-sm" disabled={busy} onClick={() => downloadMany(renderedKeys, 'png')}><Download size={14} /> All PNGs</button>
                <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => downloadMany(renderedKeys, 'pdf')}><FileDown size={14} /> All PDF</button>
              </>}
        </div>
      </div>

      {mode === 'winners' && winners.length === 0 && (
        <div className="card p-8 text-center text-faint">No winners yet — they appear once votes are counted.</div>
      )}
      {mode !== 'winners' && approved.length === 0 && (
        <div className="card p-8 text-center text-faint">No approved candidates yet. Approve them in the Ballot tab.</div>
      )}

      {/* grid */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {mode === 'per_candidate' && approved.map((c) => (
          <PosterCard key={c.id} selKey={`cand-${c.id}`} selected={!!sel[`cand-${c.id}`]}
            onToggle={toggle} onDownload={downloadOne} busy={busy}
            niceName={`poster-${slug(c.position)}-${slug(c.name)}`}>
            <CandidatePoster c={c} title={title} dataKey={`cand-${c.id}`} niceName={`poster-${slug(c.position)}-${slug(c.name)}`} />
          </PosterCard>
        ))}
        {mode === 'winners' && winners.map((c) => (
          <PosterCard key={c.id} selKey={`cand-${c.id}`} selected={!!sel[`cand-${c.id}`]}
            onToggle={toggle} onDownload={downloadOne} busy={busy}
            niceName={`winner-${slug(c.position)}-${slug(c.name)}`}>
            <CandidatePoster c={c} title={title} winner dataKey={`cand-${c.id}`} niceName={`winner-${slug(c.position)}-${slug(c.name)}`} />
          </PosterCard>
        ))}
        {mode === 'per_position' && positions
          .filter((p) => (p.candidates || []).some((c) => c.status === 'approved'))
          .map((p) => (
            <PosterCard key={p.id} selKey={`position-${p.id}`} selected={!!sel[`position-${p.id}`]}
              onToggle={toggle} onDownload={downloadOne} busy={busy}
              niceName={`position-${slug(p.title)}`} wide>
              <PositionPoster position={p} title={title} dataKey={`position-${p.id}`} niceName={`position-${slug(p.title)}`} />
            </PosterCard>
          ))}
      </div>
    </div>
  )
}

/* wrapper: gives each poster a checkbox + a download button */
function PosterCard({ children, selKey, selected, onToggle, onDownload, busy, niceName, wide }) {
  return (
    <div className={`card card-hover p-3 ${wide ? 'xl:col-span-1' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
          <span className={`h-5 w-5 rounded-md border grid place-items-center transition ${selected ? 'bg-violet border-transparent text-white' : 'bg-white'}`}
                style={{ borderColor: selected ? 'transparent' : 'var(--line-2)' }}
                onClick={() => onToggle(selKey)}>
            {selected && <Check size={13} />}
          </span>
          <span onClick={() => onToggle(selKey)}>Select</span>
        </label>
        <button className="btn btn-sm" disabled={busy} onClick={() => onDownload(selKey, niceName)}>
          <Download size={13} /> PNG
        </button>
      </div>
      <div className="overflow-hidden rounded-lg" style={{ border: '1px solid var(--line)', containerType: 'inline-size' }}>
        <div style={{ transformOrigin: 'top left' }}>{children}</div>
      </div>
    </div>
  )
}

/* ============ CANDIDATE / WINNER POSTER ============ */
function CandidatePoster({ c, title, winner, dataKey, niceName }) {
  const photo = useImageDataUrl(c.photo_path, 'candidate-photos')
  const accent = winner ? GOLD : VIOLET
  return (
    <div data-poster={dataKey} data-name={niceName}
      style={{ width: '100%', background: PAPER,
        fontFamily: 'Archivo, sans-serif', position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: '0.9cqw', minHeight: 5, background: winner ? `linear-gradient(90deg, ${GOLD}, ${GOLD_LT}, ${GOLD})` : `linear-gradient(90deg, ${VIOLET}, ${VIOLET2})`, flexShrink: 0 }} />
      <div style={{ padding: '6cqw 6cqw 5cqw', display: 'flex', flexDirection: 'column', gap: '4cqw' }}>
        {/* header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '2.4cqw', color: '#7a7568', letterSpacing: 2, textTransform: 'uppercase' }}>{title || 'Election'}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: '2cqw', padding: '1.2cqw 4cqw', border: `2px solid ${accent}`, background: '#fff', borderRadius: 7 }}>
            {winner && <span style={{ color: GOLD, fontSize: '3.2cqw', lineHeight: 1 }}>★</span>}
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '2.8cqw', fontWeight: 700, color: accent, letterSpacing: 2, textTransform: 'uppercase' }}>
              {winner ? 'Elected' : 'Candidate'}
            </span>
            {winner && <span style={{ color: GOLD, fontSize: '3.2cqw', lineHeight: 1 }}>★</span>}
          </div>
        </div>
        {/* square photo */}
        <div style={{ width: '100%', aspectRatio: '1 / 1', position: 'relative', background: '#efe9d8',
          border: `3px solid ${INK}`, borderRadius: 6, flexShrink: 0,
          boxShadow: winner ? `0 0 0 5px ${PAPER}, 0 0 0 9px ${GOLD}` : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {photo
            ? <img src={photo} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : <span style={{ color: '#b7af9c', fontFamily: '"IBM Plex Mono", monospace', fontSize: '3cqw', letterSpacing: 2, textTransform: 'uppercase' }}>No photo</span>}
        </div>
        {/* name */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '7cqw', fontWeight: 900, color: INK, lineHeight: 1.04, textTransform: 'uppercase', letterSpacing: -0.5,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{c.name}</div>
        </div>
        {/* position pill */}
        <div style={{ textAlign: 'center' }}>
          <span style={{ display: 'inline-block', padding: '2cqw 7cqw', background: accent, color: '#fff', borderRadius: 8, fontSize: '4cqw', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>
            {c.position}
          </span>
          {winner && c.votes != null && (
            <div style={{ marginTop: '2cqw', fontFamily: '"IBM Plex Mono", monospace', fontSize: '2.8cqw', color: '#7a7568' }}>{c.votes} vote{c.votes === 1 ? '' : 's'}</div>
          )}
        </div>
        <NwsFooter />
      </div>
    </div>
  )
}

function PositionPoster({ position, title, dataKey, niceName }) {
  const approved = (position.candidates || []).filter((c) => c.status === 'approved')
  const cols = approved.length <= 4 ? 2 : 3
  return (
    <div data-poster={dataKey} data-name={niceName}
      style={{ width: '100%', aspectRatio: '595 / 842', background: PAPER, fontFamily: 'Archivo, sans-serif',
        position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: '1.2%', background: `linear-gradient(90deg, ${VIOLET}, ${VIOLET2})`, flexShrink: 0 }} />
      <div style={{ padding: '5%', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '1.9cqw', color: '#7a7568', letterSpacing: 2, textTransform: 'uppercase' }}>{title || 'Election'} · Candidates for</div>
          <div style={{ fontSize: '6.5cqw', fontWeight: 900, color: VIOLET, textTransform: 'uppercase', lineHeight: 1, marginTop: 4 }}>{position.title}</div>
          <div style={{ width: 60, height: 3, background: '#C8102E', margin: '8px auto 0' }} />
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '1.9cqw', color: '#9b9b8b', marginTop: 6 }}>
            {position.max_winners > 1 ? `Pick ${position.max_winners}` : 'Pick one'} · {approved.length} candidates
          </div>
        </div>
        <div style={{ marginTop: '5%', flex: 1, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: 'min-content', gap: '3%', overflow: 'hidden' }}>
          {approved.map((c) => <Mini key={c.id} c={c} />)}
        </div>
        <NwsFooter />
      </div>
    </div>
  )
}

function Mini({ c }) {
  const photo = useImageDataUrl(c.photo_path, 'candidate-photos')
  return (
    <div style={{ border: `2px solid ${INK}`, background: '#fff', padding: 6, borderRadius: 4 }}>
      <div style={{ width: '100%', aspectRatio: '1 / 1', background: '#efe9d8', border: `1px solid ${INK}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {photo
          ? <img src={photo} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <span style={{ color: '#b7af9c', fontSize: '1.6cqw', fontFamily: '"IBM Plex Mono", monospace', letterSpacing: 1, textTransform: 'uppercase' }}>No photo</span>}
      </div>
      <div style={{ marginTop: 6, fontSize: '2.4cqw', fontWeight: 800, color: INK, textAlign: 'center', lineHeight: 1.1, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', textTransform: 'uppercase' }}>{c.name}</div>
    </div>
  )
}

function NwsFooter() {
  return (
    <div style={{ flexShrink: 0, marginTop: '3%', paddingTop: '2%', borderTop: '1px solid #d8d2c0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: '7%', aspectRatio: '1/1', background: VIOLET, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"IBM Plex Mono", monospace', fontWeight: 800, fontSize: '1.8cqw', letterSpacing: 1, flexShrink: 0, borderRadius: 3 }}>NWS</div>
        <div style={{ fontFamily: '"IBM Plex Mono", monospace', lineHeight: 1.2 }}>
          <div style={{ fontSize: '1.9cqw', color: INK, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Powered by NWS Digital</div>
          <div style={{ fontSize: '1.6cqw', color: '#9b9b8b', letterSpacing: 1 }}>nihmathullah.com</div>
        </div>
      </div>
      <div style={{ fontSize: '1.6cqw', fontFamily: '"IBM Plex Mono", monospace', color: '#9b9b8b', letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0 }}>live-ballot.vercel.app</div>
    </div>
  )
}

function useImageDataUrl(path, bucket) {
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!path) { setData(null); return }
    let cancelled = false
    ;(async () => {
      try {
        const url = await imageUrl(bucket, path)
        if (!url) return
        const res = await fetch(url, { mode: 'cors', cache: 'no-cache' })
        const blob = await res.blob()
        const reader = new FileReader()
        reader.onloadend = () => { if (!cancelled) setData(reader.result) }
        reader.readAsDataURL(blob)
      } catch (_) {}
    })()
    return () => { cancelled = true }
  }, [path, bucket])
  return data
}

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'item'
}
function downloadDataUrl(url, name) {
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}