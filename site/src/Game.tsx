import { useEffect, useRef, useState } from 'react'
import { summary } from './BlinkView'
import { HIT_PX } from './FindMover'
import SkyPanel from './SkyPanel'
import { bandLabel, t, useLang, withLang } from './i18n'
import type { Diff, Meta, Results, XY } from './types'

// Game mode: unlimited rounds over the pool in data/game.json (pipeline/game_pool.py).
// Each round shows a randomly shifted 15 x 15 px window of the epoch stacks (pixel values,
// north-up and scale unchanged; only a crop), so that the target is not always in the centre.
// Clicks are judged as in the guide: one per epoch, in epoch order; click k counts within HIT_PX
// of the catalogue position of epoch k. The round is found when every epoch has been clicked.

// Scoring, in one place (also written out under "How scoring works").
export const SCORE = { found: 100, wrong: -10, hint: -30, bonusMax: 50, bonusSeconds: 30 }
const WINDOW = 15
const EDGE = 3 // the target stays at least this many pixels from the window edge
const BLINK_MS = 700
const BEST_KEY = 'spherex-game-best'

type PoolEntry = { slug: string; band: string; has_diff: boolean }
type Round = { entry: PoolEntry; meta: Meta; res: Results; diff: Diff | null; ox: number; oy: number; w: number }
type Done = { found: boolean; seconds: number; score: number }

const base = (slug: string) => `${import.meta.env.BASE_URL}data/${slug}/`

function roundScore(found: boolean, shown: boolean, wrong: number, hint: boolean, seconds: number): number {
    if (shown || !found) return 0
    const bonus = Math.max(0, SCORE.bonusMax * (1 - seconds / SCORE.bonusSeconds))
    return Math.max(0, Math.round(SCORE.found + SCORE.wrong * wrong + (hint ? SCORE.hint : 0) + bonus))
}

function shuffle<T>(a: T[]): T[] {
    const b = a.slice()
    for (let i = b.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
            ;[b[i], b[j]] = [b[j], b[i]]
    }
    return b
}

// Random window offset that keeps all epoch positions at least EDGE px inside the window.
function windowOffset(npix: number, pts: XY[]): { ox: number; oy: number; w: number } {
    const w = Math.min(WINDOW, npix)
    const pick = (vals: number[]) => {
        const lo = Math.max(0, Math.ceil(Math.max(...vals) - (w - 1 - EDGE)))
        const hi = Math.min(npix - w, Math.floor(Math.min(...vals) - EDGE))
        if (hi < lo) return Math.max(0, Math.min(npix - w, Math.round((npix - w) / 2)))
        return lo + Math.floor(Math.random() * (hi - lo + 1))
    }
    return { ox: pick(pts.map((p) => p.x)), oy: pick(pts.map((p) => p.y)), w }
}

async function loadRound(entry: PoolEntry): Promise<Round> {
    const get = (name: string) => fetch(base(entry.slug) + name).then((r) => (r.ok ? r.json() : Promise.reject(new Error(name))))
    const [meta, res] = (await Promise.all([get('meta.json'), get('results.json')])) as [Meta, Results]
    const diff = entry.has_diff ? ((await get('diff.json').catch(() => null)) as Diff | null) : null
    const band = meta.bands.find((b) => b.id === entry.band) ?? meta.bands[0]
    // Images are loaded before the round starts, so that the clock starts with them.
    await Promise.all(
        band.frames.map(
            (f) =>
                new Promise<void>((ok) => {
                    const img = new Image()
                    img.onload = img.onerror = () => ok()
                    img.src = base(entry.slug) + f.png
                })
        )
    )
    return { entry, meta, res, diff, ...windowOffset(meta.grid.npix, meta.epochs.map((e) => e.predicted)) }
}

function RoundView({ r, onDone, onNext }: { r: Round; onDone: (d: Done) => void; onNext: () => void }) {
    const { meta, res, diff, ox, oy, w, entry } = r
    const n = meta.grid.npix
    const band = meta.bands.find((b) => b.id === entry.band) ?? meta.bands[0]
    const [pos, setPos] = useState(0)
    const [wrong, setWrong] = useState(0)
    const [hint, setHint] = useState(false)
    const [pick, setPick] = useState<XY | null>(null)
    const [got, setGot] = useState<XY[]>([]) // correct clicks so far, window pixels
    const [result, setResult] = useState<{ found: boolean; shown: boolean; seconds: number; score: number } | null>(null)
    const [now, setNow] = useState(() => performance.now())
    const t0 = useRef(performance.now())
    const nf = band.frames.length
    const seq = band.frames.map((f) => f.epoch) // epochs to click, in order

    useEffect(() => {
        if (nf < 2) return
        const id = window.setInterval(() => setPos((p) => (p + 1) % nf), BLINK_MS)
        return () => window.clearInterval(id)
    }, [nf])
    useEffect(() => {
        if (result) return
        const id = window.setInterval(() => setNow(performance.now()), 100)
        return () => window.clearInterval(id)
    }, [result])

    const frame = band.frames[pos % nf]
    const ep = meta.epochs[frame.epoch]
    const seconds = result ? result.seconds : (now - t0.current) / 1000
    const hintBand = diff?.bands.find((b) => b.id === band.id && b.distinct) ?? null
    const shift = (q: XY): XY => ({ x: q.x - ox, y: q.y - oy })
    // The crop: the full-grid image is enlarged and moved so that the window fills the panel.
    const crop = { width: `${(n / w) * 100}%`, height: `${(n / w) * 100}%`, left: `${(-ox / w) * 100}%`, top: `${(-oy / w) * 100}%` }

    const finish = (found: boolean, shown: boolean) => {
        const s = (performance.now() - t0.current) / 1000
        const score = roundScore(found, shown, wrong, hint, s)
        setResult({ found, shown, seconds: s, score })
        onDone({ found, seconds: s, score })
    }
    const onPick = (x: number, y: number) => {
        const e = meta.epochs[seq[got.length]].predicted
        const d = Math.hypot(x + ox - e.x, y + oy - e.y)
        setPick({ x, y })
        if (d > HIT_PX) return setWrong(wrong + 1)
        const g = [...got, { x, y }]
        setGot(g)
        if (g.length === seq.length) finish(true, false)
    }

    let feedback: string | null = null
    if (result?.found) feedback = t('game.hit', { s: result.seconds.toFixed(1), name: meta.name, r: result.score })
    else if (result?.shown) feedback = t('game.shown', { name: meta.name })
    else if (wrong > 0) feedback = t('game.miss', { n: wrong, p: -SCORE.wrong })

    return (
        <div className="guide-step">
            <SkyPanel
                title={t('panel.stack', { band: bandLabel(band) })}
                n={w}
                scaleArcsec={meta.grid.scale_arcsec}
                marker={result ? shift(ep.predicted) : null}
                track={result ? meta.epochs.map((e) => shift(e.predicted)) : got.length ? got : null}
                onPick={result ? undefined : onPick}
                pickBadge={t('guide.click.badge')}
                pick={result ? null : pick}
                caption={t('panel.epoch', { i: frame.epoch + 1, n: meta.epochs.length, from: ep.t_start.slice(0, 10), to: ep.t_end.slice(0, 10) })}
                detail={result ? summary(res) : t('game.step', { e: seq[got.length] + 1, n: meta.epochs.length })}
            >
                {band.frames.map((f) => (
                    <img key={f.png} src={base(entry.slug) + f.png} alt="" style={{ ...crop, visibility: f === frame ? 'visible' : 'hidden' }} />
                ))}
            </SkyPanel>
            <div className="guide-side">
                <p className="guide-ask">{result ? meta.name : t('game.ask')}</p>
                <p className="game-clock">{t('game.time', { s: seconds.toFixed(1) })}</p>
                {feedback && <p className={`guide-feedback${result?.found ? ' hit' : ''}`}>{feedback}</p>}
                <div className="row guide-actions">
                    {hintBand && !result && (
                        <button type="button" className={hint ? 'on' : ''} onClick={() => setHint(true)} disabled={hint}>
                            {t('game.hint', { p: -SCORE.hint })}
                        </button>
                    )}
                    {!result && (
                        <button type="button" onClick={() => finish(false, true)}>
                            {t('guide.showme')}
                        </button>
                    )}
                    {result && (
                        <>
                            <button type="button" className="guide-next" onClick={onNext}>
                                {t('game.next')}
                            </button>
                            <a className="game-open" href={withLang(`${window.location.pathname}?target=${entry.slug}`)}>
                                {t('game.open')}
                            </a>
                        </>
                    )}
                </div>
                {hint && hintBand && diff && (
                    <div className="guide-hint">
                        <SkyPanel
                            title={t('guide.hint.title', { b: diff.to_epoch + 1, a: diff.from_epoch + 1 })}
                            n={w}
                            scaleArcsec={meta.grid.scale_arcsec}
                            caption={t('diff.caption')}
                            detail={t('guide.hint.detail')}
                        >
                            <img src={base(entry.slug) + hintBand.png} alt="" style={crop} />
                        </SkyPanel>
                    </div>
                )}
            </div>
        </div>
    )
}

export default function Game({ onExit }: { onExit: () => void }) {
    useLang()
    const [pool, setPool] = useState<PoolEntry[] | 'failed' | null>(null)
    const [bag, setBag] = useState<PoolEntry[]>([])
    const [last, setLast] = useState<string | null>(null)
    const [round, setRound] = useState<Round | 'failed' | null>(null)
    const [k, setK] = useState(0)
    const [done, setDone] = useState<Done[]>([])
    const [over, setOver] = useState(false)
    const [best, setBest] = useState<number>(() => Number(window.localStorage.getItem(BEST_KEY) ?? 0) || 0)

    useEffect(() => {
        fetch(`${import.meta.env.BASE_URL}data/game.json`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error('game.json'))))
            .then((g: { targets: PoolEntry[] }) => setPool(g.targets))
            .catch(() => setPool('failed'))
    }, [])

    // Next target: from a shuffled bag, never the same twice in a row; the bag is refilled when empty.
    const next = (p: PoolEntry[], prev: string | null, b: PoolEntry[]) => {
        let rest = b.length ? b : shuffle(p)
        if (rest[0].slug === prev && rest.length > 1) rest = [rest[1], rest[0], ...rest.slice(2)]
        else if (rest[0].slug === prev) rest = shuffle(p).filter((x) => x.slug !== prev).concat(rest)
        const [e, ...remain] = rest
        setBag(remain)
        setLast(e.slug)
        setRound(null)
        setK((x) => x + 1)
        loadRound(e).then(setRound).catch(() => setRound('failed'))
    }
    useEffect(() => {
        if (Array.isArray(pool) && pool.length && k === 0) next(pool, null, [])
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pool])

    const total = done.reduce((s, d) => s + d.score, 0)
    const found = done.filter((d) => d.found)
    const end = () => {
        if (total > best) {
            setBest(total)
            try {
                window.localStorage.setItem(BEST_KEY, String(total))
            } catch {
                // not kept
            }
        }
        setOver(true)
    }
    const restart = () => {
        setDone([])
        setOver(false)
        if (Array.isArray(pool)) next(pool, last, bag)
    }
    const mean = found.length ? (found.reduce((s, d) => s + d.seconds, 0) / found.length).toFixed(1) : '–'

    return (
        <div className="target guide game">
            <div className="guide-head">
                <h2>{t('game.title')}</h2>
                {!over && (
                    <span className="guide-count">
                        {t('game.hud', { i: k, s: total, f: found.length, p: done.length })}
                    </span>
                )}
                {!over && (
                    <button type="button" onClick={end}>
                        {t('game.end')}
                    </button>
                )}
                <button type="button" onClick={onExit}>
                    {t('game.close')}
                </button>
            </div>
            {pool === 'failed' && <p className="warn">{t('game.failed')}</p>}
            {over ? (
                <>
                    <p className="guide-ask">
                        {t('game.summary', { r: done.length, f: found.length, t: mean, s: total, b: Math.max(best, total) })}
                    </p>
                    <div className="row guide-actions">
                        <button type="button" className="guide-next" onClick={restart}>
                            {t('guide.again')}
                        </button>
                    </div>
                </>
            ) : round === 'failed' ? (
                <>
                    <p className="warn">{t('guide.failed')}</p>
                    <button type="button" onClick={() => Array.isArray(pool) && next(pool, last, bag)}>
                        {t('game.next')}
                    </button>
                </>
            ) : round === null ? (
                <p className="note">{t('load.target')}</p>
            ) : (
                <RoundView
                    key={k}
                    r={round}
                    onDone={(d) => setDone((x) => [...x, d])}
                    onNext={() => Array.isArray(pool) && next(pool, last, bag)}
                />
            )}
            <details className="game-rules">
                <summary>{t('game.rules.title')}</summary>
                <p>
                    {t('game.rules', {
                        f: SCORE.found,
                        w: -SCORE.wrong,
                        h: -SCORE.hint,
                        b: SCORE.bonusMax,
                        s: SCORE.bonusSeconds,
                        px: HIT_PX
                    })}
                </p>
            </details>
        </div>
    )
}
