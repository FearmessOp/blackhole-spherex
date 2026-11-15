import { ARROW_SCALE } from './SkyPanel'
import type { Neighbour, Results } from './types'

const f = (v: number, d = 1) => v.toFixed(d)
const s = (v: number, d = 2) => (v >= 0 ? '+' : '') + v.toFixed(d)
const pct = (v: number) => (100 * v).toFixed(1) + '%'

// Flicker line shown under the two image panels.
export function FlickerNote({ r }: { r: Results }) {
    const fl = r.flicker
    const maskPct = (100 * r.raw_dropped.max_masked_fraction).toFixed(0)
    return (
        <p className="flicker">
            {fl ? (
                <>
                    <b>Flicker.</b> {fl.n_stars} constant Gaia stars in this field change by{' '}
                    <span className="num">{pct(fl.raw_scatter_median)}</span> from one raw exposure to the next
                    (each exposure is at a different wavelength) and by{' '}
                    <span className="num">{pct(fl.epoch_std_median)}</span> between epoch means, compared detector
                    by detector. Medians of the per-star scatter; epoch means are averages of aperture fluxes, not
                    measured on the stacked image.
                </>
            ) : (
                <>
                    <b>Flicker.</b> Not measured for this field yet.
                </>
            )}{' '}
            {r.raw_dropped.dropped > 0 ? (
                <>
                    Raw playback leaves out {r.raw_dropped.dropped} of {r.raw_dropped.total} exposures: those with
                    more than {maskPct}% of their pixels masked. They are still part of the stacks.
                </>
            ) : (
                <>
                    Raw playback shows all {r.raw_dropped.total} exposures; none has more than {maskPct}% of its
                    pixels masked.
                </>
            )}
        </p>
    )
}

// Shown directly under the short / long wavelength panels.
export function NeighbourNote({ nb }: { nb: Neighbour }) {
    return (
        <p className="warn">
            <b>The source next to the amber marker in the short-wavelength stack is not the target.</b> It is the
            star Gaia DR3 {nb.gaia_id}
            {nb.g !== null && <> (G = {f(nb.g, 2)})</>}
            {nb.short_offset_max_arcsec !== null && (
                <>, fitted within {f(nb.short_offset_max_arcsec, 2)} arcsec of its Gaia position</>
            )}
            . It lies {nb.sep_arcsec.map((v) => f(v)).join(', ')} arcsec from the predicted target position in the{' '}
            {nb.sep_arcsec.length} epochs; the target is moving towards it. On the long-wavelength stacks the star has{' '}
            {nb.amp_ratio
                .map((v, i) => {
                    const [lo, hi] = nb.amp_ratio_range[i]
                    return `${f(v, 2)} (${f(lo, 2)}–${f(hi, 2)})`
                })
                .join(', ')}{' '}
            of the target's amplitude (16–84% bootstrap range in brackets) and pulls a single-source measurement
            towards itself. The measurement labelled <i>Gaussian fit, neighbour modelled</i> in the table below fits
            both sources, with the star fixed at its Gaia position and one shared width; where the range is wide the
            two sources are not well separated.
        </p>
    )
}

// "22% (windowed centroid) and 5% (ePSF fit) above" if both estimators are on the same side of the
// reference, else one side per estimator, each labelled with its method.
function plxSide(ms: { label: string; pct: number }[]): string {
    const above = ms.every((m) => m.pct >= 0)
    const below = ms.every((m) => m.pct < 0)
    if (above || below)
        return `${ms.map((m) => `${f(Math.abs(m.pct), 0)}% (${m.label})`).join(' and ')} ${above ? 'above' : 'below'}`
    return ms.map((m) => `${f(Math.abs(m.pct), 0)}% ${m.pct >= 0 ? 'above' : 'below'} (${m.label})`).join(' and ')
}

export default function ResultsPanel({ r }: { r: Results }) {
    const sat = r.saturation
    const saturated = sat !== null && sat.overflow > sat.exposures / 2
    const fit = r.fit
    const sm = r.stack_motion
    const pe = r.per_exposure_fit
    const nf = r.fit_not_shown ?? null
    const off = r.off_target ?? null
    const hasLoo = fit !== null && fit.methods.every((m) => m.plx_loo_min !== null && m.plx_loo_max !== null)

    return (
        <section className="results">
            <h3>Measured</h3>

            {off && (
                <p className="warn">
                    <b>The bright source next to the amber marker is not at the catalogue position of the target.</b>{' '}
                    Its centroid on the stacks lies {off.offset_arcsec.map((v) => f(v)).join(', ')} arcsec from the
                    catalogue position in the {off.offset_arcsec.length} epochs (more than {f(off.limit_arcsec, 0)}{' '}
                    arcsec counts as another source). The amber marker is the catalogue position.
                </p>
            )}

            {saturated && sat && fit && (
                <p className="warn">
                    The OVERFLOW flag is set at the target position in {sat.overflow} of {sat.exposures} exposures.
                    The fit below uses only exposures with an unsaturated core.
                </p>
            )}

            {nf && (
                <p className="warn">
                    No motion fit is shown for this target: {nf.usable} of {nf.exposures} exposures have a clean core
                    measured by both position methods ({nf.usable_per_epoch.join(', ')} in the{' '}
                    {nf.usable_per_epoch.length} epochs). The rule is at least {nf.min_exposures} exposures, in at
                    least {nf.min_epochs} epochs of at least {nf.min_per_epoch}.
                </p>
            )}

            {saturated && sat && !fit && (
                <p className="warn">
                    Saturated target: the OVERFLOW flag is set at the target position in {sat.overflow} of{' '}
                    {sat.exposures} exposures. Too few exposures have an unsaturated core to measure a motion,
                    so no motion measurement is shown for this target. The amber marker is the catalogue position.
                    {sat.core_empty !== null && sat.core_filled !== null && sat.core_empty > 0 && sat.core_filled > 0 && (
                        <>
                            {' '}
                            In {sat.core_empty} of these exposures at least one of the central 3×3 pixels is empty
                            and shows as black in the raw playback; in {sat.core_filled} all nine pixels still carry
                            a value and are drawn as they are, but their brightness is not reliable.
                        </>
                    )}
                    {sat.core_empty === 0 && sat.core_filled !== null && sat.core_filled > 0 && (
                        <>
                            {' '}
                            In all {sat.core_filled} of these exposures the central 3×3 pixels still carry a value
                            and are drawn as they are, but their brightness is not reliable.
                        </>
                    )}
                    {sat.core_filled === 0 && sat.core_empty !== null && sat.core_empty > 0 && (
                        <>
                            {' '}
                            In all {sat.core_empty} of these exposures at least one of the central 3×3 pixels is
                            empty and shows as black in the raw playback.
                        </>
                    )}
                </p>
            )}

            {fit && (
                <>
                    <table>
                        <thead>
                            <tr>
                                <th></th>
                                {fit.methods.map((m) => (
                                    <th key={m.id}>{m.label}</th>
                                ))}
                                <th>{fit.reference.source}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Proper motion east (mas/yr)</td>
                                {fit.methods.map((m) => (
                                    <td key={m.id}><span className="pair">{f(m.pm_east)} ± {f(m.pm_east_err)}</span></td>
                                ))}
                                <td>{f(fit.reference.pm_east)}</td>
                            </tr>
                            <tr>
                                <td>Proper motion north (mas/yr)</td>
                                {fit.methods.map((m) => (
                                    <td key={m.id}><span className="pair">{f(m.pm_north)} ± {f(m.pm_north_err)}</span></td>
                                ))}
                                <td>{f(fit.reference.pm_north)}</td>
                            </tr>
                            <tr>
                                <td>Parallax (mas)</td>
                                {fit.methods.map((m) => (
                                    <td key={m.id}><span className="pair">{f(m.plx)} ± {f(m.plx_err)}</span></td>
                                ))}
                                <td>{f(fit.reference.plx)}</td>
                            </tr>
                            <tr>
                                <td>Exposures used</td>
                                {fit.methods.map((m) => (
                                    <td key={m.id}>{m.n_used}</td>
                                ))}
                                <td></td>
                            </tr>
                        </tbody>
                    </table>
                    <p className="warn">
                        The measured parallax is{' '}
                        {plxSide(fit.methods.map((m) => ({ label: m.label, pct: m.plx_excess_pct })))} the{' '}
                        {fit.reference.source} value. The ± values are statistical only (bootstrap over exposures)
                        {hasLoo ? (
                            <>
                                ; leaving one epoch out moves the parallax between{' '}
                                {fit.methods
                                    .map((m) => `${f(m.plx_loo_min ?? m.plx, 0)}–${f(m.plx_loo_max ?? m.plx, 0)}`)
                                    .join(' and ')}{' '}
                                mas.
                            </>
                        ) : (
                            <>; there are too few epochs to repeat the fit with one epoch left out.</>
                        )}
                    </p>
                    <p className="detail">
                        Positions are aligned to Gaia DR3 field stars exposure by exposure. The arrow on the stacked
                        image is the measured proper motion (ePSF fit) over the {f(fit.arrow.span_years, 2)} years of
                        data, drawn {ARROW_SCALE} times longer than the real motion (
                        {f(Math.hypot(fit.arrow.dx, fit.arrow.dy), 2)} pixels) so that its direction can be read.
                    </p>
                </>
            )}

            {sm && (
                <>
                    <table className="motion">
                        <thead>
                            <tr>
                                <th>Motion (east / north, arcsec)</th>
                                <th>{'SIMBAD prediction'}</th>
                                {sm.pairs[0].methods.map((m) => (
                                    <th key={m.id}>{m.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sm.pairs.map((p) => (
                                <tr key={`${p.from}-${p.to}`}>
                                    <td>Epoch {p.from + 1} → {p.to + 1}</td>
                                    <td data-label="SIMBAD prediction">
                                        <span className="pair">{s(p.predicted.east)} / {s(p.predicted.north)}</span>
                                    </td>
                                    {p.methods.map((m) => (
                                        <td key={m.id} data-label={m.label}>
                                            <span className="pair">
                                                {s(m.east)} ± {f(m.east_err, 2)} / {s(m.north)} ± {f(m.north_err, 2)}
                                            </span>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="detail">
                        Measured on stacks of detectors 5 and 6 only (peak S/N{' '}
                        {sm.epochs.map((e) => f(e.snr_peak)).join(', ')} in the {sm.epochs.length} epochs). With{' '}
                        {sm.epochs.length} epochs a proper motion + parallax fit is not constrained. Not aligned to
                        field stars; errors are bootstrap over frames.
                    </p>
                </>
            )}

            {pe && (
                <p className="warn">
                    A fit on single exposures did not work: {pe.n_exposures} usable exposures with a median S/N of{' '}
                    {f(pe.median_snr)}, and the two position methods disagree (parallax{' '}
                    {pe.plx.map((p) => `${f(p.value, 0)} ± ${f(p.err, 0)}`).join(' and ')} mas against{' '}
                    {f(pe.reference_plx, 0)}).
                </p>
            )}

            {!saturated && !fit && !sm && !nf && (
                <p className="detail">No position or motion measurement has been made for this target.</p>
            )}
        </section>
    )
}