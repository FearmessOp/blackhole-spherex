import { useEffect, useState } from 'react'

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
const KEYS: [Key, string][] = [
    ['pm_east', 'Proper motion east'],
    ['pm_north', 'Proper motion north'],
    ['plx', 'Parallax']]
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
            <h2>Validation</h2>
            <p>
                Control test: the proper motion and parallax fit used for the targets was run on {s.n_stars} Gaia DR3
                field stars in the {data.fields.length} prepared fields and compared with the Gaia values. Each star was
                aligned with at least {sel.min_other_stars} other field stars in the same exposure, never with itself.
                Selection, fixed before the results were seen: at least {sel.min_exposures} exposures, in at least{' '}
                {sel.min_epochs} epochs of at least {sel.min_per_epoch} exposures. {notFitted} stars did not pass and
                are listed below. Stars that disagree with Gaia stay in the tables.
            </p>
            <div className="row">
                {METHODS.map(([m, label]) => (
                    <button key={m} className={m === method ? 'on' : ''} onClick={() => setMethod(m)}>
                        {label}
                    </button>
                ))}
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Measured minus Gaia, {s.n_stars} stars</th>
                        <th>Median</th>
                        <th>Scatter</th>
                        <th>Median error of one fit</th>
                        <th>Within 2 errors</th>
                        <th>Expected</th>
                    </tr>
                </thead>
                <tbody>
                    {KEYS.map(([k, label]) => (
                        <tr key={k}>
                            <td>{label}</td>
                            <td>
                                {signed(s[k].median_diff)} {s[k].unit}
                            </td>
                            <td>{s[k].scatter.toFixed(1)}</td>
                            <td>{s[k].median_err.toFixed(1)}</td>
                            <td>
                                {s[k].within_2_err} of {s.n_stars}
                            </td>
                            <td>{s.expected_within_2_err.toFixed(1)}</td>
                        </tr>
                    ))}
                    <tr>
                        <td>All three together</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td>
                            {s.all_three_within_2_err} of {s.n_stars}
                        </td>
                        <td>{s.expected_all_three.toFixed(1)}</td>
                    </tr>
                </tbody>
            </table>
            <p className="note">
                Scatter is 1.4826 × the median absolute deviation; errors are bootstrap errors over exposures.
                "Expected" is the count for Gaussian errors of the right size (for all three: if the three were
                independent). These field stars move by less than the error of one fit, so the test shows whether the
                fit invents motion and whether the errors have the right size. It does not show a large motion being
                recovered; for that see the targets above.
            </p>
            <p className="warn">
                Without the alignment the parallax is wrong: the median difference from Gaia is{' '}
                {signed(raw.psf.plx.median_diff)} mas (ePSF fit) and {signed(raw.win.plx.median_diff)} mas (windowed
                centroid), and {raw.psf.plx.within_2_err} and {raw.win.plx.within_2_err} of {raw.psf.n_stars} stars are
                within 2 errors.
            </p>
            <h3>By field, stars within 2 errors</h3>
            <table>
                <thead>
                    <tr>
                        <th>Field</th>
                        <th>Stars fitted</th>
                        {KEYS.map(([k, label]) => (
                            <th key={k}>{label}</th>
                        ))}
                        <th>All three</th>
                        <th>Not fitted</th>
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
                <summary>All {s.n_stars} stars, one row each</summary>
                <p className="note">
                    Each cell: Gaia / measured ± error (difference in errors). Proper motion in mas/yr, parallax in mas.
                    Amber cells are more than 2 errors from Gaia.
                </p>
                {data.fields.map((f) => (
                    <div key={f.slug}>
                        <h3>{names[f.slug] ?? f.slug} field</h3>
                        <table className="stars">
                            <thead>
                                <tr>
                                    <th>Gaia DR3</th>
                                    <th>G</th>
                                    <th>Exposures</th>
                                    {KEYS.map(([k, label]) => (
                                        <th key={k}>{label}</th>
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
                                Not fitted: Gaia DR3 {n.source_id}, {n.reason}
                            </p>
                        ))}
                    </div>
                ))}
            </details>
            <p className="note">
                Source of these numbers: <a href={`${REPO}${data.log}`}>{data.log}</a>
            </p>
        </section>
    )
}