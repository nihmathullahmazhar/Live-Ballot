import { useEffect, useState, useRef, useCallback } from 'react'
import { Eyebrow, Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { adminGetBallot, imageUrl } from '../../lib/api'
import { Download, FileDown, RefreshCw, ImageIcon } from 'lucide-react'

export default function PostersTab({ code, password, title }) {
  const toast = useToast()
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('per_candidate') // or 'per_position'
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setPositions(await adminGetBallot(code, password)) }
    catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }, [code, password, toast])
  useEffect(() => { load() }, [load])

  // collect approved candidates only
  const approved = []
  positions.forEach((p) => (p.candidates || []).forEach((c) => {
    if (c.status === 'approved') approved.push({ ...c, position: p.title })
  }))

  async function downloadAll(kind) {
    setBusy(true)
    try {
      const { toPng } = await import('html-to-image')
      if (kind === 'png-zip') {
        // download each PNG individually (no zip lib bundled — just sequential downloads)
        for (const el of document.querySelectorAll('[data-poster]')) {
          const url = await toPng(el, { pixelRatio: 2, backgroundColor: '#FAF6EC' })
          downloadDataUrl(url, `${el.dataset.poster}.png`)
          await new Promise((r) => setTimeout(r, 400)) // give browser time per file
        }
      }
      if (kind === 'pdf') {
        const { jsPDF } = await import('jspdf')
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
        const els = [...document.querySelectorAll('[data-poster]')]
        for (let i = 0; i < els.length; i++) {
          const png = await toPng(els[i], { pixelRatio: 2, backgroundColor: '#FAF6EC' })
          if (i > 0) pdf.addPage()
          // A4 is 210x297mm; center poster with 10mm margin
          pdf.addImage(png, 'PNG', 10, 10, 190, 277, undefined, 'FAST')
        }
        pdf.save(`${code}-posters.pdf`)
      }
      toast('Downloaded', 'success')
    } catch (e) { toast(`Download failed: ${e.message}`, 'error') }
    finally { setBusy(false) }
  }

  if (loading) return <div className="panel p-6"><Spinner label="Loading…" /></div>

  return (
    <div className="space-y-4">
      <div className="panel p-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 items-center flex-wrap">
          {[['per_candidate','One per candidate'], ['per_position','One per position']].map(([v,l]) => (
            <button key={v} onClick={() => setMode(v)}
              className={`btn text-sm ${mode === v ? 'btn-primary' : ''}`}>{l}</button>
          ))}
          <span className="eyebrow ml-2">{approved.length} approved candidates</span>
        </div>
        <div className="flex gap-2">
          <button className="btn text-sm" onClick={load}><RefreshCw size={14} className="inline -mt-1 mr-1" />Refresh</button>
          <button className="btn text-sm" disabled={busy || approved.length === 0}
            onClick={() => downloadAll('png-zip')}>
            <Download size={14} className="inline -mt-1 mr-1" />PNGs
          </button>
          <button className="btn btn-primary text-sm" disabled={busy || approved.length === 0}
            onClick={() => downloadAll('pdf')}>
            <FileDown size={14} className="inline -mt-1 mr-1" />PDF
          </button>
        </div>
      </div>

      {approved.length === 0 && (
        <div className="panel p-8 text-center text-faint">
          No approved candidates yet. Approve candidates in the Ballot tab to generate posters.
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {mode === 'per_candidate' && approved.map((c) => (
          <CandidatePoster key={c.id} c={c} title={title} />
        ))}
        {mode === 'per_position' && positions
          .filter((p) => (p.candidates || []).some((c) => c.status === 'approved'))
          .map((p) => (
            <PositionPoster key={p.id} position={p} title={title} />
          ))}
      </div>
    </div>
  )
}

function CandidatePoster({ c, title }) {
  const [photo, setPhoto] = useState(null)
  useEffect(() => { if (c.photo_path) imageUrl('candidate-photos', c.photo_path).then(setPhoto) }, [c.photo_path])
  const fname = `poster-${slug(c.position)}-${slug(c.name)}`
  return (
    <div className="bg-white border-4 border-ink shadow-paper">
      <div data-poster={fname}
        style={{ width: 420, height: 594, padding: 24, background: '#FAF6EC', fontFamily: 'Archivo, sans-serif' }}>
        <div style={{ borderBottom: '4px double #1a1a1a', paddingBottom: 10 }}>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: '#6b6b6b', letterSpacing: 2, textTransform: 'uppercase' }}>
            {title || 'Election'} · Candidate
          </div>
        </div>
        <div style={{ marginTop: 18, height: 340, background: '#fff', border: '4px solid #1a1a1a',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {photo ? (
            <img src={photo} crossOrigin="anonymous" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ color: '#999', textAlign: 'center', padding: 20 }}>
              No photo<br/><span style={{ fontSize: 11 }}>(uploaded photo will appear here)</span>
            </div>
          )}
        </div>
        <div style={{ marginTop: 22, border: '3px solid #1a1a1a', padding: '14px 16px', background: '#fff' }}>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: '#6b6b6b', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            Standing for
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#4B2E83', textTransform: 'uppercase', lineHeight: 1.1 }}>
            {c.position}
          </div>
          <div style={{ marginTop: 12, fontSize: 28, fontWeight: 900, color: '#1a1a1a', lineHeight: 1.1 }}>
            {c.name}
          </div>
          {c.bio && <div style={{ marginTop: 8, fontSize: 13, color: '#3a3a3a', lineHeight: 1.35 }}>{c.bio}</div>}
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      borderTop: '2px solid #d0d0d0', paddingTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 22, height: 22, background: '#4B2E83', color: '#fff',
                          display: 'grid', placeItems: 'center', fontFamily: '"IBM Plex Mono", monospace',
                          fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>NWS</div>
            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 9, lineHeight: 1.2 }}>
              <div style={{ color: '#1a1a1a', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                Powered by NWS
              </div>
              <div style={{ color: '#9b9b9b', letterSpacing: 1 }}>nihmathullah.com</div>
            </div>
          </div>
          <div style={{ fontSize: 9, fontFamily: '"IBM Plex Mono", monospace',
                        color: '#9b9b9b', letterSpacing: 2, textTransform: 'uppercase' }}>
            live-ballot.vercel.app
          </div>
        </div>
      </div>
    </div>
  )
}

function PositionPoster({ position, title }) {
  const approved = (position.candidates || []).filter((c) => c.status === 'approved')
  const fname = `position-${slug(position.title)}`
  // grid: 2 per row up to 4, else 3 per row
  const cols = approved.length <= 4 ? 2 : 3
  return (
    <div className="bg-white border-4 border-ink shadow-paper">
      <div data-poster={fname}
        style={{ width: 595, height: 842, padding: 30, background: '#FAF6EC', fontFamily: 'Archivo, sans-serif' }}>
        <div style={{ borderBottom: '4px double #1a1a1a', paddingBottom: 14 }}>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 12, color: '#6b6b6b', letterSpacing: 2, textTransform: 'uppercase' }}>
            {title || 'Election'} · Candidates for
          </div>
          <div style={{ fontSize: 38, fontWeight: 900, color: '#4B2E83', textTransform: 'uppercase', lineHeight: 1, marginTop: 4 }}>
            {position.title}
          </div>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: '#9b9b9b', marginTop: 4 }}>
            {position.max_winners > 1 ? `Pick ${position.max_winners}` : 'Pick 1'} · {approved.length} candidates
          </div>
        </div>
        <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16 }}>
          {approved.map((c) => <Mini key={c.id} c={c} />)}
        </div>
        <div style={{ position: 'absolute', bottom: 30, left: 30, right: 30,
                      borderTop: '2px solid #d0d0d0', paddingTop: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, background: '#4B2E83', color: '#fff',
                          display: 'grid', placeItems: 'center', fontFamily: '"IBM Plex Mono", monospace',
                          fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>NWS</div>
            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, lineHeight: 1.2 }}>
              <div style={{ color: '#1a1a1a', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                Powered by NWS Digital Services
              </div>
              <div style={{ color: '#9b9b9b', letterSpacing: 1 }}>nihmathullah.com</div>
            </div>
          </div>
          <div style={{ fontSize: 10, fontFamily: '"IBM Plex Mono", monospace',
                        color: '#9b9b9b', letterSpacing: 2, textTransform: 'uppercase' }}>
            live-ballot.vercel.app
          </div>
        </div>
      </div>
    </div>
  )
}

function Mini({ c }) {
  const [photo, setPhoto] = useState(null)
  useEffect(() => { if (c.photo_path) imageUrl('candidate-photos', c.photo_path).then(setPhoto) }, [c.photo_path])
  return (
    <div style={{ border: '3px solid #1a1a1a', background: '#fff', padding: 8 }}>
      <div style={{ width: '100%', aspectRatio: '1 / 1', background: '#f3f0e3', border: '2px solid #1a1a1a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {photo
          ? <img src={photo} crossOrigin="anonymous" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ color: '#999', fontSize: 11 }}>no photo</span>}
      </div>
      <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800, color: '#1a1a1a', textAlign: 'center', lineHeight: 1.15 }}>
        {c.name}
      </div>
      {c.bio && <div style={{ marginTop: 2, fontSize: 10, color: '#666', textAlign: 'center' }}>{c.bio}</div>}
    </div>
  )
}

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'item'
}

function downloadDataUrl(url, name) {
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}