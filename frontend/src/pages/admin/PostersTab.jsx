import { useEffect, useState, useCallback, useRef } from 'react'
import { Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { adminGetBallot, imageUrl, downloadAsDataUrl } from '../../lib/api'
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
    ? positions.filter((p) => (p.candidates || []).some((c) => c.status === 'approved'))
        .flatMap((p) => {
          const appr = (p.candidates || []).filter((c) => c.status === 'approved')
          const n = Math.max(1, Math.ceil(appr.length / 6))
          return Array.from({ length: n }, (_, si) => `position-${p.id}-${si}`)
        })
    : (mode === 'winners' ? winners : approved).map((c) => `cand-${c.id}`)

  const selectedKeys = renderedKeys.filter((k) => sel[k])
  const anySelected = selectedKeys.length > 0

  function toggle(key) { setSel((s) => ({ ...s, [key]: !s[key] })) }
  function selectAll() { const next = {}; renderedKeys.forEach((k) => { next[k] = true }); setSel(next) }
  function clearSel() { setSel({}) }

  // render one node to PNG. Images are already data URLs in the DOM (the display
  // hook converts them up front), so html-to-image captures them natively. We still
  // capture from a detached clone so live React re-renders can't disrupt it, and
  // ensure-inline any img that somehow isn't a data URL yet.
  async function nodeToPng(el) {
    const { toPng } = await import('html-to-image')
    const w = Math.round(el.getBoundingClientRect().width) || 600
    const ratio = Math.max(2, 1080 / w)

    const holder = document.createElement('div')
    holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px;pointer-events:none;`
    const clone = el.cloneNode(true)
    const u = getComputedStyle(el).getPropertyValue('--u')
    if (u) clone.style.setProperty('--u', u.trim())
    holder.appendChild(clone)
    document.body.appendChild(holder)

    try {
      // Match clone images to the ORIGINAL images by index and copy the live
      // `.src` PROPERTY across. React sets src as a property + the value is a huge
      // base64 data URL, which cloneNode may not faithfully reproduce as an
      // attribute — so we copy it explicitly. Only data:/http(s) srcs are kept;
      // anything else is removed so html-to-image never tries (and fails) to fetch.
      const origImgs = [...el.querySelectorAll('img')]
      const cloneImgs = [...clone.querySelectorAll('img')]
      await Promise.all(cloneImgs.map((cimg, i) => {
        const realSrc = origImgs[i]?.currentSrc || origImgs[i]?.src || ''
        if (realSrc.startsWith('data:') || realSrc.startsWith('http')) {
          return new Promise((res) => {
            cimg.onload = cimg.onerror = () => res()
            cimg.setAttribute('src', realSrc)
            cimg.src = realSrc
            if (cimg.complete && cimg.naturalWidth > 0) res()
            setTimeout(res, 5000)
          })
        }
        cimg.remove()
        return Promise.resolve()
      }))
      await new Promise((r) => setTimeout(r, 40))
      return await toPng(clone, { backgroundColor: PAPER, cacheBust: false, pixelRatio: ratio, skipFonts: false })
    } finally {
      document.body.removeChild(holder)
    }
  }

  // Wait until every <img> in scope is an export-ready data URL (the display hook
  // downloads them via the SDK shortly after mount). Times out after ~8s so a single
  // stuck image can't block the download forever — it'll just show a cream box.
  async function waitImages(scope) {
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
      const imgs = [...scope.querySelectorAll('img')]
      const pending = imgs.filter((img) => {
        const s = img.getAttribute('src')
        return s && !s.startsWith('data:')
      })
      if (pending.length === 0) break
      await new Promise((r) => setTimeout(r, 200))
    }
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
    } catch (e) { toast(`Failed: ${e?.message || e?.toString?.() || 'render error'}`, 'error') }
    finally { setBusy(false) }
  }

  // get pixel dimensions of a data-url png
  function pngSize(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => resolve({ w: 1, h: 1.4 })
      img.src = dataUrl
    })
  }

  // download many: PNGs (sequential) or one combined PDF
  async function downloadMany(keys, kind) {
    if (keys.length === 0) { toast('Nothing selected', 'error'); return }
    setBusy(true)
    try {
      const els = keys.map((k) => document.querySelector(`[data-poster="${k}"]`)).filter(Boolean)
      if (els.length === 0) throw new Error('No posters found')
      for (const el of els) await waitImages(el)
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
        let added = 0
        for (let i = 0; i < els.length; i++) {
          const png = await nodeToPng(els[i])
          const { w: pw, h: ph } = await pngSize(png)
          const ratio = (ph && pw) ? ph / pw : 1.4
          let w = maxW, h = maxW * ratio
          if (h > maxH) { h = maxH; w = maxH / ratio }
          const x = (PAGE_W - w) / 2
          if (added > 0) pdf.addPage()
          pdf.addImage(png, 'PNG', x, M, w, h, undefined, 'FAST')
          added++
        }
        if (added === 0) throw new Error('Nothing rendered')
        pdf.save(`${code}-${mode}.pdf`)
      }
      toast('Downloaded', 'success')
    } catch (e) { toast(`Failed: ${e?.message || e?.toString?.() || 'render error'}`, 'error') }
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
          .flatMap((p) => {
            const appr = (p.candidates || []).filter((c) => c.status === 'approved')
            const sheets = chunk(appr, 6)
            return sheets.map((group, si) => {
              const key = `position-${p.id}-${si}`
              const name = sheets.length > 1 ? `position-${slug(p.title)}-sheet${si + 1}` : `position-${slug(p.title)}`
              return (
                <PosterCard key={key} selKey={key} selected={!!sel[key]}
                  onToggle={toggle} onDownload={downloadOne} busy={busy}
                  niceName={name} wide>
                  <PositionPoster position={p} candidates={group} title={title}
                    page={si + 1} pages={sheets.length}
                    dataKey={key} niceName={name} />
                </PosterCard>
              )
            })
          })}
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

// Sets --u on the poster node to 1% of its rendered width, so we can use
// calc(var(--u)*N) instead of Ncqw. CSS vars survive html-to-image's clone
// (container queries do not), so exports render identically to the preview.
function usePosterUnit() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const apply = () => { const w = el.getBoundingClientRect().width; if (w) el.style.setProperty('--u', `${w / 100}px`) }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return ref
}

/* ============ CANDIDATE / WINNER POSTER ============ */
function CandidatePoster({ c, title, winner, dataKey, niceName }) {
  const photo = useImageDataUrl(c.photo_path, 'candidate-photos')
  const accent = winner ? GOLD : VIOLET
  const ref = usePosterUnit()
  return (
    <div ref={ref} data-poster={dataKey} data-name={niceName}
      style={{ width: '100%', background: PAPER,
        fontFamily: 'Archivo, sans-serif', position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 'calc(var(--u)*0.9)', minHeight: 5, background: winner ? `linear-gradient(90deg, ${GOLD}, ${GOLD_LT}, ${GOLD})` : `linear-gradient(90deg, ${VIOLET}, ${VIOLET2})`, flexShrink: 0 }} />
      <div style={{ padding: 'calc(var(--u)*6) calc(var(--u)*6) calc(var(--u)*5)', display: 'flex', flexDirection: 'column', gap: 'calc(var(--u)*4)' }}>
        {/* header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 'calc(var(--u)*2.4)', color: '#7a7568', letterSpacing: 2, textTransform: 'uppercase' }}>{title || 'Election'}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 'calc(var(--u)*2)', padding: 'calc(var(--u)*1.2) calc(var(--u)*4)', border: `2px solid ${accent}`, background: '#fff', borderRadius: 7 }}>
            {winner && <span style={{ color: GOLD, fontSize: 'calc(var(--u)*3.2)', lineHeight: 1 }}>★</span>}
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 'calc(var(--u)*2.8)', fontWeight: 700, color: accent, letterSpacing: 2, textTransform: 'uppercase' }}>
              {winner ? 'Elected' : 'Candidate'}
            </span>
            {winner && <span style={{ color: GOLD, fontSize: 'calc(var(--u)*3.2)', lineHeight: 1 }}>★</span>}
          </div>
        </div>
        {/* square photo */}
        <div style={{ width: '100%', aspectRatio: '1 / 1', position: 'relative', background: '#efe9d8',
          border: `3px solid ${INK}`, borderRadius: 6, flexShrink: 0,
          boxShadow: winner ? `0 0 0 5px ${PAPER}, 0 0 0 9px ${GOLD}` : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {photo
            ? <PosterImg src={photo} />
            : <span style={{ color: '#b7af9c', fontFamily: '"IBM Plex Mono", monospace', fontSize: 'calc(var(--u)*3)', letterSpacing: 2, textTransform: 'uppercase' }}>No photo</span>}
        </div>
        {/* name */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'calc(var(--u)*7)', fontWeight: 900, color: INK, lineHeight: 1.04, textTransform: 'uppercase', letterSpacing: -0.5,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{c.name}</div>
        </div>
        {/* position pill */}
        <div style={{ textAlign: 'center' }}>
          <span style={{ display: 'inline-block', padding: 'calc(var(--u)*2) calc(var(--u)*7)', background: accent, color: '#fff', borderRadius: 8, fontSize: 'calc(var(--u)*4)', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>
            {c.position}
          </span>
          {winner && c.votes != null && (
            <div style={{ marginTop: 'calc(var(--u)*2)', fontFamily: '"IBM Plex Mono", monospace', fontSize: 'calc(var(--u)*2.8)', color: '#7a7568' }}>{c.votes} vote{c.votes === 1 ? '' : 's'}</div>
          )}
        </div>
        <NwsFooter />
      </div>
    </div>
  )
}

function PositionPoster({ position, candidates, title, page, pages, dataKey, niceName }) {
  const list = candidates || (position.candidates || []).filter((c) => c.status === 'approved')
  const ref = usePosterUnit()
  return (
    <div ref={ref} data-poster={dataKey} data-name={niceName}
      style={{ width: '100%', aspectRatio: '595 / 842', background: PAPER, fontFamily: 'Archivo, sans-serif',
        position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: '1.2%', background: `linear-gradient(90deg, ${VIOLET}, ${VIOLET2})`, flexShrink: 0 }} />
      <div style={{ padding: '5%', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 'calc(var(--u)*1.9)', color: '#7a7568', letterSpacing: 2, textTransform: 'uppercase' }}>{title || 'Election'} · Candidates for</div>
          <div style={{ fontSize: 'calc(var(--u)*6.5)', fontWeight: 900, color: VIOLET, textTransform: 'uppercase', lineHeight: 1, marginTop: 4 }}>{position.title}</div>
          <div style={{ width: 60, height: 3, background: '#C8102E', margin: '8px auto 0' }} />
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 'calc(var(--u)*1.9)', color: '#9b9b8b', marginTop: 6 }}>
            {position.max_winners > 1 ? `Pick ${position.max_winners}` : 'Pick one'}
            {pages > 1 && <span> · sheet {page} of {pages}</span>}
          </div>
        </div>
        <div style={{ marginTop: '5%', flex: 1, display: 'grid', gridTemplateColumns: `repeat(3, 1fr)`, gridAutoRows: 'min-content', justifyContent: 'center', gap: '4%', alignContent: 'start', overflow: 'hidden' }}>
          {list.map((c) => <Mini key={c.id} c={c} />)}
          {/* fill empty cells so a lone candidate doesn't stretch */}
          {list.length % 3 !== 0 && Array.from({ length: 3 - (list.length % 3) }).map((_, i) => <div key={`sp-${i}`} />)}
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
          ? <PosterImg src={photo} />
          : <span style={{ color: '#b7af9c', fontSize: 'calc(var(--u)*1.6)', fontFamily: '"IBM Plex Mono", monospace', letterSpacing: 1, textTransform: 'uppercase' }}>No photo</span>}
      </div>
      <div style={{ marginTop: 6, fontSize: 'calc(var(--u)*2.4)', fontWeight: 800, color: INK, textAlign: 'center', lineHeight: 1.1, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', textTransform: 'uppercase' }}>{c.name}</div>
    </div>
  )
}

function NwsFooter() {
  return (
    <div style={{ flexShrink: 0, marginTop: '3%', paddingTop: '2%', borderTop: '1px solid #d8d2c0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: '7%', aspectRatio: '1/1', background: VIOLET, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"IBM Plex Mono", monospace', fontWeight: 800, fontSize: 'calc(var(--u)*1.8)', letterSpacing: 1, flexShrink: 0, borderRadius: 3 }}>NWS</div>
        <div style={{ fontFamily: '"IBM Plex Mono", monospace', lineHeight: 1.2 }}>
          <div style={{ fontSize: 'calc(var(--u)*1.9)', color: INK, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Powered by NWS Digital</div>
          <div style={{ fontSize: 'calc(var(--u)*1.6)', color: '#9b9b8b', letterSpacing: 1 }}>nihmathullah.com</div>
        </div>
      </div>
      <div style={{ fontSize: 'calc(var(--u)*1.6)', fontFamily: '"IBM Plex Mono", monospace', color: '#9b9b8b', letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0 }}>live-ballot.vercel.app</div>
    </div>
  )
}

function useImageDataUrl(path, bucket) {
  const [data, setData] = useState(null)     // data URL — export-ready, drawn in the DOM
  const [fallback, setFallback] = useState(null) // plain URL — shown instantly while data loads
  useEffect(() => {
    if (!path) { setData(null); setFallback(null); return }
    let cancelled = false
    ;(async () => {
      // instant display via public URL
      try { const url = await imageUrl(bucket, path); if (!cancelled && url) setFallback(url) } catch (_) {}
      // export-ready data URL via SDK download (avoids the image-CORS problem
      // that blanks exports — a plain <img> shows, but fetch/canvas on it is blocked)
      try {
        const dataUrl = await downloadAsDataUrl(bucket, path)
        if (!cancelled && dataUrl) setData(dataUrl)
      } catch (_) {}
    })()
    return () => { cancelled = true }
  }, [path, bucket])
  return data || fallback
}

function PosterImg({ src }) {
  return (
    <img src={src} alt=""
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
  )
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out.length ? out : [[]]
}

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'item'
}
function downloadDataUrl(url, name) {
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}