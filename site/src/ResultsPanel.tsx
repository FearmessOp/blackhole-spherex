import { HelpTitle } from './Help'
import { ARROW_SCALE } from './SkyPanel'
import { label, rich, t, useLang } from './i18n'
import type { Neighbour, Results } from './types'

const f = (v: number, d = 1) => v.toFixed(d)
const s = (v: number, d = 2) => (v >= 0 ? '+' : '') + v.toFixed(d)
const pct = (v: number) => (100 * v).toFixed(1) + '%'

// Flicker of constant stars and the frames left out of the raw playback (Measurement tab).
export function FlickerNote({ r }: { r: Results }) {
    useLang()
    const fl = r.flicker
    const maskPct = (100 * r.raw_dropped.max_masked_fraction).toFixed(0)
    return (
        <section className="flicker">
            <HelpTitle as="h3" help="help.flicker">
                {t('flicker.bold').replace(/\.$/, '')}
            </HelpTitle>
            <p>
                {fl
                    ? rich('flicker.text', {
                        n: fl.n_stars,
                        raw: <span className="num">{pct(fl.raw_scatter_median)}</span>,
                        ep: <span className="num">{pct(fl.epoch_std_median)}</span>
                    })
                    : t('flicker.none')}{' '}
                {r.raw_dropped.dropped > 0
                    ? t('raw.dropped', { a: r.raw_dropped.dropped, b: r.raw_dropped.total, pct: maskPct })
                    : t('raw.all', { b: r.raw_dropped.total, pct: maskPct })}
            </p>
        </section>
    )
}

// Shown directly under the short / long wavelength panels.
export function NeighbourNote({ nb }: { nb: Neighbour }) {
    useLang()
    return (
        <p className="warn">
            <b>{t('nb.bold')}</b> {t('nb.star', { id: nb.gaia_id })}
            {nb.g !== null ? t('nb.g', { g: f(nb.g, 2) }) : ''}
            {nb.short_offset_max_arcsec !== null ? t('nb.fitted', { a: f(nb.short_offset_max_arcsec, 2) }) : ''}
            {rich('nb.rest', {
                seps: nb.sep_arcsec.map((v) => f(v)).join(', '),
                n: nb.sep_arcsec.length,
                ratios: nb.amp_ratio
                    .map((v, i) => {
                        const [lo, hi] = nb.amp_ratio_range[i]
                        return `${f(v, 2)} (${f(lo, 2)}–${f(hi, 2)})`
                    })
                    .join(', '),
                label: <i>{label('Gaussian fit, neighbour modelled')}</i>
            })}
        </p>
    )
}

// "22% (windowed centroid) and 11% (ePSF fit) above the SIMBAD value" if both estimators are on the
// same side of the reference, else one side per estimator, each labelled with its method.
function plxSentence(ms: { label: string; pct: number }[], source: string): string {
    const above = ms.every((m) => m.pct >= 0)
    const below = ms.every((m) => m.pct < 0)
    if (above || below) {
        const list = ms
            .map((m) => t('res.plx.item.same', { pct: f(Math.abs(m.pct), 0), label: label(m.label) }))
            .join(t('and'))
        return t('res.plx.same', { list, side: t(above ? 'res.above' : 'res.below'), source })
    }
    const list = ms
        .map((m) =>
            t('res.plx.item', {
                pct: f(Math.abs(m.pct), 0),
                side: t(m.pct >= 0 ? 'res.above' : 'res.below'),
                label: label(m.label)
            })
        )
        .join(t('and'))
    return t('res.plx.mixed', { list, source })
}

export default function ResultsPanel({ r }: { r: Results }) {
    useLang()
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
            <HelpTitle as="h3" help="help.measured">
                {t('res.title')}
            </HelpTitle>

            {off && (
                <p className="warn">
                    <b>{t('res.off.bold')}</b>{' '}
                    {t('res.off', {
                        offs: off.offset_arcsec.map((v) => f(v)).join(', '),
                        n: off.offset_arcsec.length,
                        lim: f(off.limit_arcsec, 0)
                    })}
                </p>
            )}

            {saturated && sat && fit && <p className="warn">{t('res.sat.fit', { a: sat.overflow, b: sat.exposures })}</p>}

            {nf && (
                <p className="warn">
                    {t('res.nofit', {
                        u: nf.usable,
                        b: nf.exposures,
                        per: nf.usable_per_epoch.join(', '),
                        n: nf.usable_per_epoch.length,
                        me: nf.min_exposures,
                        mp: nf.min_epochs,
                        mpe: nf.min_per_epoch
                    })}
                </p>
            )}

            {saturated && sat && !fit && (
                <p className="warn">
                    {t('res.sat', { a: sat.overflow, b: sat.exposures })}
                    {sat.core_empty !== null && sat.core_filled !== null && sat.core_empty > 0 && sat.core_filled > 0 && (
                        <> {t('res.sat.mixed', { e: sat.core_empty, f: sat.core_filled })}</>
                    )}
                    {sat.core_empty === 0 && sat.core_filled !== null && sat.core_filled > 0 && (
                        <> {t('res.sat.filled', { f: sat.core_filled })}</>
                    )}
                    {sat.core_filled === 0 && sat.core_empty !== null && sat.core_empty > 0 && (
                        <> {t('res.sat.empty', { e: sat.core_empty })}</>
                    )}
                </p>
            )}

            {fit && (
                <>
                    <table className="motion">
                        <thead>
                            <tr>
                                <th></th>
                                {fit.methods.map((m) => (
                                    <th key={m.id}>{label(m.label)}</th>
                                ))}
                                <th>{fit.reference.source}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>{t('res.row.pme')}</td>
                                {fit.methods.map((m) => (
                                    <td key={m.id} data-label={label(m.label)}><span className="pair">{f(m.pm_east)} ± {f(m.pm_east_err)}</span></td>
                                ))}
                                <td data-label={fit.reference.source}>{f(fit.reference.pm_east)}</td>
                            </tr>
                            <tr>
                                <td>{t('res.row.pmn')}</td>
                                {fit.methods.map((m) => (
                                    <td key={m.id} data-label={label(m.label)}><span className="pair">{f(m.pm_north)} ± {f(m.pm_north_err)}</span></td>
                                ))}
                                <td data-label={fit.reference.source}>{f(fit.reference.pm_north)}</td>
                            </tr>
                            <tr>
                                <td>{t('res.row.plx')}</td>
                                {fit.methods.map((m) => (
                                    <td key={m.id} data-label={label(m.label)}><span className="pair">{f(m.plx)} ± {f(m.plx_err)}</span></td>
                                ))}
                                <td data-label={fit.reference.source}>{f(fit.reference.plx)}</td>
                            </tr>
                            <tr>
                                <td>{t('res.row.n')}</td>
                                {fit.methods.map((m) => (
                                    <td key={m.id} data-label={label(m.label)}>{m.n_used}</td>
                                ))}
                                <td></td>
                            </tr>
                        </tbody>
                    </table>
                    <p className="warn">
                        {plxSentence(
                            fit.methods.map((m) => ({ label: m.label, pct: m.plx_excess_pct })),
                            fit.reference.source
                        )}{' '}
                        {t('res.stat')}
                        {hasLoo
                            ? t('res.plx.loo', {
                                ranges: fit.methods
                                    .map((m) => `${f(m.plx_loo_min ?? m.plx, 0)}–${f(m.plx_loo_max ?? m.plx, 0)}`)
                                    .join(t('and'))
                            })
                            : t('res.plx.noloo')}
                    </p>
                    <p className="detail">
                        {t('res.arrow', {
                            yrs: f(fit.arrow.span_years, 2),
                            k: ARROW_SCALE,
                            px: f(Math.hypot(fit.arrow.dx, fit.arrow.dy), 2)
                        })}
                    </p>
                </>
            )}

            {sm && (
                <>
                    <table className="motion" data-unit={t('quick.motion.unit')}>
                        <thead>
                            <tr>
                                <th>{t('quick.motion.head')}</th>
                                <th>{t('res.motion.pred', { source: 'SIMBAD' })}</th>
                                {sm.pairs[0].methods.map((m) => (
                                    <th key={m.id}>{label(m.label)}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sm.pairs.map((p) => (
                                <tr key={`${p.from}-${p.to}`}>
                                    <td data-unit={t('quick.motion.unit')}>{t('quick.motion.pair', { a: p.from + 1, b: p.to + 1 })}</td>
                                    <td data-label={t('res.motion.pred', { source: 'SIMBAD' })}>
                                        <span className="pair">{s(p.predicted.east)} / {s(p.predicted.north)}</span>
                                    </td>
                                    {p.methods.map((m) => (
                                        <td key={m.id} data-label={label(m.label)}>
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
                        {t('res.motion.note', {
                            snr: sm.epochs.map((e) => f(e.snr_peak)).join(', '),
                            n: sm.epochs.length
                        })}
                    </p>
                </>
            )}

            {pe && (
                <p className="warn">
                    {t('res.pe', {
                        n: pe.n_exposures,
                        snr: f(pe.median_snr),
                        plx: pe.plx.map((p) => `${f(p.value, 0)} ± ${f(p.err, 0)}`).join(t('and')),
                        ref: f(pe.reference_plx, 0)
                    })}
                </p>
            )}

            {!saturated && !fit && !sm && !nf && <p className="detail">{t('res.none')}</p>}
        </section>
    )
}