import type { Results } from './types'

const f = (v: number, d = 1) => v.toFixed(d)
const s = (v: number, d = 2) => (v >= 0 ? '+' : '') + v.toFixed(d)
const pct = (v: number) => (100 * v).toFixed(1) + '%'

// Flicker line shown under the two image panels.
export function FlickerNote({ r }: { r: Results }) {
    const fl = r.flicker
    return (
        <p className="flicker">
            {fl ? (
                <>
                    <b>Flicker.</b> {fl.n_stars} constant Gaia stars in this field change by{' '}
                    <span className="num">{pct(fl.raw_scatter_median)}</span> from one raw exposure to the next
                    (each exposure is at a different wavelength) and by{' '}
                    <span className="num">{pct(fl.epoch_std_median)}</span> between epoch means. Medians of the
                    per-star scatter; epoch means are averages of aperture fluxes, not measured on the stacked image.
                </>
            ) : (
                <>
                    <b>Flicker.</b> Not measured for this field yet.
                </>
            )}{' '}
            Raw playback leaves out {r.raw_dropped.dropped} of {r.raw_dropped.total} exposures that have more
            than half of their pixels masked.
        </p>
    )
}

export default function ResultsPanel({ r }: { r: Results }) {
    const sat = r.saturation
    const saturated = sat !== null && sat.overflow > sat.exposures / 2
    const fit = r.fit
    const sm = r.stack_motion
    const pe = r.per_exposure_fit

    return (
        <section className="results">
            <h3>Measured</h3>

            {saturated && sat && (
                <p className="warn">
                    Saturated target: the OVERFLOW flag is set at the target position in {sat.overflow} of{' '}
                    {sat.exposures} exposures. Too few exposures have an unsaturated core to measure a motion,
                    so no motion measurement is shown for this target. The amber marker is the catalogue position.
                    {sat.core_empty !== null && sat.core_filled !== null && (
                        <>
                            {' '}
                            In {sat.core_empty} of these exposures at least one of the central 3×3 pixels is empty
                            and shows as black in the raw playback; in {sat.core_filled} all nine pixels still carry
                            a value and are drawn as they are, but their brightness is not reliable.
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
                        The measured parallax is {fit.methods.map((m) => f(m.plx_excess_pct, 0) + '%').join(' and ')} above
                        the {fit.reference.source} value. The ± values are statistical only (bootstrap over exposures);
                        leaving one epoch out moves the parallax between{' '}
                        {fit.methods.map((m) => `${f(m.plx_loo_min ?? m.plx, 0)}–${f(m.plx_loo_max ?? m.plx, 0)}`).join(' and ')} mas.
                    </p>
                    <p className="detail">
                        Positions are aligned to Gaia DR3 field stars exposure by exposure. The arrow on the stacked
                        image is the measured proper motion (ePSF fit) over the {f(fit.arrow.span_years, 2)} years of data.
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
                                            <span className="pair">{s(m.east)} ± {f(m.east_err, 2)} /</span>{' '}
                                            <span className="pair">{s(m.north)} ± {f(m.north_err, 2)}</span>
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
                    {sm.neighbour && (
                        <p className="warn">
                            Nearby star: Gaia DR3 {sm.neighbour.gaia_id}
                            {sm.neighbour.g !== null && <> (G = {f(sm.neighbour.g, 2)})</>} lies{' '}
                            {sm.neighbour.sep_arcsec.map((v) => f(v)).join(', ')} arcsec from the predicted target
                            position in the {sm.neighbour.sep_arcsec.length} epochs; the target is moving towards it.
                            It is the bright source next to the marker in the short-wavelength stack
                            {sm.neighbour.short_offset_max_arcsec !== null && (
                                <> (fitted within {f(sm.neighbour.short_offset_max_arcsec, 2)} arcsec of its Gaia position)</>
                            )}
                            . On the long-wavelength stacks it has{' '}
                            {sm.neighbour.amp_ratio
                                .map((v, i) => {
                                    const [lo, hi] = sm.neighbour!.amp_ratio_range[i]
                                    return `${f(v, 2)} (${f(lo, 2)}–${f(hi, 2)})`
                                })
                                .join(', ')}{' '}
                            of the target's amplitude (16–84% bootstrap range in brackets) and pulls a single-source
                            measurement towards itself. The measurement labelled <i>Gaussian fit, neighbour modelled</i>{' '}
                            fits both sources, with the star fixed at its Gaia position and one shared width; where the
                            range is wide the two sources are not well separated.
                        </p>
                    )}
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

            {!saturated && !fit && !sm && (
                <p className="detail">No position or motion measurement has been made for this target.</p>
            )}
        </section>
    )
}