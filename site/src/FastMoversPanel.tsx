import { useEffect, useState } from 'react'
import { label, t, useLang, type Key as TKey } from './i18n'

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
const KEYS: [Key, TKey][] = [
    ['pm_east', 'res.row.pme'],
    ['pm_north', 'res.row.pmn'],
    ['plx', 'res.row.plx']]
const METHODS: [MethodId, string][] = [
    ['psf', 'ePSF fit'],
    ['win', 'Windowed centroid']]

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`

export default function FastMoversPanel({ onOpen }: { onOpen: (slug: string) => void }) {
    useLang()
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
            <h2>{t('fast.title')}</h2>
            <p>
                {t('fast.intro', {
                    n: s.n_targets,
                    me: sel.min_exposures,
                    mp: sel.min_epochs,
                    mpe: sel.min_per_epoch,
                    fitted: s.n_fitted,
                    both: s.pm_both_within2,
                    plx: s.plx_within2
                })}
            </p>
            <div className="row">
                {METHODS.map(([m, name]) => (
                    <button key={m} type="button" className={m === method ? 'on' : ''} onClick={() => setMethod(m)}>
                        {label(name)}
                    </button>
                ))}
            </div>
            <table className="stars">
                <thead>
                    <tr>
                        <th>{t('fast.target')}</th>
                        <th>{t('fast.used')}</th>
                        {KEYS.map(([k, lk]) => (
                            <th key={k}>{t(lk)}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.targets.map((row) => {
                        const m = row.passes_selection ? row.fit?.methods.find((x) => x.id === method) : undefined
                        return (
                            <tr key={row.slug}>
                                <td>
                                    <button type="button" className="link" onClick={() => onOpen(row.slug)}>
                                        {row.name}
                                    </button>
                                </td>
                                {m ? (
                                    <>
                                        <td>{t('val.of', { a: m.n_used, b: row.exposures ?? '?' })}</td>
                                        {KEYS.map(([k]) => (
                                            <td key={k} className={m[`${k}_within2`] === false ? 'out' : undefined}>
                                                <span className="pair">
                                                    {signed(m[k])} ± {m[`${k}_err`].toFixed(1)}
                                                </span>{' '}
                                                <span className="pair">
                                                    SIMBAD {signed(row.reference[k])} ({signed(m[`${k}_diff`])})
                                                </span>
                                            </td>
                                        ))}
                                    </>
                                ) : (
                                    <td colSpan={KEYS.length + 1}>
                                        {t('fast.notjudged', {
                                            u: row.usable ?? 0,
                                            b: row.exposures ?? 0,
                                            per: row.usable_per_epoch
                                                ? t('fast.perepoch', { list: row.usable_per_epoch.join(', ') })
                                                : '',
                                            ref: KEYS.map(([k]) => signed(row.reference[k])).join(', ')
                                        })}
                                    </td>
                                )}
                            </tr>
                        )
                    })}
                </tbody>
            </table>
            <p className="note">
                {t('fast.note')} {t('val.source')} <a href={`${REPO}${LOG}`}>{LOG}</a>
            </p>
        </section>
    )
}