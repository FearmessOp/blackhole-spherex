import { useEffect, useState } from 'react'
import RawView from './RawView'
import ResultsPanel, { FlickerNote, NeighbourNote } from './ResultsPanel'
import SkyPanel from './SkyPanel'
import type { Arrow, Band, Diff, Meta, Results, XY } from './types'

const SPEEDS = [
    { label: 'Slow', ms: 1200 },
    { label: 'Normal', ms: 600 },
    { label: 'Fast', ms: 250 }]

const bandName = (id: string) =>
    id === 'all' ? 'All' : id === 'd123' ? 'D1–3' : id === 'd56' ? 'D5+6' : id.toUpperCase()

const pct = (v: number | null) => (v === null ? 'n/a' : `${(100 * v).toFixed(0)}%`)

type StackProps = {
    base: string
    meta: Meta
    band: Band
    epoch: number
    title: string
    marker: boolean
    markerLabel?: string
    neighbour?: XY | null
    neighbourLabel?: string
    arrow?: Arrow | null
}

// One band at one epoch. All frames of the band stay loaded so that blinking does not flash.
function StackPanel({ base, meta, band, epoch, title, marker, markerLabel, neighbour, neighbourLabel, arrow }: StackProps) {
    const frame = band.frames.find((f) => f.epoch === epoch)
    const ep = meta.epochs[epoch]
    return (
        <SkyPanel
            title={title}
            n={meta.grid.npix}
            scaleArcsec={meta.grid.scale_arcsec}
            marker={marker ? ep.predicted : null}
            markerLabel={markerLabel}
            neighbour={neighbour}
            neighbourLabel={neighbourLabel}
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
    const [data, setData] = useState<{ meta: Meta; res: Results; diff: Diff | null } | null>(null)
    const [failed, setFailed] = useState(false)
    const [bandId, setBandId] = useState<string | null>(null)
    const [view, setView] = useState<'blink' | 'diff'>('blink')
    const [pos, setPos] = useState(0)
    const [playing, setPlaying] = useState(true)
    const [ms, setMs] = useState(600)
    const [marker, setMarker] = useState(true)

    useEffect(() => {
        let cancelled = false
        const get = (name: string) =>
            fetch(base + name).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        // Only some targets have a difference image; a missing file is not an error.
        const getOptional = (name: string) =>
            fetch(base + name)
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null)
        Promise.all([get('meta.json'), get('results.json'), getOptional('diff.json')])
            .then(([meta, res, diff]) => {
                if (!cancelled) setData({ meta, res, diff: diff && Array.isArray(diff.bands) ? diff : null })
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
    const diff = data?.diff ?? null
    // Offered only where the check found the target's bright-dark pair distinct (logs/diff_image_<slug>.log).
    const diffBand = diff?.bands.find((b) => b.id === band.id && b.distinct) ?? null
    const showDiff = view === 'diff' && diff !== null && diffBand !== null
    const compare = (res.compare_bands ?? [])
        .map((id) => meta.bands.find((b) => b.id === id))
        .filter((b): b is Band => Boolean(b))
    const neighbour = res.stack_motion?.neighbour ?? null
    const neighbourXY = neighbour?.xy?.[epoch] ?? null

    return (
        <div className="target">
            <h2>{meta.name}</h2>

            <div className="views">
                {showDiff && diff && diffBand ? (
                    <SkyPanel
                        title={`Difference: epoch ${diff.to_epoch + 1} minus epoch ${diff.from_epoch + 1}, ${band.label}`}
                        n={meta.grid.npix}
                        scaleArcsec={meta.grid.scale_arcsec}
                        marker={marker ? meta.epochs[diff.to_epoch].predicted : null}
                        caption={diff.label}
                        detail={
                            <>
                                Detectors {diffBand.dets_used.join(', ')} (those with exposures in both epochs),{' '}
                                {diffBand.n_first} and {diffBand.n_last} exposures. Linear scale, zero is mid grey, ±
                                {diffBand.vmax.toPrecision(3)} MJy/sr. Check: {diffBand.n_stars} constant field stars leave{' '}
                                {pct(diffBand.star_ratio_median)} (median) and {pct(diffBand.star_ratio_p90)} (90th
                                percentile) of their own peak in this image; the bright and the dark side of the target
                                are {pct(diffBand.lobe_bright_ratio)} and {pct(diffBand.lobe_dark_ratio)} of its peak.
                                The amber marker is the catalogue position in the last epoch.
                            </>
                        }
                    >
                        <img src={base + diffBand.png} alt="" />
                    </SkyPanel>
                ) : (
                    <StackPanel
                        base={base}
                        meta={meta}
                        band={band}
                        epoch={epoch}
                        title={`Stacked per epoch: ${band.label}`}
                        marker={marker}
                        arrow={res.fit?.arrow}
                    />
                )}
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
                    <h4>Playback</h4>
                    <div className="row">
                        <button className="play" onClick={() => setPlaying(!playing)}>
                            {playing ? 'Pause' : 'Play'}
                        </button>
                    </div>
                </div>
                {diff && (
                    <div className="group">
                        <h4>View</h4>
                        <div className="row">
                            <button className={showDiff ? '' : 'on'} onClick={() => setView('blink')}>
                                Blink epochs
                            </button>
                            <button
                                className={showDiff ? 'on' : ''}
                                disabled={!diffBand}
                                title={
                                    diffBand
                                        ? 'Last epoch minus first epoch'
                                        : 'No usable difference image for this detector selection'
                                }
                                onClick={() => setView('diff')}
                            >
                                Difference
                            </button>
                        </div>
                    </div>
                )}
                <div className="group">
                    <h4>Epoch</h4>
                    <div className="row">
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
                        catalogue position of the target.
                    </p>
                    <div className="views">
                        {compare.map((b) => (
                            <StackPanel
                                key={b.id}
                                base={base}
                                meta={meta}
                                band={b}
                                epoch={epoch}
                                title={b.label}
                                marker={marker}
                                markerLabel="target, catalogue position"
                                neighbour={marker ? neighbourXY : null}
                                neighbourLabel="Gaia neighbour, not the target"
                            />
                        ))}
                    </div>
                    {neighbour && <NeighbourNote nb={neighbour} />}
                </section>
            )}

            <ResultsPanel r={res} />
        </div>
    )
}