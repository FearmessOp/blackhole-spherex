import { useEffect, useState } from 'react'
import { HelpTitle } from './Help'
import { label, t, useLang, type Key as TKey } from './i18n'

// Control test on Gaia field stars. Every number comes from data/validation.json,
// written by pipeline/validation_field_stars.py (log: logs/validation_field_stars.log).

type Param = { unit: string; median_diff: number; scatter: number; median_err: number; within_2_err: number }
type Key = 'pm_east' | 'pm_north' | 'plx'
type Summary = Record<Key, Param> & {
    n_stars: number
    all_three_within_2_err: number
    expected_within_2_err: number
    expected_all_three: number
}
type Method = 'psf' | 'win'
type Cell = [number, number, number, number] // Gaia, measured, error, difference in errors
type StarFit = Record<Key, Cell> & { n: number; rms: number }
type Star = { id: string; g: number; psf: StarFit; win: StarFit }
type Field = {
    slug: string
    summary: Record<Method, Summary>
    not_fitted: { source_id: string; reason: string }[]
    stars: Star[]
}
type Validation = {
    selection: { min_exposures: number; min_epochs: number; min_per_epoch: number; min_other_stars: number }
    log: string
    all: { aligned: Record<Method, Summary>; not_aligned: Record<Method, Summary> }
    fields: Field[]
}

const URL = `${import.meta.env.BASE_URL}data/validation.json`
const REPO = 'https://github.com/FearmessOp/blackhole-spherex/blob/main/'
const KEYS: [Key, TKey][] = [
    ['pm_east', 'val.row.pme'],
    ['pm_north', 'val.row.pmn'],
    ['plx', 'val.row.plx']]
const METHODS: [Method, string][] = [
    ['psf', 'ePSF fit'],
    ['win', 'Windowed centroid']]

const signed = (v: number, digits = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`

function StarCell({ c }: { c: Cell }) {
    return (
        <td className={Math.abs(c[3]) > 2 ? 'out' : undefined}>
            <span className="pair">
                {signed(c[0])} / {signed(c[1])} ± {c[2].toFixed(1)}
            </span>{' '}
            <span className="pair">({signed(c[3], 2)})</span>
        </td>
    )
}

export default function ValidationPanel({ names }: { names: Record<string, string> }) {
    useLang()
    const [data, setData] = useState<Validation | null>(null)
    const [method, setMethod] = useState<Method>('psf')

    useEffect(() => {
        let cancelled = false
        fetch(URL)
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null)
            .then((body) => {
                if (!cancelled && body?.all?.aligned) setData(body as Validation)
            })
        return () => {
            cancelled = true
        }
    }, [])

    if (!data) return null
    const s = data.all.aligned[method]
    const raw = data.all.not_aligned
    const sel = data.selection
    const notFitted = data.fields.reduce((n, f) => n + f.not_fitted.length, 0)

    return (
        <section className="results validation">
            <HelpTitle as="h2" help="help.validation">
                {t('val.title')}
            </HelpTitle>
            <p>
                {t('val.intro', {
                    stars: s.n_stars,
                    fields: data.fields.length,
                    other: sel.min_other_stars,
                    me: sel.min_exposures,
                    mp: sel.min_epochs,
                    mpe: sel.min_per_epoch,
                    nf: notFitted
                })}
            </p>
            <div className="row">
                {METHODS.map(([m, name]) => (
                    <button key={m} type="button" className={m === method ? 'on' : ''} onClick={() => setMethod(m)}>
                        {label(name)}
                    </button>
                ))}
            </div>
            <table>
                <thead>
                    <tr>
                        <th>{t('val.head.diff', { n: s.n_stars })}</th>
                        <th>{t('val.head.median')}</th>
                        <th>{t('val.head.scatter')}</th>
                        <th>{t('val.head.err')}</th>
                        <th>{t('val.head.within')}</th>
                        <th>{t('val.head.expected')}</th>
                    </tr>
                </thead>
                <tbody>
                    {KEYS.map(([k, lk]) => (
                        <tr key={k}>
                            <td>{t(lk)}</td>
                            <td>
                                {signed(s[k].median_diff)} {s[k].unit}
                            </td>
                            <td>{s[k].scatter.toFixed(1)}</td>
                            <td>{s[k].median_err.toFixed(1)}</td>
                            <td>{t('val.of', { a: s[k].within_2_err, b: s.n_stars })}</td>
                            <td>{s.expected_within_2_err.toFixed(1)}</td>
                        </tr>
                    ))}
                    <tr>
                        <td>{t('val.all3')}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td>{t('val.of', { a: s.all_three_within_2_err, b: s.n_stars })}</td>
                        <td>{s.expected_all_three.toFixed(1)}</td>
                    </tr>
                </tbody>
            </table>
            <p className="note">{t('val.note')}</p>
            <p className="warn">
                {t('val.noalign', {
                    psf: signed(raw.psf.plx.median_diff),
                    win: signed(raw.win.plx.median_diff),
                    npsf: raw.psf.plx.within_2_err,
                    nwin: raw.win.plx.within_2_err,
                    n: raw.psf.n_stars
                })}
            </p>
            <h3>{t('val.byfield')}</h3>
            <table>
                <thead>
                    <tr>
                        <th>{t('val.field')}</th>
                        <th>{t('val.fitted')}</th>
                        {KEYS.map(([k, lk]) => (
                            <th key={k}>{t(lk)}</th>
                        ))}
                        <th>{t('val.allthree')}</th>
                        <th>{t('val.notfitted')}</th>
                    </tr>
                </thead>
                <tbody>
                    {data.fields.map((f) => (
                        <tr key={f.slug}>
                            <td>{names[f.slug] ?? f.slug}</td>
                            <td>{f.summary[method].n_stars}</td>
                            {KEYS.map(([k]) => (
                                <td key={k}>{f.summary[method][k].within_2_err}</td>
                            ))}
                            <td>{f.summary[method].all_three_within_2_err}</td>
                            <td>{f.not_fitted.length}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <details>
                <summary>{t('val.allstars', { n: s.n_stars })}</summary>
                <p className="note">{t('val.cell.note')}</p>
                {data.fields.map((f) => (
                    <div key={f.slug}>
                        <h3>{t('val.fieldname', { name: names[f.slug] ?? f.slug })}</h3>
                        <table className="stars">
                            <thead>
                                <tr>
                                    <th>Gaia DR3</th>
                                    <th>G</th>
                                    <th>{t('val.col.exposures')}</th>
                                    {KEYS.map(([k, lk]) => (
                                        <th key={k}>{t(lk)}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {f.stars.map((st) => (
                                    <tr key={st.id}>
                                        <td>{st.id}</td>
                                        <td>{st.g.toFixed(2)}</td>
                                        <td>{st[method].n}</td>
                                        {KEYS.map(([k]) => (
                                            <StarCell key={k} c={st[method][k]} />
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {f.not_fitted.map((n) => (
                            <p key={n.source_id} className="note">
                                {t('val.nf.row', { id: n.source_id, reason: n.reason })}
                            </p>
                        ))}
                    </div>
                ))}
            </details>
            <p className="note">
                {t('val.source')} <a href={`${REPO}${data.log}`}>{data.log}</a>
            </p>
        </section>
    )
}