import { useEffect, useRef, useState, type FormEvent } from 'react'
import BlinkView, { TABS, type Tab } from './BlinkView'
import FastMoversPanel from './FastMoversPanel'
import FindMover from './FindMover'
import { HowTo, LangSwitch } from './Help'
import QuickLookView, { type Query } from './QuickLookView'
import ValidationPanel from './ValidationPanel'
import { t, useLang, withLang } from './i18n'
import type { TargetEntry } from './types'

type IndexState =
    | { status: 'loading' }
    | { status: 'empty' }
    | { status: 'ready'; targets: TargetEntry[] }

// What the page shows is written in the URL: ?target=<name>, ?ra=<deg>&dec=<deg> or ?guide=1.
// ?lang=tr is kept in every address the page writes, so that a shared link keeps the language.
type Route =
    | { kind: 'none' }
    | { kind: 'name'; name: string }
    | { kind: 'pos'; ra: number; dec: number }
    | { kind: 'guide' }
    | { kind: 'bad' }

const INDEX_URL = `${import.meta.env.BASE_URL}data/index.json`

const validPos = (ra: number, dec: number) =>
    Number.isFinite(ra) && Number.isFinite(dec) && ra >= 0 && ra < 360 && dec >= -90 && dec <= 90

function readRoute(): Route {
    const q = new URLSearchParams(window.location.search)
    if (q.has('guide')) return { kind: 'guide' }
    const name = (q.get('target') ?? '').trim()
    if (name) return { kind: 'name', name }
    if (!q.has('ra') && !q.has('dec')) return { kind: 'none' }
    const ra = Number(q.get('ra') ?? 'x')
    const dec = Number(q.get('dec') ?? 'x')
    return validPos(ra, dec) ? { kind: 'pos', ra, dec } : { kind: 'bad' }
}

function routeUrl(r: Route): string {
    const path = window.location.pathname
    if (r.kind === 'guide') return withLang(`${path}?guide=1`)
    if (r.kind === 'name') return withLang(`${path}?target=${encodeURIComponent(r.name)}`)
    if (r.kind === 'pos') return withLang(`${path}?ra=${r.ra}&dec=${r.dec}`)
    return withLang(path)
}

export default function App() {
    useLang()
    const [index, setIndex] = useState<IndexState>({ status: 'loading' })
    const [route, setRoute] = useState<Route>(readRoute)
    const [text, setText] = useState('')
    const [badInput, setBadInput] = useState(false)
    const [howTo, setHowTo] = useState(false)
    const searchInput = useRef<HTMLInputElement>(null)

    useEffect(() => {
        let cancelled = false
        fetch(INDEX_URL)
            .then(async (res) => {
                if (!res.ok) return null
                try {
                    return (await res.json()) as { targets?: TargetEntry[] }
                } catch {
                    // The dev server answers unknown paths with index.html: not JSON.
                    return null
                }
            })
            .catch(() => null)
            .then((body) => {
                if (cancelled) return
                const targets = body?.targets ?? []
                setIndex(targets.length ? { status: 'ready', targets } : { status: 'empty' })
            })
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        const onPop = () => setRoute(readRoute())
        window.addEventListener('popstate', onPop)
        return () => window.removeEventListener('popstate', onPop)
    }, [])

    const go = (r: Route) => {
        window.history.pushState(null, '', routeUrl(r))
        setRoute(r)
    }

    // Leaving the guide shows the tool as it opens; its last screen sends the visitor to the search box.
    const leaveGuide = (toSearch: boolean) => {
        go({ kind: 'none' })
        if (toSearch) {
            window.scrollTo({ top: 0 })
            window.setTimeout(() => searchInput.current?.focus(), 0)
        }
    }

    const submit = (ev: FormEvent) => {
        ev.preventDefault()
        const value = text.trim()
        if (!value) return
        // Two numbers are a position in degrees; anything else is a name for SIMBAD.
        const m = /^([+-]?\d+(?:\.\d+)?)\s*[,\s]\s*([+-]?\d+(?:\.\d+)?)$/.exec(value)
        if (m) {
            const ra = Number(m[1])
            const dec = Number(m[2])
            if (!validPos(ra, dec)) return setBadInput(true)
            setBadInput(false)
            return go({ kind: 'pos', ra, dec })
        }
        setBadInput(false)
        go({ kind: 'name', name: value })
    }

    // The open tab is kept here, so that it survives a change of target.
    const [tab, setTab] = useState<Tab>('images')
    // The short search hint on narrow screens, so that it is not cut off.
    const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 720px)').matches)
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 720px)')
        const on = () => setNarrow(mq.matches)
        mq.addEventListener('change', on)
        return () => mq.removeEventListener('change', on)
    }, [])
    const targets = index.status === 'ready' ? index.targets : []
    const names: Record<string, string> = Object.fromEntries(targets.map((x) => [x.slug, x.name]))
    // Five test targets as cards; the ten fast movers (a test of the fit) in one drop-down list.
    const main = targets.filter((x) => x.set !== 'fast')
    const fast = targets.filter((x) => x.set === 'fast')
    const openTarget = (slug: string) => {
        setTab('images')
        go({ kind: 'name', name: slug })
        window.scrollTo({ top: 0 })
    }
    // A name that is one of the prepared targets opens the prepared view.
    const wanted = route.kind === 'name' ? route.name.toLowerCase() : null
    const prepared =
        route.kind === 'none' ? targets[0] : targets.find((x) => x.slug === wanted || x.name.toLowerCase() === wanted)
    const query: Query | null =
        prepared || index.status === 'loading'
            ? null
            : route.kind === 'name'
                ? { target: route.name }
                : route.kind === 'pos'
                    ? { ra: route.ra, dec: route.dec }
                    : null
    const metaLine = (x: TargetEntry) =>
        `${x.sp_type ? `${x.sp_type} · ` : ''}${t('card.meta', { n: x.n_exposures ?? '?', e: x.n_epochs ?? '?' })}`
    const fastOn = prepared?.set === 'fast'
    const validation =
        index.status !== 'loading' ? (
            <>
                <ValidationPanel names={names} />
                <FastMoversPanel onOpen={openTarget} />
            </>
        ) : null

    return (
        <div className="app">
            <header className="bar">
                <div className="bar-text">
                    <h1>{t('app.title')}</h1>
                    <p className="tagline">{t('app.tagline')}</p>
                </div>
                <div className="bar-tools">
                    {route.kind !== 'guide' && (
                        <button type="button" className="link howto-link" aria-expanded={howTo} onClick={() => setHowTo(!howTo)}>
                            {t('app.howto')}
                        </button>
                    )}
                    <LangSwitch />
                </div>
            </header>
            <main className="stage">
                {route.kind === 'guide' ? (
                    // Guided mode: only the step is on the page.
                    <FindMover onExit={leaveGuide} />
                ) : (
                    <>
                        {howTo && <HowTo onClose={() => setHowTo(false)} />}
                        <div className="top">
                            <form className="search" onSubmit={submit}>
                                <div className="row">
                                    <input
                                        id="search-input"
                                        ref={searchInput}
                                        type="text"
                                        aria-label={t('search.aria')}
                                        value={text}
                                        onChange={(e) => setText(e.target.value)}
                                        placeholder={narrow ? t('search.placeholder.short') : t('search.placeholder')}
                                        autoComplete="off"
                                        spellCheck={false}
                                    />
                                    <button type="submit">{t('search.show')}</button>
                                </div>
                            </form>
                            <button type="button" className="guide-start" onClick={() => go({ kind: 'guide' })}>
                                <b>{t('guide.start')}</b>
                                <span>{t('guide.start.sub')}</span>
                            </button>
                        </div>
                        {badInput && <p className="warn">{t('search.badpos')}</p>}
                        {targets.length > 0 && (
                            <nav className="picker">
                                {main.map((x) => (
                                    <button
                                        key={x.slug}
                                        type="button"
                                        className={`card${x === prepared ? ' on' : ''}`}
                                        title={metaLine(x)}
                                        onClick={() => go({ kind: 'name', name: x.slug })}
                                    >
                                        <span className="card-name">{x.name}</span>
                                        <span className="card-meta">{metaLine(x)}</span>
                                    </button>
                                ))}
                                {fast.length > 0 && (
                                    <select
                                        className={`fast-pick${fastOn ? ' on' : ''}`}
                                        aria-label={t('targets.fast')}
                                        value={fastOn && prepared ? prepared.slug : ''}
                                        onChange={(e) => {
                                            if (e.target.value) go({ kind: 'name', name: e.target.value })
                                        }}
                                    >
                                        <option value="">{t('targets.fast.pick', { n: fast.length })}</option>
                                        {fast.map((x) => (
                                            <option key={x.slug} value={x.slug}>
                                                {x.name} · {metaLine(x)}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {prepared && (
                                    <div className="tabs" role="tablist">
                                        {TABS.map(([id, key]) => (
                                            <button
                                                key={id}
                                                type="button"
                                                role="tab"
                                                aria-selected={id === tab}
                                                className={id === tab ? 'on' : ''}
                                                onClick={() => setTab(id)}
                                            >
                                                {t(key)}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </nav>
                        )}
                        {index.status === 'loading' && <p className="note">{t('targets.loading')}</p>}
                        {route.kind === 'bad' && (
                            <p className="warn">
                                {t('search.badurl')} {t('search.badpos')}
                            </p>
                        )}
                        {prepared && (
                            <BlinkView key={prepared.slug} slug={prepared.slug} tab={tab} validation={validation} />
                        )}
                        {query && <QuickLookView key={JSON.stringify(query)} query={query} />}
                        {index.status === 'empty' && route.kind === 'none' && <p className="note">{t('targets.empty')}</p>}
                    </>
                )}
            </main>
        </div>
    )
}