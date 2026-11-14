import { useEffect, useState } from 'react'
import RawView from './RawView'
import ResultsPanel, { FlickerNote } from './ResultsPanel'
import SkyPanel from './SkyPanel'
import type { Arrow, Band, Meta, Results } from './types'

const SPEEDS = [
    { label: 'Slow', ms: 1200 },
    { label: 'Normal', ms: 600 },
    { label: 'Fast', ms: 250 }]

const bandName = (id: string) =>
    id === 'all' ? 'All' : id === 'd123' ? 'D1–3' : id === 'd56' ? 'D5+6' : id.toUpperCase()

type StackProps = {
    base: string
    meta: Meta
    band: Band
    epoch: number
    title: string
    marker: boolean
    arrow?: Arrow | null
}

// One band at one epoch. All frames of the band stay loaded so that blinking does not flash.
function StackPanel({ base, meta, band, epoch, title, marker, arrow }: StackProps) {
    const frame = band.frames.find((f) => f.epoch === epoch)
    const ep = meta.epochs[epoch]
    return (
        <SkyPanel
            title={title}
            n={meta.grid.npix}
            scaleArcsec={meta.grid.scale_arcsec}
            marker={marker ? ep.predicted : null}
            arrow={arrow}
            caption={`Epoch ${epoch + 1} of ${meta.epochs.length}: ${ep.t_start.slice(0, 10)} to ${ep.t_end.slice(0, 10)}`}
            detail={
                frame
                    ? `${frame.n_frames} exposures stacked, ${frame.wave_min_um.toFixed(2)}–${frame.wave_max_um.toFixed(2)} µm`
                    : 'No exposures of this detector selection in this epoch'
            }
        >
            {band.frames.map((f) => (
                <img key={f.png} src={base + f.png} alt="" style={{ visibility: f === frame ? 'visible' : 'hidden' }} />
            ))}
        </SkyPanel>
    )
}

export default function BlinkView({ slug }: { slug: string }) {
    const base = `${import.meta.env.BASE_URL}data/${slug}/`
    const [data, setData] = useState<{ meta: Meta; res: Results } | null>(null)
    const [failed, setFailed] = useState(false)
    const [bandId, setBandId] = useState<string | null>(null)
    const [pos, setPos] = useState(0)
    const [playing, setPlaying] = useState(true)
    const [ms, setMs] = useState(600)
    const [marker, setMarker] = useState(true)

    useEffect(() => {
        let cancelled = false
        const get = (name: string) =>
            fetch(base + name).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        Promise.all([get('meta.json'), get('results.json')])
            .then(([meta, res]) => {
                if (!cancelled) setData({ meta, res })
            })
            .catch(() => {
                if (!cancelled) setFailed(true)
            })
        return () => {
            cancelled = true
        }
    }, [base])

    const meta = data?.meta
    const res = data?.res
    const want = bandId ?? res?.default_band
    const band = meta?.bands.find((b) => b.id === want) ?? meta?.bands[0]
    const nFrames = band?.frames.length ?? 0

    useEffect(() => {
        if (!playing || nFrames < 2) return
        const id = window.setInterval(() => setPos((p) => (p + 1) % nFrames), ms)
        return () => window.clearInterval(id)
    }, [playing, ms, nFrames])

    if (failed) return <p className="note">Could not load the data for this target.</p>
    if (!meta || !res || !band) return <p className="note">Loading…</p>

    const epoch = band.frames[pos % nFrames].epoch
    const compare = (res.compare_bands ?? [])
        .map((id) => meta.bands.find((b) => b.id === id))
        .filter((b): b is Band => Boolean(b))

    return (
        <div className="target">
            <h2>{meta.name}</h2>

            <div className="views">
                <StackPanel
                    base={base}
                    meta={meta}
                    band={band}
                    epoch={epoch}
                    title={`Stacked per epoch: ${band.label}`}
                    marker={marker}
                    arrow={res.fit?.arrow}
                />
                <RawView
                    base={base}
                    scaleArcsec={meta.grid.scale_arcsec}
                    playing={playing}
                    marker={marker}
                    dets={band.dets}
                    predicted={meta.epochs.map((e) => e.predicted)}
                />
            </div>
            <FlickerNote r={res} />

            <div className="controls">
                <div className="group">
                    <h4>Epoch</h4>
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
                </div>
                <div className="group">
                    <h4>Speed</h4>
                    <div className="row">
                        {SPEEDS.map((s) => (
                            <button key={s.ms} className={s.ms === ms ? 'on' : ''} onClick={() => setMs(s.ms)}>
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="group">
                    <h4>Detector</h4>
                    <div className="row">
                        {meta.bands.map((b) => (
                            <button
                                key={b.id}
                                className={b.id === band.id ? 'on' : ''}
                                title={b.label}
                                onClick={() => {
                                    setBandId(b.id)
                                    setPos(0)
                                }}
                            >
                                {bandName(b.id)}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="group">
                    <h4>Overlay</h4>
                    <label className="check">
                        <input type="checkbox" checked={marker} onChange={(e) => setMarker(e.target.checked)} />
                        Catalogue position (SIMBAD position + proper motion)
                    </label>
                </div>
            </div>

            {compare.length === 2 && (
                <section className="compare">
                    <h3>Short versus long wavelength</h3>
                    <p className="detail">
                        The same epoch in two stacks. Each band has its own brightness scale; the amber marker is the
                        catalogue position.
                    </p>
                    <div className="views">
                        {compare.map((b) => (
                            <StackPanel key={b.id} base={base} meta={meta} band={b} epoch={epoch} title={b.label} marker={marker} />
                        ))}
                    </div>
                </section>
            )}

            <ResultsPanel r={res} />
        </div>
    )
}