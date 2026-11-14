import { useEffect, useRef, useState } from 'react'
import SkyPanel from './SkyPanel'
import {
    SCALE_ARCSEC,
    clippedMean,
    diffRgba,
    diffStack,
    measureEpoch,
    motionBetween,
    pickBalanced,
    predictPosition,
    readFrames,
    sceneScale,
    splitEpochs,
    toRgba,
    worldToGrid,
    type Catalogue,
    type Counter,
    type Exposure,
    type Grid,
    type Motion,
    type StackPosition
} from './quicklook'
import type { XY } from './types'

// Quick look at any position: exposure list from /api/lookup, image rows read by the
// browser from the public cloud copy, stacked per epoch here. Nothing is masked. The only
// numbers taken from these images are rough motions between epochs (compared with the
// full pipeline in scripts/test_motion.mjs, logs/test_motion.log).

export type Query = { target: string } | { ra: number; dec: number }

type SimbadTarget = {
    name: string
    ra_deg: number
    dec_deg: number
    pmra_masyr: number | null
    pmdec_masyr: number | null
    plx_mas: number | null
    sp_type: string | null
    source: string
}

type Lookup = {
    ok: boolean
    error?: string
    target: SimbadTarget | null
    pos: { ra_deg: number; dec_deg: number }
    collections: { id: string; ok: boolean; rows: number }[]
    // mjd_mid, detector, collection_index, cloud_key, em_min_um, em_max_um
    exposures: [number, number, number, string, number, number][]
}

type Band = { id: string; name: string; label: string; dets: number[]; total: number }

const API = `${import.meta.env.BASE_URL}api/lookup`
const NPIX = 19 // display grid; its corners lie 12.7 px from the centre
const HALF = 14 // rows read on each side of the centre: 29 rows cover the grid at any rotation
const PARALLEL = 6
const D2R = Math.PI / 180

// `total` exposures are read per epoch, shared equally between the detectors of the selection.
const BANDS: Band[] = [
    { id: 'all', name: 'All', label: 'All detectors', dets: [1, 2, 3, 4, 5, 6], total: 6 },
    { id: 'd123', name: 'D1–3', label: 'Detectors 1-3 (short wavelength)', dets: [1, 2, 3], total: 6 },
    { id: 'd56', name: 'D5+6', label: 'Detectors 5+6 (long wavelength)', dets: [5, 6], total: 8 }
]

const SPEEDS = [
    { label: 'Slow', ms: 1200 },
    { label: 'Normal', ms: 600 },
    { label: 'Fast', ms: 250 }
]

const ERRORS: Record<string, string> = {
    name_not_found: 'SIMBAD does not know this name. Check the spelling, or enter RA and Dec in degrees.',
    simbad_unreachable: 'SIMBAD could not be reached, so the name was not resolved. Try again, or enter RA and Dec in degrees.',
    archive_unreachable: 'The IRSA archive did not return the exposure list. Try again in a moment.',
    bad_request: 'Enter a star name, or RA and Dec in degrees (RA 0 to 360, Dec -90 to +90).',
    no_answer: 'The lookup service did not answer. Try again in a moment.'
}

type EpochView = {
    index: number
    tStart: string
    tEnd: string
    nInBand: number // exposures of the detector selection in this epoch
    nUsed: number // exposures read and stacked
    rgba: Uint8ClampedArray | null
    marker: XY
    measured: StackPosition | null // rough position on this stack
    predicted: { east: number; north: number } | null // catalogue position, arcsec from the grid centre
}

// Motion between two epochs: catalogue prediction (if there is a catalogue entry) and rough measurement.
type MotionRow = { from: number; to: number; predicted: { east: number; north: number } | null; motion: Motion | null }
type Stats = { listed: number; read: number; failed: number; offDetector: number; requests: number; bytes: number; seconds: number }
// Last epoch with frames minus first epoch with frames, from the detectors read in both.
type SceneDiff = { from: number; to: number; rgba: Uint8ClampedArray; vmax: number; dets: number[]; nFirst: number; nLast: number }
type Scene = { epochs: EpochView[]; stats: Stats; motions: MotionRow[]; diff: SceneDiff | null }
type Progress = { done: number; total: number; bytes: number }

const day = (mjd: number) => new Date((mjd - 40587) * 86400000).toISOString().slice(0, 10)
const signed = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2)

// SIMBAD J2000 position moved with the SIMBAD proper motion (no parallax). A position
// that was entered as coordinates stays where it is.
function positionAt(l: Lookup, mjd: number): [number, number] {
    const t = l.target
    if (!t) return [l.pos.ra_deg, l.pos.dec_deg]
    const dt = (mjd - 51544.5) / 365.25
    const ra = t.ra_deg + ((t.pmra_masyr ?? 0) * dt) / 3.6e6 / Math.cos(t.dec_deg * D2R)
    return [((ra % 360) + 360) % 360, t.dec_deg + ((t.pmdec_masyr ?? 0) * dt) / 3.6e6]
}

// Reads the selected exposures and stacks them per epoch on one fixed grid, centred on
// the position at the mean time of all exposures. All epochs share one brightness scale.
async function buildScene(l: Lookup, band: Band, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<Scene> {
    const t0 = performance.now()
    const exposures: Exposure[] = l.exposures.map((e) => ({ mjd: e[0], detector: e[1], collection: e[2], key: e[3] }))
    const epochs = splitEpochs(exposures)
    const mean = exposures.reduce((s, e) => s + e.mjd, 0) / exposures.length
    const [ra0, dec0] = positionAt(l, mean)
    const grid: Grid = { ra0, dec0, npix: NPIX }
    const counter: Counter = { requests: 0, bytes: 0 }
    const jobs = epochs.flatMap((ep, k) => pickBalanced(ep, band.dets, band.total).map((e) => ({ k, e })))
    const set = await readFrames(
        jobs,
        epochs.length,
        ra0,
        dec0,
        grid,
        HALF,
        PARALLEL,
        counter,
        (done, total) => onProgress({ done, total, bytes: counter.bytes }),
        signal
    )
    const frames = set.frames
    const stacks = frames.map((f) => (f.length ? clippedMean(f).stack : null))
    const scale = sceneScale(stacks.filter((s): s is Float32Array => s !== null))
    const t = l.target
    const cat: Catalogue | null = t
        ? { ra: t.ra_deg, dec: t.dec_deg, pmra: t.pmra_masyr ?? 0, pmdec: t.pmdec_masyr ?? 0, plx: t.plx_mas ?? 0 }
        : null
    const c = (NPIX - 1) / 2
    const views: EpochView[] = epochs.map((ep, k) => {
        const mid = ep.reduce((s, e) => s + e.mjd, 0) / ep.length
        const [ra, dec] = positionAt(l, mid)
        const [x, y] = worldToGrid(grid, ra, dec)
        const stack = stacks[k]
        // Rough position: looked for near the catalogue position (proper motion + parallax)
        // at the mean date of the exposures that were read, or near the entered position.
        let measured: StackPosition | null = null
        let predicted: { east: number; north: number } | null = null
        const mjds = set.mjd[k]
        if (mjds.length) {
            const when = mjds.reduce((s, v) => s + v, 0) / mjds.length
            const [pra, pdec] = cat ? predictPosition(cat, when) : [l.pos.ra_deg, l.pos.dec_deg]
            const [px, py] = worldToGrid(grid, pra, pdec)
            if (cat) predicted = { east: (c - px) * SCALE_ARCSEC, north: (c - py) * SCALE_ARCSEC }
            measured = measureEpoch(frames[k], NPIX, px, py, k + 1)
        }
        return {
            index: k,
            tStart: day(ep[0].mjd),
            tEnd: day(ep[ep.length - 1].mjd),
            nInBand: ep.filter((e) => band.dets.includes(e.detector)).length,
            nUsed: frames[k].length,
            rgba: stack ? toRgba(stack, scale) : null,
            marker: { x, y },
            measured,
            predicted
        }
    })
    const motions: MotionRow[] = []
    for (let a = 0; a < views.length; a++) {
        for (let b = a + 1; b < views.length; b++) {
            const A = views[a]
            const B = views[b]
            if (!A.rgba || !B.rgba) continue
            motions.push({
                from: a,
                to: b,
                predicted:
                    A.predicted && B.predicted
                        ? { east: B.predicted.east - A.predicted.east, north: B.predicted.north - A.predicted.north }
                        : null,
                motion: A.measured && B.measured ? motionBetween(A.measured, B.measured) : null
            })
        }
    }
    let diff: SceneDiff | null = null
    const withFrames = frames.map((f, k) => (f.length ? k : -1)).filter((k) => k >= 0)
    if (withFrames.length >= 2) {
        const a = withFrames[0]
        const b = withFrames[withFrames.length - 1]
        const d = diffStack(frames[a], set.det[a], frames[b], set.det[b])
        if (d) {
            const { rgba, vmax } = diffRgba(d.diff)
            diff = { from: a, to: b, rgba, vmax, dets: d.dets, nFirst: d.nFirst, nLast: d.nLast }
        }
    }
    const stats: Stats = {
        listed: exposures.length,
        read: frames.reduce((s, f) => s + f.length, 0),
        failed: set.failed,
        offDetector: set.offDetector,
        requests: counter.requests,
        bytes: counter.bytes,
        seconds: (performance.now() - t0) / 1000
    }
    return { epochs: views, stats, motions, diff }
}

// One stacked epoch, drawn pixel for pixel; all epochs stay mounted so that blinking does not flash.
function EpochCanvas({ rgba, visible }: { rgba: Uint8ClampedArray; visible: boolean }) {
    const ref = useRef<HTMLCanvasElement>(null)
    useEffect(() => {
        const ctx = ref.current?.getContext('2d')
        if (!ctx) return
        const img = ctx.createImageData(NPIX, NPIX)
        img.data.set(rgba)
        ctx.putImageData(img, 0, 0)
    }, [rgba])
    return <canvas ref={ref} width={NPIX} height={NPIX} style={{ visibility: visible ? 'visible' : 'hidden' }} />
}

type LookupState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: Lookup }

export default function QuickLookView({ query }: { query: Query }) {
    const queryString = 'target' in query ? `target=${encodeURIComponent(query.target)}` : `ra=${query.ra}&dec=${query.dec}`
    const [lookup, setLookup] = useState<LookupState>({ status: 'loading' })
    const [bandId, setBandId] = useState<string | null>(null)
    const [scene, setScene] = useState<Scene | null>(null)
    const [progress, setProgress] = useState<Progress | null>(null)
    const [sceneError, setSceneError] = useState<string | null>(null)
    const [pos, setPos] = useState(0)
    const [playing, setPlaying] = useState(true)
    const [ms, setMs] = useState(600)
    const [marker, setMarker] = useState(true)
    const [view, setView] = useState<'blink' | 'diff'>('blink')

    // 1. name -> position, and the exposure list
    useEffect(() => {
        const ctl = new AbortController()
        setLookup({ status: 'loading' })
        fetch(`${API}?${queryString}`, { signal: ctl.signal })
            .then(async (r) => {
                let body: Lookup | null = null
                try {
                    body = (await r.json()) as Lookup
                } catch {
                    body = null // not JSON: the function is not there (local preview) or timed out
                }
                if (!body || typeof body.ok !== 'boolean') return setLookup({ status: 'error', message: ERRORS.no_answer })
                if (!body.ok) return setLookup({ status: 'error', message: ERRORS[body.error ?? ''] ?? ERRORS.no_answer })
                if (!body.exposures.length) {
                    return setLookup({
                        status: 'error',
                        message: 'The public SPHEREx releases at IRSA hold no exposure of this position.'
                    })
                }
                setLookup({ status: 'ready', data: body })
            })
            .catch(() => {
                if (!ctl.signal.aborted) setLookup({ status: 'error', message: ERRORS.no_answer })
            })
        return () => ctl.abort()
    }, [queryString])

    const data = lookup.status === 'ready' ? lookup.data : null
    // A Y dwarf is only seen at long wavelength: start with detectors 5+6 there.
    const defaultBand = data?.target?.sp_type?.startsWith('Y') ? 'd56' : 'all'
    const band = BANDS.find((b) => b.id === (bandId ?? defaultBand)) ?? BANDS[0]

    // 2. image rows from the cloud copy, stacked per epoch
    useEffect(() => {
        if (!data) return
        const ctl = new AbortController()
        setScene(null)
        setSceneError(null)
        setProgress({ done: 0, total: 0, bytes: 0 })
        setPos(0)
        buildScene(data, band, setProgress, ctl.signal)
            .then((s) => {
                if (ctl.signal.aborted) return
                if (s.stats.read === 0) setSceneError('None of the selected exposures could be read from the cloud copy of the archive.')
                else setScene(s)
            })
            .catch((e) => {
                if (!ctl.signal.aborted) setSceneError(`Reading the images failed: ${e instanceof Error ? e.message : e}`)
            })
        return () => ctl.abort()
    }, [data, band])

    const shown = scene ? scene.epochs.filter((e) => e.rgba) : []
    const count = shown.length
    useEffect(() => {
        if (!playing || count < 2) return
        const id = window.setInterval(() => setPos((p) => (p + 1) % count), ms)
        return () => window.clearInterval(id)
    }, [playing, ms, count])

    const title = 'target' in query ? (data?.target?.name ?? query.target) : `RA ${query.ra.toFixed(5)}°, Dec ${query.dec.toFixed(5)}°`
    const banner = (
        <p className="quick-banner">
            <b>Quick look, unmasked, no measurement.</b> A few exposures per epoch are read straight from the archive and
            stacked in your browser. Flagged pixels are not removed. The only numbers taken from these images are the
            rough motions listed below the image; they are not a measurement of the full data.
        </p>
    )

    if (lookup.status === 'loading') {
        return (
            <div className="target">
                <h2>{title}</h2>
                {banner}
                <p className="note">Looking up the position and the list of SPHEREx exposures… this can take up to a minute.</p>
            </div>
        )
    }
    if (lookup.status === 'error') {
        return (
            <div className="target">
                <h2>{title}</h2>
                <p className="warn">{lookup.message}</p>
            </div>
        )
    }

    const cur = count ? shown[pos % count] : null
    const st = scene?.stats
    const dif = scene?.diff ?? null
    const showDiff = view === 'diff' && dif !== null
    const partial = lookup.data.collections.filter((c) => !c.ok).map((c) => c.id)
    return (
        <div className="target">
            <h2>{title}</h2>
            {banner}
            {partial.length > 0 && (
                <p className="warn">The archive did not answer for {partial.join(', ')}; the exposure list is incomplete.</p>
            )}
            {sceneError && <p className="warn">{sceneError}</p>}
            {!scene && !sceneError && progress && (
                <div className="quick-progress">
                    <progress value={progress.done} max={Math.max(1, progress.total)} />
                    <span>
                        Reading exposure {progress.done} of {progress.total || '…'} ({(progress.bytes / 1e6).toFixed(1)} MB)
                    </span>
                </div>
            )}
            {scene && cur && (
                <div className="views">
                    {showDiff && dif ? (
                        <SkyPanel
                            title={`Difference: epoch ${dif.to + 1} minus epoch ${dif.from + 1}, ${band.label}`}
                            n={NPIX}
                            scaleArcsec={6.15}
                            marker={marker ? scene.epochs[dif.to].marker : null}
                            caption="bright = where it is now, dark = where it was"
                            detail={`Detectors ${dif.dets.join(', ')} (those read in both epochs), ${dif.nFirst} and ${dif.nLast} exposures. Linear scale, zero is mid grey, ±${dif.vmax.toPrecision(3)} MJy/sr. Unmasked and made from a few exposures: bad pixels and brightness changes of constant stars also show up, and this image was not checked against field stars.`}
                        >
                            <EpochCanvas rgba={dif.rgba} visible />
                        </SkyPanel>
                    ) : (
                        <SkyPanel
                            title={`Stacked per epoch: ${band.label}`}
                            n={NPIX}
                            scaleArcsec={6.15}
                            marker={marker ? cur.marker : null}
                            caption={`Epoch ${cur.index + 1} of ${scene.epochs.length}: ${cur.tStart} to ${cur.tEnd}`}
                            detail={`${cur.nUsed} of ${cur.nInBand} exposures of this epoch read and stacked`}
                        >
                            {shown.map((e) => (
                                <EpochCanvas key={e.index} rgba={e.rgba!} visible={e === cur} />
                            ))}
                        </SkyPanel>
                    )}
                    <div className="quick-side">
                        {st && (
                            <p className="detail">
                                {st.listed} exposures listed in {scene.epochs.length} epochs; {st.read} read in{' '}
                                {st.seconds.toFixed(1)} s ({(st.bytes / 1e6).toFixed(1)} MB in {st.requests} requests)
                                {st.failed > 0 && <>; {st.failed} could not be read</>}
                                {st.offDetector > 0 && <>; {st.offDetector} do not contain the position</>}.
                            </p>
                        )}
                        <p className="detail">
                            The grid is fixed on the sky (north up, east left) and all epochs share one brightness scale.
                            {data?.target
                                ? ` The amber marker is the catalogue position moved with the catalogue proper motion; both are from ${data.target.source}.`
                                : ' The amber marker is the position that was entered.'}
                        </p>
                    </div>
                </div>
            )}
            <div className="controls">
                <div className="group">
                    <h4>Playback</h4>
                    <div className="row">
                        <button className="play" onClick={() => setPlaying(!playing)}>
                            {playing ? 'Pause' : 'Play'}
                        </button>
                    </div>
                </div>
                {scene && count >= 2 && (
                    <div className="group">
                        <h4>View</h4>
                        <div className="row">
                            <button className={showDiff ? '' : 'on'} onClick={() => setView('blink')}>
                                Blink epochs
                            </button>
                            <button
                                className={showDiff ? 'on' : ''}
                                disabled={!dif}
                                title={dif ? 'Last epoch minus first epoch' : 'No detector was read in both the first and the last epoch'}
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
                        {shown.map((e, i) => (
                            <button
                                key={e.index}
                                className={count && i === pos % count ? 'on' : ''}
                                onClick={() => {
                                    setPlaying(false)
                                    setPos(i)
                                }}
                            >
                                {e.index + 1}
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
                        {BANDS.map((b) => (
                            <button key={b.id} className={b.id === band.id ? 'on' : ''} title={b.label} onClick={() => setBandId(b.id)}>
                                {b.name}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="group">
                    <h4>Overlay</h4>
                    <label className="check">
                        <input type="checkbox" checked={marker} onChange={(e) => setMarker(e.target.checked)} />
                        {data?.target ? 'Catalogue position (SIMBAD position + proper motion)' : 'Entered position'}
                    </label>
                </div>
            </div>
            {scene && scene.motions.length > 0 && (
                <section className="results">
                    <h3>Rough motion between epochs</h3>
                    <table className="motion">
                        <thead>
                            <tr>
                                <th>Motion (east / north, arcsec)</th>
                                {data?.target && <th>Catalogue prediction</th>}
                                <th>Rough measurement</th>
                            </tr>
                        </thead>
                        <tbody>
                            {scene.motions.map((r) => (
                                <tr key={`${r.from}-${r.to}`}>
                                    <td>
                                        Epoch {r.from + 1} → {r.to + 1}
                                    </td>
                                    {data?.target && (
                                        <td data-label="Catalogue prediction">
                                            {r.predicted ? (
                                                <span className="pair">
                                                    {signed(r.predicted.east)} / {signed(r.predicted.north)}
                                                </span>
                                            ) : (
                                                'not available'
                                            )}
                                        </td>
                                    )}
                                    <td data-label="Rough measurement">
                                        {!r.motion ? (
                                            'not measured'
                                        ) : !r.motion.measurable ? (
                                            'too slow to measure with this data'
                                        ) : (
                                            <span className="pair">
                                                {signed(r.motion.east)} ± {r.motion.eastErr.toFixed(2)} / {signed(r.motion.north)} ±{' '}
                                                {r.motion.northErr.toFixed(2)}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="detail">
                        Rough: windowed centroid on the stacks shown above (a few unmasked exposures per epoch), looked for
                        within 1.5 pixels of the{' '}
                        {data?.target ? 'catalogue position (proper motion and parallax)' : 'entered position'}. Errors are
                        a bootstrap over the exposures; nothing is aligned to field stars. A number is only given when the
                        motion is larger than its error; otherwise the line reads “too slow to measure with this data”,
                        which also covers a source that is too faint in these few exposures. “Not measured” means that no
                        source was found at that place in one of the two epochs.
                    </p>
                </section>
            )}
        </div>
    )
}