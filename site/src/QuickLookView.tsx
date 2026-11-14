import { useEffect, useRef, useState } from 'react'
import SkyPanel from './SkyPanel'
import {
    clippedMean,
    pickBalanced,
    readCutout,
    resample,
    sceneScale,
    splitEpochs,
    toRgba,
    worldToGrid,
    type Counter,
    type Exposure,
    type Grid
} from './quicklook'
import type { XY } from './types'

// Quick look at any position: exposure list from /api/lookup, image rows read by the
// browser from the public cloud copy, stacked per epoch here. Nothing is masked and
// nothing is measured.

export type Query = { target: string } | { ra: number; dec: number }

type SimbadTarget = {
    name: string
    ra_deg: number
    dec_deg: number
    pmra_masyr: number | null
    pmdec_masyr: number | null
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
}

type Stats = { listed: number; read: number; failed: number; offDetector: number; requests: number; bytes: number; seconds: number }
type Scene = { epochs: EpochView[]; stats: Stats }
type Progress = { done: number; total: number; bytes: number }

const day = (mjd: number) => new Date((mjd - 40587) * 86400000).toISOString().slice(0, 10)

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
    const frames: Float32Array[][] = epochs.map(() => [])
    let next = 0
    let done = 0
    let failed = 0
    let offDetector = 0
    const worker = async () => {
        while (next < jobs.length) {
            const job = jobs[next++]
            try {
                const cut = await readCutout(job.e.key, ra0, dec0, HALF, counter, signal)
                if (cut) frames[job.k].push(resample(cut, grid))
                else offDetector++
            } catch (err) {
                if (signal.aborted) throw err
                failed++
            }
            done++
            onProgress({ done, total: jobs.length, bytes: counter.bytes })
        }
    }
    await Promise.all(Array.from({ length: PARALLEL }, worker))
    const stacks = frames.map((f) => (f.length ? clippedMean(f).stack : null))
    const scale = sceneScale(stacks.filter((s): s is Float32Array => s !== null))
    const views: EpochView[] = epochs.map((ep, k) => {
        const mid = ep.reduce((s, e) => s + e.mjd, 0) / ep.length
        const [ra, dec] = positionAt(l, mid)
        const [x, y] = worldToGrid(grid, ra, dec)
        const stack = stacks[k]
        return {
            index: k,
            tStart: day(ep[0].mjd),
            tEnd: day(ep[ep.length - 1].mjd),
            nInBand: ep.filter((e) => band.dets.includes(e.detector)).length,
            nUsed: frames[k].length,
            rgba: stack ? toRgba(stack, scale) : null,
            marker: { x, y }
        }
    })
    const read = frames.reduce((s, f) => s + f.length, 0)
    const stats: Stats = {
        listed: exposures.length,
        read,
        failed,
        offDetector,
        requests: counter.requests,
        bytes: counter.bytes,
        seconds: (performance.now() - t0) / 1000
    }
    return { epochs: views, stats }
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
            stacked in your browser. Flagged pixels are not removed and nothing is measured on these images.
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
        </div>
    )
}