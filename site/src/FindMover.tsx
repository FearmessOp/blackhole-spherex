import { useEffect, useState } from 'react'
import SkyPanel, { ARROW_SCALE } from './SkyPanel'
import { bandLabel, diffCaption, label, t, useLang, type Key } from './i18n'
import type { Diff, Meta, Results, XY } from './types'

// Guided mode "Find the mover": three prepared targets, blinked without the catalogue
// marker. The visitor clicks the moving object once for every epoch, in epoch order; click k
// is judged against the target's catalogue position in epoch k (within HIT_PX). The clicks
// already made are drawn as amber dots; after the last one, the catalogue positions of all
// epochs replace them. There is no score. Every number shown comes from meta.json,
// results.json or diff.json.

type Step = {
    slug: string
    bands: { id: string; name?: Key }[] // detector selections offered; the first is shown first
    needBand?: string // the target is only seen in this selection
    hint?: boolean // the difference image is offered as a hint
}

const STEPS: Step[] = [
    { slug: 'barnard', bands: [{ id: 'all' }] },
    { slug: 'eps-indi-b', bands: [{ id: 'all' }], hint: true },
    {
        slug: 'wise-0855',
        bands: [
            { id: 'd123', name: 'guide.band.d123' },
            { id: 'd56', name: 'guide.band.d56' }
        ],
        needBand: 'd56'
    }
]

export const HIT_PX = 2 // a click within 2 grid pixels of the catalogue position of the epoch asked for counts
const BLINK_MS = 700

type Data = { meta: Meta; res: Results; diff: Diff | null }
type Feedback = {
    kind: 'hit' | 'step' | 'miss' | 'neighbour' | 'band' | 'shown'
    arcsec: number
    px: number
    epoch: number
    next?: number // epoch asked for after a correct intermediate click
}

const signed = (v: number, digits = 1) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(digits)

function useTarget(slug: string): Data | 'failed' | null {
    // The data is kept with its slug: after a step change the previous target's data must not be
    // shown under the new slug (its frame names would be asked for in the wrong folder).
    const [state, setState] = useState<{ slug: string; data: Data | 'failed' } | null>(null)
    useEffect(() => {
        let cancelled = false
        const base = `${import.meta.env.BASE_URL}data/${slug}/`
        const get = (name: string) =>
            fetch(base + name).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        // results.json says whether a difference image exists, so no request ends in a 404.
        const optional = (name: string) =>
            fetch(base + name)
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null)
        Promise.all([get('meta.json'), get('results.json')])
            .then(([meta, res]) =>
                (res.has_diff ? optional('diff.json') : Promise.resolve(null)).then((diff) => [meta, res, diff])
            )
            .then(([meta, res, diff]) => {
                if (!cancelled) setState({ slug, data: { meta, res, diff: diff && Array.isArray(diff.bands) ? diff : null } })
            })
            .catch(() => {
                if (!cancelled) setState({ slug, data: 'failed' })
            })
        return () => {
            cancelled = true
        }
    }, [slug])
    return state && state.slug === slug ? state.data : null
}

function StepView({ step, data, isLast, onNext }: { step: Step; data: Data; isLast: boolean; onNext: () => void }) {
    const { meta, res, diff } = data
    const base = `${import.meta.env.BASE_URL}data/${step.slug}/`
    const [bandId, setBandId] = useState(step.bands[0].id)
    const [pos, setPos] = useState(0)
    const [pick, setPick] = useState<XY | null>(null)
    const [fb, setFb] = useState<Feedback | null>(null)
    const [hint, setHint] = useState(false)
    const [got, setGot] = useState<XY[]>([]) // correct clicks so far, one per epoch in order
    const band = meta.bands.find((b) => b.id === bandId) ?? meta.bands[0]
    const n = band.frames.length
    const seq = band.frames.map((f) => f.epoch) // epochs to click, in order

    useEffect(() => {
        if (n < 2) return
        const id = window.setInterval(() => setPos((p) => (p + 1) % n), BLINK_MS)
        return () => window.clearInterval(id)
    }, [n])

    const frame = band.frames[pos % n]
    const ep = meta.epochs[frame.epoch]
    const scale = meta.grid.scale_arcsec
    const found = fb?.kind === 'hit' || fb?.kind === 'shown'
    const inNeedBand = step.needBand === undefined || bandId === step.needBand
    // A catalogue star next to the target (WISE 0855): marked from the start, never the answer.
    const nb = step.needBand ? (res.stack_motion?.neighbour?.xy?.[frame.epoch] ?? null) : null
    const hintBand = step.hint ? (diff?.bands.find((b) => b.id === bandId && b.distinct) ?? null) : null

    const onPick = (x: number, y: number) => {
        // Click number got.length is judged against the catalogue position of that epoch.
        const k = seq[got.length]
        const e = meta.epochs[k].predicted
        const d = Math.hypot(x - e.x, y - e.y)
        const dn = nb ? Math.hypot(x - nb.x, y - nb.y) : Infinity
        let kind: Feedback['kind'] = 'miss'
        if (!inNeedBand) kind = dn <= HIT_PX ? 'neighbour' : 'band'
        else if (d <= HIT_PX) kind = got.length + 1 === seq.length ? 'hit' : 'step'
        else if (dn <= HIT_PX) kind = 'neighbour'
        if (kind === 'hit' || kind === 'step') setGot([...got, { x, y }])
        setPick({ x, y })
        setFb({ kind, arcsec: d * scale, px: d, epoch: k, next: kind === 'step' ? seq[got.length + 1] : undefined })
        if (kind === 'miss' && hintBand) setHint(true)
    }

    // Before the click: at most two sentences.
    let ask = t('guide.ask.barnard')
    if (step.slug === 'eps-indi-b') ask = t('guide.ask.eps')
    else if (step.slug === 'wise-0855') ask = inNeedBand ? t('guide.ask.wise.long') : t('guide.ask.wise.short')

    // Feedback: the real distance of the click from the catalogue position.
    const nEp = meta.epochs.length
    const where = fb ? t('guide.where', { arcsec: fb.arcsec.toFixed(1), px: fb.px.toFixed(1), e: fb.epoch + 1, n: nEp }) : ''
    let feedback: string | null = null
    if (fb?.kind === 'hit') feedback = t('guide.fb.hit', { where, n: nEp })
    else if (fb?.kind === 'step') feedback = t('guide.fb.step', { where, e: fb.epoch + 1, next: (fb.next ?? 0) + 1 })
    else if (fb?.kind === 'shown') feedback = t('guide.fb.shown')
    else if (fb?.kind === 'neighbour') feedback = t('guide.fb.neighbour', { where })
    else if (fb?.kind === 'band') feedback = t('guide.fb.band', { where })
    else if (fb?.kind === 'miss') feedback = t(hintBand ? 'guide.fb.miss.hint' : 'guide.fb.miss.again', { where })

    // After the target is found: at most two sentences, numbers from the target's JSON files.
    const e0 = meta.epochs[0].predicted
    const e1 = meta.epochs[meta.epochs.length - 1].predicted
    const shift = Math.hypot(e1.x - e0.x, e1.y - e0.y)
    const sat = res.saturation
    const psf = res.fit?.methods.find((m) => m.id === 'psf')
    const ref = res.fit?.reference
    const pair = res.stack_motion?.pairs.find((p) => p.from === 0 && p.to === meta.epochs.length - 1)
    const two = pair?.methods.find((m) => m.id === 'two') ?? pair?.methods[0]
    let explain = t('guide.explain.base', { name: meta.name, arcsec: (shift * scale).toFixed(1), px: shift.toFixed(1) })
    if (step.slug === 'barnard' && sat) {
        explain += ' ' + t('guide.explain.sat', { a: sat.overflow, b: sat.exposures })
    } else if (step.slug === 'eps-indi-b' && psf && ref) {
        explain = t('guide.explain.eps', {
            name: meta.name,
            e: signed(psf.pm_east),
            ee: psf.pm_east_err.toFixed(1),
            n: signed(psf.pm_north),
            ne: psf.pm_north_err.toFixed(1),
            re: signed(ref.pm_east),
            rn: signed(ref.pm_north),
            k: ARROW_SCALE
        })
    } else if (step.slug === 'wise-0855' && pair && two) {
        explain = t('guide.explain.wise', {
            name: meta.name,
            e: signed(two.east, 2),
            ee: two.east_err.toFixed(2),
            n: signed(two.north, 2),
            ne: two.north_err.toFixed(2),
            method: label(two.label),
            pe: signed(pair.predicted.east, 2),
            pn: signed(pair.predicted.north, 2)
        })
    }

    const switchBand = (id: string) => {
        setBandId(id)
        setPos(0)
        if (!found) {
            setPick(null)
            setFb(null)
            setGot([])
        }
    }
    const reveal = () => {
        if (step.needBand) setBandId(step.needBand)
        setPick(null)
        setFb({ kind: 'shown', arcsec: 0, px: 0, epoch: frame.epoch })
    }

    return (
        <div className="guide-step">
            <SkyPanel
                title={t('panel.stack', { band: bandLabel(band) })}
                n={meta.grid.npix}
                scaleArcsec={scale}
                marker={found && inNeedBand ? ep.predicted : null}
                markerLabel={found && inNeedBand ? t('label.target') : undefined}
                neighbour={nb}
                neighbourLabel={t('label.gaia')}
                arrow={found ? res.fit?.arrow : null}
                track={found && inNeedBand ? meta.epochs.map((e) => e.predicted) : got.length ? got : null}
                onPick={found ? undefined : onPick}
                pickBadge={t('guide.click.badge')}
                pick={found ? null : pick}
                caption={t('panel.epoch', {
                    i: frame.epoch + 1,
                    n: meta.epochs.length,
                    from: ep.t_start.slice(0, 10),
                    to: ep.t_end.slice(0, 10)
                })}
                detail={
                    found
                        ? t('guide.stacked', { n: frame.n_frames })
                        : t('guide.click', { e: seq[got.length] + 1, n: meta.epochs.length })
                }
            >
                {band.frames.map((f) => (
                    <img key={f.png} src={base + f.png} alt="" style={{ visibility: f === frame ? 'visible' : 'hidden' }} />
                ))}
            </SkyPanel>
            <div className="guide-side">
                <p className="guide-ask">{found ? explain : ask}</p>
                {feedback && <p className={`guide-feedback${fb?.kind === 'hit' ? ' hit' : ''}`}>{feedback}</p>}
                <div className="row guide-actions">
                    {step.bands.length > 1 &&
                        step.bands.map((b) => (
                            <button key={b.id} type="button" className={b.id === bandId ? 'on' : ''} onClick={() => switchBand(b.id)}>
                                {b.name ? t(b.name) : b.id}
                            </button>
                        ))}
                    {hintBand && (
                        <button type="button" className={hint ? 'on' : ''} onClick={() => setHint(!hint)}>
                            {hint ? t('guide.hint.hide') : t('guide.hint.show')}
                        </button>
                    )}
                    {!found && (
                        <button type="button" className="guide-show" onClick={reveal}>
                            {t('guide.showme')}
                        </button>
                    )}
                    {found && (
                        <button type="button" className="guide-next" onClick={onNext}>
                            {isLast ? t('guide.finish') : t('guide.next')}
                        </button>
                    )}
                </div>
                {hint && hintBand && diff && (
                    <div className="guide-hint">
                        <SkyPanel
                            title={t('guide.hint.title', { b: diff.to_epoch + 1, a: diff.from_epoch + 1 })}
                            n={meta.grid.npix}
                            scaleArcsec={scale}
                            caption={diffCaption(diff.label)}
                            detail={t('guide.hint.detail')}
                        >
                            <img src={base + hintBand.png} alt="" />
                        </SkyPanel>
                    </div>
                )}
            </div>
        </div>
    )
}

// onExit(true) leaves the guide and puts the cursor into the search box.
export default function FindMover({ onExit, onGame }: { onExit: (toSearch: boolean) => void; onGame?: () => void }) {
    useLang()
    const [i, setI] = useState(0)
    const done = i >= STEPS.length
    const step = STEPS[Math.min(i, STEPS.length - 1)]
    const data = useTarget(step.slug)
    return (
        <div className="target guide">
            <div className="guide-head">
                <h2>{t('guide.title')}</h2>
                {!done && <span className="guide-count">{t('guide.step', { i: i + 1, n: STEPS.length })}</span>}
                <button type="button" onClick={() => onExit(false)}>
                    {done ? t('guide.close') : t('guide.skip')}
                </button>
            </div>
            {done ? (
                <>
                    <p className="guide-ask">{t('guide.done')}</p>
                    <div className="row guide-actions">
                        <button type="button" className="guide-next" onClick={() => onExit(true)}>
                            {t('guide.tosearch')}
                        </button>
                        <button type="button" className="guide-again" onClick={() => setI(0)}>
                            {t('guide.again')}
                        </button>
                        {onGame && (
                            <button type="button" className="guide-next" onClick={onGame}>
                                {t('game.play')}
                            </button>
                        )}
                    </div>
                </>
            ) : data === 'failed' ? (
                <>
                    <p className="warn">{t('guide.failed')}</p>
                    <button type="button" onClick={() => setI(i + 1)}>
                        {t('guide.next')}
                    </button>
                </>
            ) : data === null ? (
                <p className="note">{t('load.target')}</p>
            ) : (
                <StepView key={step.slug} step={step} data={data} isLast={i === STEPS.length - 1} onNext={() => setI(i + 1)} />
            )}
        </div>
    )
}