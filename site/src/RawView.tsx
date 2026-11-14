import { useEffect, useState } from 'react'
import SkyPanel from './SkyPanel'
import type { XY } from './types'

type RawFrame = { t: string; epoch: number; det: number; wave_um: number; release: string }
type Raw = { sheet: string; cols: number; npix: number; frames: RawFrame[] }
type Props = {
    base: string
    scaleArcsec: number
    playing: boolean
    marker: boolean
    dets: number[] | null // null = all detectors
    predicted: XY[] // catalogue position per epoch
}

const RAW_MS = 200

export default function RawView({ base, scaleArcsec, playing, marker, dets, predicted }: Props) {
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
        ? raw.frames.map((f, i) => ({ f, i })).filter(({ f }) => dets === null || dets.includes(f.det))
        : []
    const count = shown.length

    useEffect(() => {
        if (!playing || count < 2) return
        const id = window.setInterval(() => setPos((p) => p + 1), RAW_MS)
        return () => window.clearInterval(id)
    }, [playing, count])

    if (failed) return <p className="note">Could not load the raw exposures.</p>
    if (!raw) return <p className="note">Loading raw exposures…</p>
    if (count === 0) return <p className="note">No raw exposures for this detector selection.</p>

    const { f, i } = shown[pos % count]
    const rows = Math.ceil(raw.frames.length / raw.cols)
    const col = i % raw.cols
    const row = Math.floor(i / raw.cols)

    return (
        <SkyPanel
            title="Raw exposures, one at a time"
            n={raw.npix}
            scaleArcsec={scaleArcsec}
            marker={marker ? predicted[f.epoch] : null}
            background={{
                backgroundImage: `url(${base}${raw.sheet})`,
                backgroundSize: `${raw.cols * 100}% ${rows * 100}%`,
                backgroundPosition: `${(col / (raw.cols - 1)) * 100}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`
            }}
            caption={`${f.wave_um.toFixed(2)} µm, detector ${f.det}`}
            detail={`${f.t.replace('T', ' ')} UTC, epoch ${f.epoch + 1}, ${f.release.toUpperCase()}, exposure ${(pos % count) + 1
                } of ${count}`}
        />
    )
}