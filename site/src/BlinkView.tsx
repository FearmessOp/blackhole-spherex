import { useEffect, useState } from 'react'

type Epoch = {
    index: number
    t_start: string
    t_end: string
    n_exposures: number
    predicted: { x: number; y: number }
    measured?: { x: number; y: number }
    offset_arcsec?: { east: number; north: number; total: number }
}
type Frame = { epoch: number; png: string; n_frames: number; wave_min_um: number; wave_max_um: number }
type Band = { id: string; label: string; frames: Frame[] }
type Meta = {
    name: string
    grid: { npix: number; scale_arcsec: number }
    n_exposures: number
    n_missing: number
    epochs: Epoch[]
    bands: Band[]
}

const ZOOM = 16
const SPEEDS = [
    { label: 'Slow', ms: 1200 },
    { label: 'Normal', ms: 600 },
    { label: 'Fast', ms: 250 }]

export default function BlinkView({ slug }: { slug: string }) {
    const base = `${import.meta.env.BASE_URL}data/${slug}/`
    const [meta, setMeta] = useState<Meta | null>(null)
    const [failed, setFailed] = useState(false)
    const [bandId, setBandId] = useState('all')
    const [pos, setPos] = useState(0)
    const [playing, setPlaying] = useState(true)
    const [ms, setMs] = useState(600)
    const [marker, setMarker] = useState(true)

    useEffect(() => {
        let cancelled = false
        setMeta(null)
        setFailed(false)
        fetch(`${base}meta.json`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then((m: Meta) => {
                if (!cancelled) setMeta(m)
            })
            .catch(() => {
                if (!cancelled) setFailed(true)
            })
        return () => {
            cancelled = true
        }
    }, [base])

    const band = meta?.bands.find((b) => b.id === bandId) ?? meta?.bands[0]
    const nFrames = band?.frames.length ?? 0

    useEffect(() => {
        if (!playing || nFrames < 2) return
        const id = window.setInterval(() => setPos((p) => (p + 1) % nFrames), ms)
        return () => window.clearInterval(id)
    }, [playing, ms, nFrames])

    if (failed) return <p className="note">Could not load the data for this target.</p>
    if (!meta || !band) return <p className="note">Loading…</p>

    const frame = band.frames[pos % nFrames]
    const epoch = meta.epochs[frame.epoch]
    const n = meta.grid.npix
    const size = n * ZOOM

    return (
        <div className="blink">
            <div className="view" style={{ width: size, height: size }}>
                {band.frames.map((f) => (
                    <img
                        key={f.png}
                        className="sky"
                        src={base + f.png}
                        width={size}
                        height={size}
                        alt=""
                        style={{ visibility: f === frame ? 'visible' : 'hidden' }}
                    />
                ))}
                <svg className="overlay" viewBox={`0 0 ${n} ${n}`} width={size} height={size}>
                    {marker && (
                        <g className="marker" transform={`translate(${epoch.predicted.x + 0.5} ${epoch.predicted.y + 0.5})`}>
                            <line x1="-3" y1="0" x2="-1.5" y2="0" />
                            <line x1="1.5" y1="0" x2="3" y2="0" />
                            <line x1="0" y1="-3" x2="0" y2="-1.5" />
                            <line x1="0" y1="1.5" x2="0" y2="3" />
                        </g>
                    )}
                    <text className="compass" x="0.6" y="1.6">N up, E left</text>
                </svg>
            </div>

            <div className="panel">
                <h2>{meta.name}</h2>
                <p className="epoch">
                    Epoch {frame.epoch + 1} of {meta.epochs.length}: {epoch.t_start.slice(0, 10)} to {epoch.t_end.slice(0, 10)}
                </p>
                <p className="detail">
                    {frame.n_frames} exposures stacked, {frame.wave_min_um.toFixed(2)}–{frame.wave_max_um.toFixed(2)} µm
                </p>

                <div className="row">
                    <button onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
                    {band.frames.map((f, i) => (
                        <button
                            key={f.png}
                            className={i === pos % nFrames ? 'on' : ''}
                            onClick={() => {
                                setPlaying(false)
                                setPos(i)
                            }}
                        >
                            {f.epoch + 1}
                        </button>
                    ))}
                </div>

                <div className="row">
                    {SPEEDS.map((s) => (
                        <button key={s.ms} className={s.ms === ms ? 'on' : ''} onClick={() => setMs(s.ms)}>
                            {s.label}
                        </button>
                    ))}
                </div>

                <div className="row">
                    {meta.bands.map((b) => (
                        <button
                            key={b.id}
                            className={b.id === band.id ? 'on' : ''}
                            onClick={() => {
                                setBandId(b.id)
                                setPos(0)
                            }}
                        >
                            {b.id === 'all' ? 'All' : b.id.toUpperCase()}
                        </button>
                    ))}
                </div>

                <label className="check">
                    <input type="checkbox" checked={marker} onChange={(e) => setMarker(e.target.checked)} />
                    Mark catalogue position (SIMBAD position + proper motion)
                </label>

                {epoch.offset_arcsec && (
                    <p className="detail">
                        Measured centroid is {epoch.offset_arcsec.total.toFixed(2)}″ from the catalogue prediction
                        (all-detector stack, parallax not included).
                    </p>
                )}
                <p className="detail">
                    {meta.n_exposures} exposures used, {meta.n_missing} not downloaded. One brightness scale per
                    band across all epochs. 1 pixel = {meta.grid.scale_arcsec} arcsec.
                </p>
            </div>
        </div>
    )
}