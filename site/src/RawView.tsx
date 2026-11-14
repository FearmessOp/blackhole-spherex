import { useEffect, useState } from 'react'

type RawFrame = { t: string; epoch: number; det: number; wave_um: number; release: string }
type Raw = { sheet: string; cols: number; npix: number; frames: RawFrame[] }
type Props = {
    base: string
    size: number
    playing: boolean
    marker: boolean
    det: number | null // null = all detectors
    predicted: { x: number; y: number }[] // catalogue position per epoch
}

const RAW_MS = 200

export default function RawView({ base, size, playing, marker, det, predicted }: Props) {
    const [raw, setRaw] = useState<Raw | null>(null)
    const [failed, setFailed] = useState(false)
    const [pos, setPos] = useState(0)

    useEffect(() => {
        let cancelled = false
        fetch(`${base}raw.json`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then((d: Raw) => {
                if (!cancelled) setRaw(d)
            })
            .catch(() => {
                if (!cancelled) setFailed(true)
            })
        return () => {
            cancelled = true
        }
    }, [base])

    // Exposures shown, with their index in the sprite sheet.
    const shown = raw
        ? raw.frames.map((f, i) => ({ f, i })).filter(({ f }) => det === null || f.det === det)
        : []
    const count = shown.length

    useEffect(() => {
        if (!playing || count < 2) return
        const id = window.setInterval(() => setPos((p) => p + 1), RAW_MS)
        return () => window.clearInterval(id)
    }, [playing, count])

    if (failed) return <p className="note">Could not load the raw exposures.</p>
    if (!raw) return <p className="note">Loading raw exposures…</p>
    if (count === 0) return <p className="note">No raw exposures for this detector.</p>

    const { f, i } = shown[pos % count]
    const rows = Math.ceil(raw.frames.length / raw.cols)
    const col = i % raw.cols
    const row = Math.floor(i / raw.cols)
    const n = raw.npix
    const p = predicted[f.epoch]

    return (
        <figure className="fig">
            <figcaption>Raw exposures, one at a time</figcaption>
            <div
                className="view sky"
                style={{
                    width: size,
                    backgroundImage: `url(${base}${raw.sheet})`,
                    backgroundSize: `${raw.cols * 100}% ${rows * 100}%`,
                    backgroundPosition: `${(col / (raw.cols - 1)) * 100}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`
                }}
            >
                <svg className="overlay" viewBox={`0 0 ${n} ${n}`}>
                    {marker && p && (
                        <g className="marker" transform={`translate(${p.x + 0.5} ${p.y + 0.5})`}>
                            <line x1="-3" y1="0" x2="-1.5" y2="0" />
                            <line x1="1.5" y1="0" x2="3" y2="0" />
                            <line x1="0" y1="-3" x2="0" y2="-1.5" />
                            <line x1="0" y1="1.5" x2="0" y2="3" />
                        </g>
                    )}
                </svg>
            </div>
            <p className="epoch">
                {f.wave_um.toFixed(2)} µm, detector {f.det}
            </p>
            <p className="detail">
                {f.t.replace('T', ' ')} UTC, epoch {f.epoch + 1}, {f.release.toUpperCase()}, exposure{' '}
                {(pos % count) + 1} of {count}. Every exposure is taken at a different wavelength.
            </p>
        </figure>
    )
}