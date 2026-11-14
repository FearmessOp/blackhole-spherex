import { useEffect, useState } from 'react'
import SkyPanel, { ARROW_SCALE } from './SkyPanel'
import type { Diff, Meta, Results, XY } from './types'

// Guided mode "Find the mover": three prepared targets, blinked without the catalogue
// marker until the visitor has clicked. The feedback is the distance of the click from
// the catalogue position of the target in the epoch that was on screen. There is no
// score. Every number shown comes from meta.json, results.json or diff.json.

type Step = {
    slug: string
    bands: { id: string; name: string }[] // detector selections offered; the first is shown first
    needBand?: string // the target is only seen in this selection
    hint?: boolean // the difference image is offered as a hint
}

const STEPS: Step[] = [
    { slug: 'barnard', bands: [{ id: 'all', name: 'All detectors' }] },
    { slug: 'eps-indi-b', bands: [{ id: 'all', name: 'All detectors' }], hint: true },
    {
        slug: 'wise-0855',
        bands: [
            { id: 'd123', name: 'Short wavelength (D1–3)' },
            { id: 'd56', name: 'Long wavelength (D5+6)' }
        ],
        needBand: 'd56'
    }
]

const HIT_PX = 2 // a click within 2 grid pixels of the catalogue position counts as found
const BLINK_MS = 700

type Data = { meta: Meta; res: Results; diff: Diff | null }
type Feedback = { kind: 'hit' | 'miss' | 'neighbour' | 'band' | 'shown'; arcsec: number; px: number; epoch: number }

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
    const band = meta.bands.find((b) => b.id === bandId) ?? meta.bands[0]
    const n = band.frames.length

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
        const d = Math.hypot(x - ep.predicted.x, y - ep.predicted.y)
        const dn = nb ? Math.hypot(x - nb.x, y - nb.y) : Infinity
        let kind: Feedback['kind'] = 'miss'
        if (!inNeedBand) kind = dn <= HIT_PX ? 'neighbour' : 'band'
        else if (d <= HIT_PX) kind = 'hit'
        else if (dn <= HIT_PX) kind = 'neighbour'
        setPick({ x, y })
        setFb({ kind, arcsec: d * scale, px: d, epoch: frame.epoch })
        if (kind === 'miss' && hintBand) setHint(true)
    }

    // Before the click: at most two sentences.
    let ask = 'Three stacks of the same patch of sky, taken months apart, are blinked. One star changes pixel: click it.'
    if (step.slug === 'eps-indi-b') {
        ask = 'This one moves by only about one pixel over four epochs. Click the source that shifts; a difference image is there as a hint.'
    } else if (step.slug === 'wise-0855') {
        ask = inNeedBand
            ? 'At long wavelength a faint source appears and moves towards the marked Gaia star. Click it.'
            : 'At short wavelength this cold object is not seen; the marked source is a Gaia star, not the target. Switch to long wavelength, then click what appears and moves.'
    }

    // Feedback: the real distance of the click from the catalogue position.
    const where = fb
        ? `${fb.arcsec.toFixed(1)} arcsec (${fb.px.toFixed(1)} pixels) from the catalogue position of the target in epoch ${fb.epoch + 1}`
        : ''
    let feedback: string | null = null
    if (fb?.kind === 'hit') feedback = `Found. Your click was ${where}.`
    else if (fb?.kind === 'shown') feedback = 'The amber marker now shows the catalogue position of the target.'
    else if (fb?.kind === 'neighbour') feedback = `That is the marked Gaia star, not the target. Your click was ${where}.`
    else if (fb?.kind === 'band') feedback = `The target is not visible at short wavelength. Your click was ${where}; switch to long wavelength.`
    else if (fb?.kind === 'miss') {
        feedback = `Not the mover. Your click was ${where}.${hintBand ? ' The difference image is shown as a hint.' : ' Try again.'}`
    }

    // After the target is found: at most two sentences, numbers from the target's JSON files.
    const e0 = meta.epochs[0].predicted
    const e1 = meta.epochs[meta.epochs.length - 1].predicted
    const shift = Math.hypot(e1.x - e0.x, e1.y - e0.y)
    const sat = res.saturation
    const psf = res.fit?.methods.find((m) => m.id === 'psf')
    const ref = res.fit?.reference
    const pair = res.stack_motion?.pairs.find((p) => p.from === 0 && p.to === meta.epochs.length - 1)
    const two = pair?.methods.find((m) => m.id === 'two') ?? pair?.methods[0]
    let explain = `${meta.name}: between the first and the last epoch the catalogue moves it by ${(shift * scale).toFixed(1)} arcsec (${shift.toFixed(1)} pixels).`
    if (step.slug === 'barnard' && sat) {
        explain += ` Its core is saturated in ${sat.overflow} of ${sat.exposures} exposures, so the site shows no measured motion for it.`
    } else if (step.slug === 'eps-indi-b' && psf && ref) {
        explain = `${meta.name}, a pair of brown dwarfs: measured proper motion (ePSF fit) ${signed(psf.pm_east)} ± ${psf.pm_east_err.toFixed(1)} east and ${signed(psf.pm_north)} ± ${psf.pm_north_err.toFixed(1)} north in mas/yr; SIMBAD gives ${signed(ref.pm_east)} and ${signed(ref.pm_north)}. The arrow is drawn ${ARROW_SCALE} times longer than the motion.`
    } else if (step.slug === 'wise-0855' && pair && two) {
        explain = `${meta.name}, seen only at long wavelength: from the first to the last epoch it moved ${signed(two.east, 2)} ± ${two.east_err.toFixed(2)} arcsec east and ${signed(two.north, 2)} ± ${two.north_err.toFixed(2)} north (${two.label}). The catalogue predicts ${signed(pair.predicted.east, 2)} and ${signed(pair.predicted.north, 2)}.`
    }

    const switchBand = (id: string) => {
        setBandId(id)
        setPos(0)
        if (!found) {
            setPick(null)
            setFb(null)
        }
    }
    const reveal = () => {
        if (step.needBand) setBandId(step.needBand)
        setPick(null)
        setFb({ kind: 'shown', arcsec: 0, px: 0, epoch: frame.epoch })
    }

    return (
        <>
            <p className="guide-ask">{found ? explain : ask}</p>
            {feedback && <p className={`guide-feedback${fb?.kind === 'hit' ? ' hit' : ''}`}>{feedback}</p>}
            <div className="row guide-actions">
                {step.bands.length > 1 &&
                    step.bands.map((b) => (
                        <button key={b.id} className={b.id === bandId ? 'on' : ''} onClick={() => switchBand(b.id)}>
                            {b.name}
                        </button>
                    ))}
                {hintBand && (
                    <button className={hint ? 'on' : ''} onClick={() => setHint(!hint)}>
                        {hint ? 'Hide the hint' : 'Show a hint'}
                    </button>
                )}
                {!found && <button onClick={reveal}>Show me</button>}
                {found && (
                    <button className="guide-next" onClick={onNext}>
                        {isLast ? 'Finish' : 'Next'}
                    </button>
                )}
            </div>
            <div className="views">
                <SkyPanel
                    title={`Stacked per epoch: ${band.label}`}
                    n={meta.grid.npix}
                    scaleArcsec={scale}
                    marker={found && inNeedBand ? ep.predicted : null}
                    markerLabel={found && inNeedBand ? 'target, catalogue position' : undefined}
                    neighbour={nb}
                    neighbourLabel="Gaia star, not the target"
                    arrow={found ? res.fit?.arrow : null}
                    onPick={found ? undefined : onPick}
                    pick={pick}
                    caption={`Epoch ${frame.epoch + 1} of ${meta.epochs.length}: ${ep.t_start.slice(0, 10)} to ${ep.t_end.slice(0, 10)}`}
                    detail={found ? `${frame.n_frames} exposures stacked` : 'Click on the image where you see something move.'}
                >
                    {band.frames.map((f) => (
                        <img key={f.png} src={base + f.png} alt="" style={{ visibility: f === frame ? 'visible' : 'hidden' }} />
                    ))}
                </SkyPanel>
                {hint && hintBand && diff && (
                    <SkyPanel
                        title={`Hint: epoch ${diff.to_epoch + 1} minus epoch ${diff.from_epoch + 1}`}
                        n={meta.grid.npix}
                        scaleArcsec={scale}
                        caption={diff.label}
                        detail="Whatever stays in place cancels to grey; a source that moved leaves a bright and a dark side."
                    >
                        <img src={base + hintBand.png} alt="" />
                    </SkyPanel>
                )}
            </div>
        </>
    )
}

// onExit(true) leaves the guide and puts the cursor into the search box.
export default function FindMover({ onExit }: { onExit: (toSearch: boolean) => void }) {
    const [i, setI] = useState(0)
    const done = i >= STEPS.length
    const step = STEPS[Math.min(i, STEPS.length - 1)]
    const data = useTarget(step.slug)
    return (
        <div className="target guide">
            <div className="guide-head">
                <h2>Find the mover</h2>
                {!done && (
                    <span className="guide-count">
                        Step {i + 1} of {STEPS.length}
                    </span>
                )}
                <button onClick={() => onExit(false)}>{done ? 'Close the guide' : 'Skip the guide'}</button>
            </div>
            {done ? (
                <>
                    <p className="guide-ask">
                        Those were three real movers in SPHEREx images. Now look at any other star: type a name or a position
                        into the search box.
                    </p>
                    <div className="row guide-actions">
                        <button className="guide-next" onClick={() => onExit(true)}>
                            Go to the search box
                        </button>
                        <button onClick={() => setI(0)}>Play again</button>
                    </div>
                </>
            ) : data === 'failed' ? (
                <>
                    <p className="warn">Could not load the data for this step.</p>
                    <button onClick={() => setI(i + 1)}>Next</button>
                </>
            ) : data === null ? (
                <p className="note">Loading…</p>
            ) : (
                <StepView key={step.slug} step={step} data={data} isLast={i === STEPS.length - 1} onNext={() => setI(i + 1)} />
            )}
        </div>
    )
}