import { useEffect, useState } from 'react'

// Ten fast movers measured with the Epsilon Indi B fit and compared with SIMBAD.
// Every number comes from data/fast_movers.json, written by pipeline/fast_movers_table.py
// (log: logs/fast_movers_table.log). Targets that disagree or could not be judged stay in the table.

type Key = 'pm_east' | 'pm_north' | 'plx'
type MethodId = 'psf' | 'win'
type FitMethod = { id: MethodId; n_used: number; pm_both_within2: boolean | null } & Record<Key, number> &
    Record<`${Key}_err` | `${Key}_diff`, number> &
    Record<`${Key}_within2`, boolean | null>
type Row = {
    slug: string
    name: string
    reference: Record<Key, number>
    exposures: number | null
    usable: number | null
    usable_per_epoch: number[] | null
    passes_selection: boolean
    fit: { methods: FitMethod[] } | null
}
type Count = { n_targets: number; n_fitted: number; pm_both_within2: number } & Record<`${Key}_within2`, number>
type Table = {
    selection: { min_exposures: number; min_epochs: number; min_per_epoch: number }
    summary: Record<MethodId, Count>
    targets: Row[]
}

const URL = `${import.meta.env.BASE_URL}data/fast_movers.json`
const LOG = 'logs/fast_movers_table.log'
const REPO = 'https://github.com/FearmessOp/blackhole-spherex/blob/main/'
const KEYS: [Key, string][] = [
    ['pm_east', 'Proper motion east (mas/yr)'],
    ['pm_north', 'Proper motion north (mas/yr)'],
    ['plx', 'Parallax (mas)']]
const METHODS: [MethodId, string][] = [
    ['psf', 'ePSF fit'],
    ['win', 'Windowed centroid']]

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`

export default function FastMoversPanel({ onOpen }: { onOpen: (slug: string) => void }) {
    const [data, setData] = useState<Table | null>(null)
    const [method, setMethod] = useState<MethodId>('psf')

    useEffect(() => {
        let cancelled = false
        fetch(URL)
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null)
            .then((body) => {
                if (!cancelled && Array.isArray(body?.targets) && body.summary) setData(body as Table)
            })
        return () => {
            cancelled = true
        }
    }, [])

    if (!data) return null
    const s = data.summary[method]
    const sel = data.selection

    return (
        <section className="results validation">
            <h2>Validation on fast movers</h2>
            <p>
                The fit used for Epsilon Indi B (proper motion and parallax, aligned to Gaia field stars in every
                exposure) was run without changes on {s.n_targets} more stars with a large catalogue motion and
                compared with SIMBAD. A target is judged if it has at least {sel.min_exposures} usable exposures, in at
                least {sel.min_epochs} epochs of at least {sel.min_per_epoch}; {s.n_fitted} of {s.n_targets} are.
                Of these, both proper motion components are within 2 errors of SIMBAD for {s.pm_both_within2}, the
                parallax for {s.plx_within2}. The errors are statistical only (bootstrap over exposures).
            </p>
            <div className="row">
                {METHODS.map(([m, label]) => (
                    <button key={m} className={m === method ? 'on' : ''} onClick={() => setMethod(m)}>
                        {label}
                    </button>
                ))}
            </div>
            <table className="stars">
                <thead>
                    <tr>
                        <th>Target</th>
                        <th>Exposures used</th>
                        {KEYS.map(([k, label]) => (
                            <th key={k}>{label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.targets.map((t) => {
                        const m = t.passes_selection ? t.fit?.methods.find((x) => x.id === method) : undefined
                        return (
                            <tr key={t.slug}>
                                <td>
                                    <button className="link" onClick={() => onOpen(t.slug)}>
                                        {t.name}
                                    </button>
                                </td>
                                {m ? (
                                    <>
                                        <td>
                                            {m.n_used} of {t.exposures}
                                        </td>
                                        {KEYS.map(([k]) => (
                                            <td key={k} className={m[`${k}_within2`] === false ? 'out' : undefined}>
                                                <span className="pair">
                                                    {signed(m[k])} ± {m[`${k}_err`].toFixed(1)}
                                                </span>{' '}
                                                <span className="pair">
                                                    SIMBAD {signed(t.reference[k])} ({signed(m[`${k}_diff`])})
                                                </span>
                                            </td>
                                        ))}
                                    </>
                                ) : (
                                    <td colSpan={KEYS.length + 1}>
                                        Not judged: {t.usable ?? 0} of {t.exposures ?? 0} exposures usable
                                        {t.usable_per_epoch ? ` (${t.usable_per_epoch.join(', ')} per epoch)` : ''}. SIMBAD:{' '}
                                        {KEYS.map(([k]) => signed(t.reference[k])).join(', ')}.
                                    </td>
                                )}
                            </tr>
                        )
                    })}
                </tbody>
            </table>
            <p className="note">
                Each cell: measured ± error, the SIMBAD value, and the difference in brackets. Amber cells are more
                than 2 errors from SIMBAD. "Usable" means a clean, unsaturated core measured by both position methods.
                Source of these numbers: <a href={`${REPO}${LOG}`}>{LOG}</a>
            </p>
        </section>
    )
}