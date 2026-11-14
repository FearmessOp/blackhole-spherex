import { useEffect, useState } from 'react'
import BlinkView from './BlinkView'
import type { TargetEntry } from './types'

type IndexState =
    | { status: 'loading' }
    | { status: 'empty' }
    | { status: 'ready'; targets: TargetEntry[] }

const INDEX_URL = `${import.meta.env.BASE_URL}data/index.json`

export default function App() {
    const [index, setIndex] = useState<IndexState>({ status: 'loading' })
    const [slug, setSlug] = useState<string | null>(null)

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

    const current = index.status === 'ready' ? (slug ?? index.targets[0].slug) : null

    return (
        <div className="app">
            <header className="bar">
                <h1>SPHEREx motion viewer</h1>
                <span className="scale">1 pixel = 6.15 arcsec</span>
            </header>
            <main className="stage">
                {index.status === 'loading' && <p className="note">Loading target list…</p>}
                {index.status === 'empty' && <p className="note">No processed targets are available yet.</p>}
                {index.status === 'ready' && current && (
                    <>
                        <nav className="cards">
                            {index.targets.map((t) => (
                                <button
                                    key={t.slug}
                                    className={`card${t.slug === current ? ' on' : ''}`}
                                    onClick={() => setSlug(t.slug)}
                                >
                                    <span className="card-name">{t.name}</span>
                                    <span className="card-meta">
                                        {t.sp_type ? `${t.sp_type} · ` : ''}
                                        {t.n_exposures} exposures · {t.n_epochs} epochs
                                    </span>
                                </button>
                            ))}
                        </nav>
                        <BlinkView key={current} slug={current} />
                    </>
                )}
            </main>
        </div>
    )
}