import { useEffect, useRef, useState, type FormEvent } from 'react'
import BlinkView from './BlinkView'
import FastMoversPanel from './FastMoversPanel'
import FindMover from './FindMover'
import QuickLookView, { type Query } from './QuickLookView'
import ValidationPanel from './ValidationPanel'
import type { TargetEntry } from './types'

type IndexState =
    | { status: 'loading' }
    | { status: 'empty' }
    | { status: 'ready'; targets: TargetEntry[] }

// What the page shows is written in the URL: ?target=<name>, ?ra=<deg>&dec=<deg> or ?guide=1.
type Route =
    | { kind: 'none' }
    | { kind: 'name'; name: string }
    | { kind: 'pos'; ra: number; dec: number }
    | { kind: 'guide' }
    | { kind: 'bad' }

const INDEX_URL = `${import.meta.env.BASE_URL}data/index.json`
const BAD_POS = 'RA must be between 0 and 360 degrees and Dec between -90 and +90 degrees.'

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
    if (r.kind === 'guide') return `${path}?guide=1`
    if (r.kind === 'name') return `${path}?target=${encodeURIComponent(r.name)}`
    if (r.kind === 'pos') return `${path}?ra=${r.ra}&dec=${r.dec}`
    return path
}

export default function App() {
    const [index, setIndex] = useState<IndexState>({ status: 'loading' })
    const [route, setRoute] = useState<Route>(readRoute)
    const [text, setText] = useState('')
    const [inputError, setInputError] = useState<string | null>(null)
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
            searchInput.current?.focus()
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
            if (!validPos(ra, dec)) return setInputError(BAD_POS)
            setInputError(null)
            return go({ kind: 'pos', ra, dec })
        }
        setInputError(null)
        go({ kind: 'name', name: value })
    }

    const targets = index.status === 'ready' ? index.targets : []
    const names: Record<string, string> = Object.fromEntries(targets.map((t) => [t.slug, t.name]))
    // The fast movers (a test of the fit) are listed after the first targets, under their own heading.
    const groups = [
        { title: null, list: targets.filter((t) => t.set !== 'fast') },
        { title: 'Fast movers, a test of the fit', list: targets.filter((t) => t.set === 'fast') }
    ].filter((g) => g.list.length > 0)
    const openTarget = (slug: string) => {
        go({ kind: 'name', name: slug })
        window.scrollTo({ top: 0 })
    }
    // A name that is one of the prepared targets opens the prepared view.
    const wanted = route.kind === 'name' ? route.name.toLowerCase() : null
    const prepared =
        route.kind === 'none' ? targets[0] : targets.find((t) => t.slug === wanted || t.name.toLowerCase() === wanted)
    const query: Query | null =
        prepared || index.status === 'loading'
            ? null
            : route.kind === 'name'
                ? { target: route.name }
                : route.kind === 'pos'
                    ? { ra: route.ra, dec: route.dec }
                    : null

    return (
        <div className="app">
            <header className="bar">
                <h1>SPHEREx motion viewer</h1>
                <span className="scale">1 pixel = 6.15 arcsec</span>
            </header>
            <main className="stage">
                {route.kind !== 'guide' && (
                    <button className="guide-start" onClick={() => go({ kind: 'guide' })}>
                        <b>Find the mover</b>
                        <span>New here? Spot three real moving objects in about a minute.</span>
                    </button>
                )}
                <form className="search" onSubmit={submit}>
                    <label htmlFor="search-input">Any star or position</label>
                    <div className="row">
                        <input
                            id="search-input"
                            ref={searchInput}
                            type="text"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Star name (Wolf 359) or RA Dec in degrees (164.0924 6.9952)"
                            autoComplete="off"
                            spellCheck={false}
                        />
                        <button type="submit">Show</button>
                    </div>
                    {inputError && <p className="warn">{inputError}</p>}
                </form>
                {groups.map((g) => (
                    <div key={g.title ?? 'first'}>
                        {g.title && <h4 className="cards-title">{g.title}</h4>}
                        <nav className="cards">
                            {g.list.map((t) => (
                                <button
                                    key={t.slug}
                                    className={`card${t === prepared ? ' on' : ''}`}
                                    onClick={() => go({ kind: 'name', name: t.slug })}
                                >
                                    <span className="card-name">{t.name}</span>
                                    <span className="card-meta">
                                        {t.sp_type ? `${t.sp_type} · ` : ''}
                                        {t.n_exposures} exposures · {t.n_epochs} epochs
                                    </span>
                                </button>
                            ))}
                        </nav>
                    </div>
                ))}
                {index.status === 'loading' && <p className="note">Loading target list…</p>}
                {route.kind === 'bad' && <p className="warn">The address of this page holds no usable position. {BAD_POS}</p>}
                {route.kind === 'guide' && <FindMover onExit={leaveGuide} />}
                {prepared && <BlinkView key={prepared.slug} slug={prepared.slug} />}
                {query && <QuickLookView key={JSON.stringify(query)} query={query} />}
                {index.status === 'empty' && route.kind === 'none' && (
                    <p className="note">No prepared targets are available; enter a star name or a position above.</p>
                )}
                {index.status !== 'loading' && <ValidationPanel names={names} />}
                {index.status !== 'loading' && <FastMoversPanel onOpen={openTarget} />}
            </main>
        </div>
    )
}