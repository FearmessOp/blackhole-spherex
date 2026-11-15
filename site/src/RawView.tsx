import { useEffect, useState } from 'react'
import SkyPanel from './SkyPanel'
import { t, useLang } from './i18n'
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
    useLang()
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

    if (failed) return <p className="note">{t('raw.failed')}</p>
    if (!raw) return <p className="note">{t('raw.loading')}</p>
    if (count === 0) return <p className="note">{t('raw.none')}</p>

    const { f, i } = shown[pos % count]
    const rows = Math.ceil(raw.frames.length / raw.cols)
    const col = i % raw.cols
    const row = Math.floor(i / raw.cols)

    return (
        <SkyPanel
            title={t('panel.raw')}
            help="help.raw"
            n={raw.npix}
            scaleArcsec={scaleArcsec}
            marker={marker ? predicted[f.epoch] : null}
            background={{
                backgroundImage: `url(${base}${raw.sheet})`,
                backgroundSize: `${raw.cols * 100}% ${rows * 100}%`,
                backgroundPosition: `${(col / (raw.cols - 1)) * 100}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`
            }}
            caption={t('raw.caption', { w: f.wave_um.toFixed(2), d: f.det })}
            detail={t('raw.detail', {
                t: f.t.replace('T', ' '),
                e: f.epoch + 1,
                rel: f.release.toUpperCase(),
                i: (pos % count) + 1,
                n: count
            })}
        />
    )
}