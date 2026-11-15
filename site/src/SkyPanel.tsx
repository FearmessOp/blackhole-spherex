import type { ReactNode } from 'react'
import { HelpTitle } from './Help'
import { t, useLang, type Key } from './i18n'
import type { Arrow, XY } from './types'

type Props = {
    title: string
    help?: Key // explanation behind the "?" button next to the title
    n: number // grid size in pixels
    scaleArcsec: number
    marker?: XY | null
    markerLabel?: string // written under the catalogue marker
    neighbour?: XY | null // a catalogue star that is not the target
    neighbourLabel?: string
    arrow?: Arrow | null
    onPick?: (x: number, y: number) => void // click on the image, in grid pixels (pixel centres at whole numbers)
    pickBadge?: string // short label drawn on a clickable image
    pick?: XY | null // the last click, drawn as a small ring
    background?: React.CSSProperties // sprite-sheet frame (raw playback)
    children?: ReactNode // stacked <img> layers
    caption: ReactNode
    detail?: ReactNode
}

const BAR_ARCSEC = 30
// The measured motion is about one pixel long; the arrow is drawn enlarged and labelled as such.
export const ARROW_SCALE = 4

// One square sky image with its overlays. All overlay coordinates are grid pixels.
export default function SkyPanel(p: Props) {
    useLang()
    const n = p.n
    const u = n / 100 // 1% of the panel, in grid pixels
    const font = 3.4 * u
    const bar = BAR_ARCSEC / p.scaleArcsec
    const a = p.arrow
    const len = a ? ARROW_SCALE * Math.hypot(a.dx, a.dy) : 0
    // Keeps a centred label inside the panel (rough width: 0.27 em per character on each side).
    const clampX = (x: number, text: string) => {
        const half = 0.27 * font * text.length
        return Math.min(n - half - u, Math.max(half + u, x))
    }
    // The arrow label sits under the arrow tip; if that is the line of the marker label, it moves one line down.
    const markerLabelY = p.marker && p.markerLabel ? p.marker.y + 0.5 + 3 + 1.2 * font : null
    let arrowLabelY = a ? a.y + 0.5 + ARROW_SCALE * a.dy + 6 * u : 0
    if (a && markerLabelY !== null && Math.abs(arrowLabelY - markerLabelY) < 1.3 * font) arrowLabelY = markerLabelY + 1.3 * font
    const nb = p.neighbour
    // The pointer to the neighbour comes from above, on the side away from the target marker.
    const side = nb && p.marker && nb.x < p.marker.x ? -1 : 1

    return (
        <figure className="fig">
            {p.help ? (
                <HelpTitle as="figcaption" help={p.help}>
                    {p.title}
                </HelpTitle>
            ) : (
                <figcaption>{p.title}</figcaption>
            )}
            <div
                className={`view sky${p.onPick ? ' pickable' : ''}`}
                style={p.background}
                onClick={
                    p.onPick
                        ? (ev) => {
                            const r = ev.currentTarget.getBoundingClientRect()
                            p.onPick?.(((ev.clientX - r.left) / r.width) * n - 0.5, ((ev.clientY - r.top) / r.height) * n - 0.5)
                        }
                        : undefined
                }
            >
                {p.children}
                {p.onPick && p.pickBadge && <span className="pick-badge">{p.pickBadge}</span>}
                <svg className="overlay" viewBox={`0 0 ${n} ${n}`}>
                    {p.pick && (
                        <g className="pick" transform={`translate(${p.pick.x + 0.5} ${p.pick.y + 0.5})`}>
                            <circle className="case" r={0.7} />
                            <circle r={0.7} />
                        </g>
                    )}
                    {p.marker && (
                        <g className="marker" transform={`translate(${p.marker.x + 0.5} ${p.marker.y + 0.5})`}>
                            <line x1={-3} y1={0} x2={-1.5} y2={0} />
                            <line x1={1.5} y1={0} x2={3} y2={0} />
                            <line x1={0} y1={-3} x2={0} y2={-1.5} />
                            <line x1={0} y1={1.5} x2={0} y2={3} />
                        </g>
                    )}
                    {p.marker && p.markerLabel && (
                        <text
                            className="marker-label"
                            x={clampX(p.marker.x + 0.5, p.markerLabel)}
                            y={p.marker.y + 0.5 + 3 + 1.2 * font}
                            fontSize={font}
                            textAnchor="middle"
                        >
                            {p.markerLabel}
                        </text>
                    )}
                    {nb && (
                        <>
                            <g className="neighbour" transform={`translate(${nb.x + 0.5} ${nb.y + 0.5})`}>
                                <line className="case" x1={side * 0.9} y1={-0.9} x2={side * 3.2} y2={-3.2} />
                                <line x1={side * 0.9} y1={-0.9} x2={side * 3.2} y2={-3.2} />
                            </g>
                            {p.neighbourLabel && (
                                <text
                                    className="neighbour-label"
                                    x={clampX(nb.x + 0.5 + side * 3.2, p.neighbourLabel)}
                                    y={nb.y + 0.5 - 3.2 - 0.5 * font}
                                    fontSize={font}
                                    textAnchor="middle"
                                >
                                    {p.neighbourLabel}
                                </text>
                            )}
                        </>
                    )}
                    {a && len > 0 && (
                        <>
                            <g
                                className="arrow"
                                transform={`translate(${a.x + 0.5} ${a.y + 0.5}) rotate(${(Math.atan2(a.dy, a.dx) * 180) / Math.PI})`}
                            >
                                {/* dark casing first, so the arrow stays visible on bright pixels */}
                                <line className="case" x1={0} y1={0} x2={len} y2={0} />
                                <polygon className="case" points={`${len + 0.5},0 ${len - 0.4},-0.4 ${len - 0.4},0.4`} />
                                <line x1={0} y1={0} x2={len} y2={0} />
                                <polygon points={`${len + 0.5},0 ${len - 0.4},-0.4 ${len - 0.4},0.4`} />
                            </g>
                            <text
                                className="arrow-label"
                                x={a.x + 0.5 + ARROW_SCALE * a.dx}
                                y={arrowLabelY}
                                fontSize={font}
                                textAnchor="middle"
                            >
                                {t('sky.motion', { k: ARROW_SCALE })}
                            </text>
                        </>
                    )}
                    <text className="compass" x={2 * u} y={5 * u} fontSize={font}>
                        {t('sky.compass')}
                    </text>
                    <g className="scalebar">
                        <line x1={n - 3 * u - bar} y1={n - 4 * u} x2={n - 3 * u} y2={n - 4 * u} />
                        <text x={n - 3 * u - bar / 2} y={n - 6 * u} fontSize={font} textAnchor="middle">
                            {BAR_ARCSEC}″
                        </text>
                    </g>
                </svg>
            </div>
            <p className="epoch">{p.caption}</p>
            {p.detail && <p className="detail">{p.detail}</p>}
        </figure>
    )
}