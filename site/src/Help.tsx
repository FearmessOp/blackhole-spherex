import { useEffect, useState, type ReactNode } from 'react'
import { getLang, setLang, t, useLang, type Key } from './i18n'
import type { Meta, Results } from './types'

// Small shared pieces of the page: a heading with a "?" button, the panel
// "How to read this page" and the EN / TR switch.

type Tag = 'h2' | 'h3' | 'h4' | 'figcaption'

// A section heading with a "?" button; the explanation (at most two sentences) opens under it.
export function HelpTitle({ as, help, className, children }: { as: Tag; help: Key; className?: string; children: ReactNode }) {
    useLang()
    const [open, setOpen] = useState(false)
    const Heading = as
    return (
        <>
            <Heading className={`head${className ? ` ${className}` : ''}`}>
                <span>{children}</span>
                <button
                    type="button"
                    className={`help-btn${open ? ' on' : ''}`}
                    aria-expanded={open}
                    aria-label={t('help.button')}
                    title={t('help.button')}
                    onClick={() => setOpen(!open)}
                >
                    ?
                </button>
            </Heading>
            {open && <p className="help-text">{t(help)}</p>}
        </>
    )
}

export function LangSwitch() {
    const lang = useLang()
    return (
        <div className="lang" role="group" aria-label="Language">
            {(['en', 'tr'] as const).map((l) => (
                <button key={l} type="button" className={l === lang ? 'on' : ''} aria-pressed={l === lang} onClick={() => setLang(l)}>
                    {l.toUpperCase()}
                </button>
            ))}
        </div>
    )
}

// Numbers quoted in the panel, all read from the site's data files.
type HowToData = {
    name: string
    scale: number
    raw: number | null
    ep: number | null
    nUsed: number | null
    stars: number
    all3: number
    fitted: number
    both: number
}

const DATA = `${import.meta.env.BASE_URL}data/`
const EXAMPLE = 'eps-indi-b' // the target with a full fit; its numbers illustrate the answers
const pct = (v: number) => `${(100 * v).toFixed(1)}%`

async function loadHowTo(): Promise<HowToData> {
    const get = (path: string) => fetch(DATA + path).then((r) => (r.ok ? r.json() : Promise.reject(new Error(path))))
    const [meta, res, val, fast] = await Promise.all([
        get(`${EXAMPLE}/meta.json`) as Promise<Meta>,
        get(`${EXAMPLE}/results.json`) as Promise<Results>,
        get('validation.json'),
        get('fast_movers.json')
    ])
    const psf = res.fit?.methods.find((m) => m.id === 'psf') ?? null
    return {
        name: meta.name,
        scale: meta.grid.scale_arcsec,
        raw: res.flicker?.raw_scatter_median ?? null,
        ep: res.flicker?.epoch_std_median ?? null,
        nUsed: psf?.n_used ?? null,
        stars: val.all.aligned.psf.n_stars,
        all3: val.all.aligned.psf.all_three_within_2_err,
        fitted: fast.summary.psf.n_fitted,
        both: fast.summary.psf.pm_both_within2
    }
}

// Five short answers for a visitor who is new to the page.
export function HowTo({ onClose }: { onClose: () => void }) {
    useLang()
    const [d, setD] = useState<HowToData | 'failed' | null>(null)
    useEffect(() => {
        let cancelled = false
        loadHowTo()
            .then((v) => {
                if (!cancelled) setD(v)
            })
            .catch(() => {
                if (!cancelled) setD('failed')
            })
        return () => {
            cancelled = true
        }
    }, [])

    let body: ReactNode = <p className="note">{t('load.target')}</p>
    if (d === 'failed') body = <p className="warn">{t('load.failed')}</p>
    else if (d) {
        const items: [Key, string][] = [
            ['howto.q1', t('howto.a1', { scale: d.scale })],
            ['howto.q2', t('howto.a2', { name: d.name, raw: d.raw === null ? '?' : pct(d.raw), ep: d.ep === null ? '?' : pct(d.ep) })],
            ['howto.q3', t('howto.a3')],
            ['howto.q4', t('howto.a4', { name: d.name, n: d.nUsed ?? '?' })],
            ['howto.q5', t('howto.a5', { stars: d.stars, all3: d.all3, fitted: d.fitted, both: d.both })]
        ]
        body = (
            <ol className="howto-list">
                {items.map(([q, a]) => (
                    <li key={q}>
                        <b>{t(q)}</b>
                        <span>{a}</span>
                    </li>
                ))}
            </ol>
        )
    }
    return (
        <section className="howto" lang={getLang()}>
            <div className="howto-head">
                <h2>{t('howto.title')}</h2>
                <button type="button" onClick={onClose}>
                    {t('help.close')}
                </button>
            </div>
            {body}
        </section>
    )
}