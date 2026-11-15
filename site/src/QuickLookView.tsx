import { useEffect, useRef, useState } from 'react'
import { HelpTitle } from './Help'
import SkyPanel from './SkyPanel'
import { bandLabel, t, useLang, type Key } from './i18n'
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
    k_mag?: number | null
    source: string
}

// Brighter than this in K, a star is probably saturated in SPHEREx and the rough motion is not
// given: prepared targets with K < 7.1 are saturated in 91-98% of exposures, those with
// K 9.1-11.9 in 0-23% except one next to a bright companion (logs/k_saturation.log).
const K_SATURATED = 8.0

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

const SPEEDS: { key: Key; ms: number }[] = [
    { key: 'speed.slow', ms: 1200 },
    { key: 'speed.normal', ms: 600 },
    { key: 'speed.fast', ms: 250 }
]

// Error codes of /api/lookup -> dictionary keys, so that the message follows the chosen language.
const ERRORS: Record<string, Key> = {
    name_not_found: 'quick.err.name_not_found',
    simbad_unreachable: 'quick.err.simbad_unreachable',
    archive_unreachable: 'quick.err.archive_unreachable',
    bad_request: 'quick.err.bad_request',
    no_answer: 'quick.err.no_answer'
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

type LookupState = { status: 'loading' } | { status: 'error'; key: Key } | { status: 'ready'; data: Lookup }

export default function QuickLookView({ query }: { query: Query }) {
    useLang()
    const queryString = 'target' in query ? `target=${encodeURIComponent(query.target)}` : `ra=${query.ra}&dec=${query.dec}`
    const [lookup, setLookup] = useState<LookupState>({ status: 'loading' })
    const [bandId, setBandId] = useState<string | null>(null)
    const [scene, setScene] = useState<Scene | null>(null)
    const [progress, setProgress] = useState<Progress | null>(null)
    const [sceneError, setSceneError] = useState<{ key: Key; msg?: string } | null>(null)
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
                if (!body || typeof body.ok !== 'boolean') return setLookup({ status: 'error', key: ERRORS.no_answer })
                if (!body.ok) return setLookup({ status: 'error', key: ERRORS[body.error ?? ''] ?? ERRORS.no_answer })
                if (!body.exposures.length) return setLookup({ status: 'error', key: 'quick.err.no_exposures' })
                setLookup({ status: 'ready', data: body })
            })
            .catch(() => {
                if (!ctl.signal.aborted) setLookup({ status: 'error', key: ERRORS.no_answer })
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
                if (s.stats.read === 0) setSceneError({ key: 'quick.err.none_read' })
                else setScene(s)
            })
            .catch((e) => {
                if (!ctl.signal.aborted) setSceneError({ key: 'quick.err.read_failed', msg: e instanceof Error ? e.message : String(e) })
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

    const title =
        'target' in query
            ? (data?.target?.name ?? query.target)
            : t('quick.title.pos', { ra: query.ra.toFixed(5), dec: query.dec.toFixed(5) })
    const heading = (
        <div className="target-head">
            <HelpTitle as="h2" help="help.quick">
                {title}
            </HelpTitle>
        </div>
    )
    const banner = (
        <p className="quick-banner">
            <b>{t('quick.banner.bold')}</b> {t('quick.banner')}
        </p>
    )

    if (lookup.status === 'loading') {
        return (
            <div className="target">
                {heading}
                {banner}
                <p className="note">{t('quick.lookup')}</p>
            </div>
        )
    }
    if (lookup.status === 'error') {
        return (
            <div className="target">
                {heading}
                <p className="warn">{t(lookup.key)}</p>
            </div>
        )
    }

    const cur = count ? shown[pos % count] : null
    const st = scene?.stats
    const dif = scene?.diff ?? null
    const showDiff = view === 'diff' && dif !== null
    const partial = lookup.data.collections.filter((c) => !c.ok).map((c) => c.id)
    // Rough motion table: in the side column next to the image, under the notes.
    const kMag = data?.target?.k_mag ?? null
    const tooBright = kMag !== null && kMag < K_SATURATED
    const motionTable =
        scene && scene.motions.length > 0 && tooBright ? (
            <section className="results">
                <h3>{t('quick.motion.title')}</h3>
                <p className="warn">{t('quick.motion.sat', { k: kMag.toFixed(2), lim: K_SATURATED.toFixed(1) })}</p>
            </section>
        ) : scene && scene.motions.length > 0 ? (
            <section className="results">
                <h3>{t('quick.motion.title')}</h3>
                <table className="motion">
                    <thead>
                        <tr>
                            <th>{t('quick.motion.head')}</th>
                            {data?.target && <th>{t('quick.motion.pred')}</th>}
                            <th>{t('quick.motion.meas')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {scene.motions.map((r) => (
                            <tr key={`${r.from}-${r.to}`}>
                                <td data-unit={t('quick.motion.unit')}>
                                    {t('quick.motion.pair', { a: r.from + 1, b: r.to + 1 })}
                                </td>
                                {data?.target && (
                                    <td data-label={t('quick.motion.pred')}>
                                        {r.predicted ? (
                                            <span className="pair">
                                                {signed(r.predicted.east)} / {signed(r.predicted.north)}
                                            </span>
                                        ) : (
                                            t('quick.motion.na')
                                        )}
                                    </td>
                                )}
                                <td data-label={t('quick.motion.meas')}>
                                    {!r.motion ? (
                                        t('quick.motion.none')
                                    ) : !r.motion.measurable ? (
                                        t('quick.motion.slow')
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
                    {t('quick.motion.note', {
                        where: t(data?.target ? 'quick.motion.where.cat' : 'quick.motion.where.entered')
                    })}
                </p>
            </section>
        ) : null
    return (
        <div className="target">
            {heading}
            {!(scene && cur) && banner}
            {partial.length > 0 && <p className="warn">{t('quick.partial', { ids: partial.join(', ') })}</p>}
            {sceneError && (
                <p className="warn">{t(sceneError.key, sceneError.msg ? { msg: sceneError.msg } : undefined)}</p>
            )}
            {!scene && !sceneError && progress && (
                <div className="quick-progress">
                    <progress value={progress.done} max={Math.max(1, progress.total)} />
                    <span>
                        {t('quick.progress', {
                            done: progress.done,
                            total: progress.total || '…',
                            mb: (progress.bytes / 1e6).toFixed(1)
                        })}
                    </span>
                </div>
            )}
            {scene && cur && (
                <div className="views">
                    {showDiff && dif ? (
                        <SkyPanel
                            title={t('panel.diff', { b: dif.to + 1, a: dif.from + 1, band: bandLabel(band) })}
                            help="help.diff"
                            n={NPIX}
                            scaleArcsec={6.15}
                            marker={marker ? scene.epochs[dif.to].marker : null}
                            caption={t('diff.caption')}
                            detail={t('quick.diff.detail', {
                                dets: dif.dets.join(', '),
                                n1: dif.nFirst,
                                n2: dif.nLast,
                                vmax: dif.vmax.toPrecision(3)
                            })}
                        >
                            <EpochCanvas rgba={dif.rgba} visible />
                        </SkyPanel>
                    ) : (
                        <SkyPanel
                            title={t('panel.stack', { band: bandLabel(band) })}
                            help="help.stack"
                            n={NPIX}
                            scaleArcsec={6.15}
                            marker={marker ? cur.marker : null}
                            caption={t('panel.epoch', {
                                i: cur.index + 1,
                                n: scene.epochs.length,
                                from: cur.tStart,
                                to: cur.tEnd
                            })}
                            detail={t('quick.stack.detail', { a: cur.nUsed, b: cur.nInBand })}
                        >
                            {shown.map((e) => (
                                <EpochCanvas key={e.index} rgba={e.rgba!} visible={e === cur} />
                            ))}
                        </SkyPanel>
                    )}
                    <div className="quick-side">
                        {banner}
                        {st && (
                            <p className="detail">
                                {t('quick.stats', {
                                    listed: st.listed,
                                    epochs: scene.epochs.length,
                                    read: st.read,
                                    s: st.seconds.toFixed(1),
                                    mb: (st.bytes / 1e6).toFixed(1),
                                    req: st.requests
                                })}
                                {st.failed > 0 ? t('quick.stats.failed', { n: st.failed }) : ''}
                                {st.offDetector > 0 ? t('quick.stats.off', { n: st.offDetector }) : ''}.
                            </p>
                        )}
                        <p className="detail">
                            {t('quick.grid')}{' '}
                            {data?.target ? t('quick.marker.cat', { source: data.target.source }) : t('quick.marker.entered')}
                        </p>
                        {motionTable}
                    </div>
                </div>
            )}
            <div className="controls">
                <div className="group">
                    <h4>{t('ctl.playback')}</h4>
                    <div className="row">
                        <button type="button" className="play" onClick={() => setPlaying(!playing)}>
                            {playing ? t('ctl.pause') : t('ctl.play')}
                        </button>
                    </div>
                </div>
                {scene && count >= 2 && (
                    <div className="group">
                        <HelpTitle as="h4" help="help.diff">
                            {t('ctl.view')}
                        </HelpTitle>
                        <div className="row">
                            <button type="button" className={showDiff ? '' : 'on'} onClick={() => setView('blink')}>
                                {t('ctl.blink')}
                            </button>
                            <button
                                type="button"
                                className={showDiff ? 'on' : ''}
                                disabled={!dif}
                                title={dif ? t('ctl.diff.title') : t('ctl.diff.none.quick')}
                                onClick={() => setView('diff')}
                            >
                                {t('ctl.diff')}
                            </button>
                        </div>
                    </div>
                )}
                <div className="group">
                    <h4>{t('ctl.epoch')}</h4>
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
                    <h4>{t('ctl.speed')}</h4>
                    <div className="row">
                        {SPEEDS.map((s) => (
                            <button key={s.ms} type="button" className={s.ms === ms ? 'on' : ''} onClick={() => setMs(s.ms)}>
                                {t(s.key)}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="group">
                    <HelpTitle as="h4" help="help.detector">
                        {t('ctl.detector')}
                    </HelpTitle>
                    <div className="row">
                        {BANDS.map((b) => (
                            <button
                                key={b.id}
                                type="button"
                                className={b.id === band.id ? 'on' : ''}
                                title={bandLabel(b)}
                                onClick={() => setBandId(b.id)}
                            >
                                {b.id === 'all' ? t('band.all') : b.name}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="group">
                    <HelpTitle as="h4" help="help.marker">
                        {t('ctl.overlay')}
                    </HelpTitle>
                    <label className="check">
                        <input type="checkbox" checked={marker} onChange={(e) => setMarker(e.target.checked)} />
                        {data?.target ? t('ctl.marker') : t('ctl.marker.entered')}
                    </label>
                </div>
            </div>
        </div>
    )
}