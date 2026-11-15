import { useEffect, useState, type ReactNode } from 'react'
import { HelpTitle } from './Help'
import RawView from './RawView'
import ResultsPanel, { FlickerNote, NeighbourNote } from './ResultsPanel'
import SkyPanel from './SkyPanel'
import { bandLabel, diffCaption, t, useLang, type Key } from './i18n'
import type { Arrow, Band, Diff, Meta, Results, XY } from './types'

export type Tab = 'images' | 'measurement' | 'validation'
export const TABS: [Tab, Key][] = [
    ['images', 'tab.images'],
    ['measurement', 'tab.measurement'],
    ['validation', 'tab.validation']
]

const SPEEDS: { key: Key; ms: number }[] = [
    { key: 'speed.slow', ms: 1200 },
    { key: 'speed.normal', ms: 600 },
    { key: 'speed.fast', ms: 250 }
]

const bandName = (id: string) =>
    id === 'all' ? t('band.all') : id === 'd123' ? 'D1–3' : id === 'd56' ? 'D5+6' : id.toUpperCase()

const pct = (v: number | null) => (v === null ? 'n/a' : `${(100 * v).toFixed(0)}%`)

type StackProps = {
    base: string
    meta: Meta
    band: Band
    epoch: number
    title: string
    help?: Key
    marker: boolean
    markerLabel?: string
    neighbour?: XY | null
    neighbourLabel?: string
    arrow?: Arrow | null
}

// One band at one epoch. All frames of the band stay loaded so that blinking does not flash.
function StackPanel({ base, meta, band, epoch, title, help, marker, markerLabel, neighbour, neighbourLabel, arrow }: StackProps) {
    const frame = band.frames.find((f) => f.epoch === epoch)
    const ep = meta.epochs[epoch]
    return (
        <SkyPanel
            title={title}
            help={help}
            n={meta.grid.npix}
            scaleArcsec={meta.grid.scale_arcsec}
            marker={marker ? ep.predicted : null}
            markerLabel={markerLabel}
            neighbour={neighbour}
            neighbourLabel={neighbourLabel}
            arrow={arrow}
            caption={t('panel.epoch', {
                i: epoch + 1,
                n: meta.epochs.length,
                from: ep.t_start.slice(0, 10),
                to: ep.t_end.slice(0, 10)
            })}
            detail={
                frame
                    ? t('panel.stack.detail', {
                        n: frame.n_frames,
                        lo: frame.wave_min_um.toFixed(2),
                        hi: frame.wave_max_um.toFixed(2)
                    })
                    : t('panel.stack.none')
            }
        >
            {band.frames.map((f) => (
                <img key={f.png} src={base + f.png} alt="" style={{ visibility: f === frame ? 'visible' : 'hidden' }} />
            ))}
        </SkyPanel>
    )
}

// One plain sentence with the main result, read from results.json.
// stack_motion (WISE 0855): the first-to-last epoch pair, method "two" (Gaussian fit, neighbour
// modelled), the one the Measurement tab and the guide put first; falls back to the first method.
function summary(res: Results): string {
    const sat = res.saturation
    const saturated = sat !== null && sat.overflow > sat.exposures / 2
    const fit = res.fit
    if (fit) {
        const m = fit.methods.find((x) => x.id === fit.arrow.method) ?? fit.methods[0]
        return t('sum.fit', {
            v: (Math.hypot(m.pm_east, m.pm_north) / 1000).toFixed(2),
            c: (Math.hypot(fit.reference.pm_east, fit.reference.pm_north) / 1000).toFixed(2),
            pct: Math.abs(m.plx_excess_pct).toFixed(0),
            side: t(m.plx_excess_pct >= 0 ? 'sum.above' : 'sum.below')
        })
    }
    const sm = res.stack_motion
    if (sm && sm.pairs.length) {
        const last = Math.max(...sm.pairs.map((p) => p.to))
        const first = Math.min(...sm.pairs.map((p) => p.from))
        const p = sm.pairs.find((x) => x.from === first && x.to === last) ?? sm.pairs[sm.pairs.length - 1]
        const m = p.methods.find((x) => x.id === 'two') ?? p.methods[0]
        return t('sum.stack', {
            v: Math.hypot(m.east, m.north).toFixed(2),
            c: Math.hypot(p.predicted.east, p.predicted.north).toFixed(2)
        })
    }
    if (saturated && sat) return t('sum.sat', { a: sat.overflow, b: sat.exposures })
    const nf = res.fit_not_shown
    if (nf) return t('sum.nofit', { u: nf.usable, b: nf.exposures })
    return t('sum.none')
}

type Props = { slug: string; tab: Tab; validation: ReactNode }

export default function BlinkView({ slug, tab, validation }: Props) {
    useLang()
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
        // Only some targets have a difference image; results.json says which, so no request ends in a 404.
        const getOptional = (name: string) =>
            fetch(base + name)
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null)
        Promise.all([get('meta.json'), get('results.json')])
            .then(([meta, res]) =>
                (res.has_diff ? getOptional('diff.json') : Promise.resolve(null)).then((diff) => [meta, res, diff])
            )
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

    if (failed) return <p className="note">{t('load.failed')}</p>
    if (!meta || !res || !band) return <p className="note">{t('load.target')}</p>

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

    const blackCore = (res.saturation?.core_empty ?? 0) > 0

    return (
        <div className="target">
            {tab === 'images' && (
                <>
                    <div className="views">
                        {showDiff && diff && diffBand ? (
                            <SkyPanel
                                title={t('panel.diff', { b: diff.to_epoch + 1, a: diff.from_epoch + 1, band: bandLabel(band) })}
                                help="help.diff"
                                n={meta.grid.npix}
                                scaleArcsec={meta.grid.scale_arcsec}
                                marker={marker ? meta.epochs[diff.to_epoch].predicted : null}
                                caption={diffCaption(diff.label)}
                                detail={t('diff.detail', {
                                    dets: diffBand.dets_used.join(', '),
                                    n1: diffBand.n_first,
                                    n2: diffBand.n_last,
                                    vmax: diffBand.vmax.toPrecision(3),
                                    stars: diffBand.n_stars,
                                    med: pct(diffBand.star_ratio_median),
                                    p90: pct(diffBand.star_ratio_p90),
                                    bright: pct(diffBand.lobe_bright_ratio),
                                    dark: pct(diffBand.lobe_dark_ratio)
                                })}
                            >
                                <img src={base + diffBand.png} alt="" />
                            </SkyPanel>
                        ) : (
                            <StackPanel
                                base={base}
                                meta={meta}
                                band={band}
                                epoch={epoch}
                                title={t('panel.stack', { band: bandLabel(band) })}
                                help="help.stack"
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
                            note={blackCore ? t('raw.black') : undefined}
                        />
                    </div>

                    <div className="playbar">
                        <button type="button" className="play" onClick={() => setPlaying(!playing)}>
                            {playing ? t('ctl.pause') : t('ctl.play')}
                        </button>
                        <span className="playbar-label">{t('ctl.epoch')}</span>
                        {band.frames.map((f, i) => (
                            <button
                                key={f.png}
                                type="button"
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

                    <p className="summary">{summary(res)}</p>

                    <div className="controls">
                        {diff && (
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
                                        disabled={!diffBand}
                                        title={diffBand ? t('ctl.diff.title') : t('ctl.diff.none')}
                                        onClick={() => setView('diff')}
                                    >
                                        {t('ctl.diff')}
                                    </button>
                                </div>
                            </div>
                        )}
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
                                {meta.bands.map((b) => (
                                    <button
                                        key={b.id}
                                        type="button"
                                        className={b.id === band.id ? 'on' : ''}
                                        title={bandLabel(b)}
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
                            <HelpTitle as="h4" help="help.marker">
                                {t('ctl.overlay')}
                            </HelpTitle>
                            <label className="check">
                                <input type="checkbox" checked={marker} onChange={(e) => setMarker(e.target.checked)} />
                                {t('ctl.marker')}
                            </label>
                        </div>
                    </div>

                    {compare.length === 2 && (
                        <section className="compare">
                            <h3>{t('compare.title')}</h3>
                            <p className="detail">{t('compare.detail')}</p>
                            <div className="views">
                                {compare.map((b) => (
                                    <StackPanel
                                        key={b.id}
                                        base={base}
                                        meta={meta}
                                        band={b}
                                        epoch={epoch}
                                        title={bandLabel(b)}
                                        marker={marker}
                                        markerLabel={t('label.target')}
                                        neighbour={marker ? neighbourXY : null}
                                        neighbourLabel={t('label.neighbour')}
                                    />
                                ))}
                            </div>
                            {neighbour && <NeighbourNote nb={neighbour} />}
                        </section>
                    )}
                </>
            )}

            {tab === 'measurement' && (
                <>
                    <ResultsPanel r={res} />
                    <FlickerNote r={res} />
                </>
            )}

            {tab === 'validation' && validation}
        </div>
    )
}