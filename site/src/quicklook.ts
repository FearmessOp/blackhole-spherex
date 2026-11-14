// Quick look: SPHEREx Level-2 images read straight from the public cloud copy with HTTP
// Range requests, resampled onto a north-up grid and stacked per epoch.
//
// No DOM is used here, so the same file is tested under Node against astropy
// (scripts/test_wcs.mjs, logs/test_wcs.log). Facts this code relies on were measured in
// logs/range_probe.log: the IMAGE extension is an uncompressed 2040 x 2040 float32 array,
// its data offset differs from file to file (so the header is parsed for every file), and
// the bucket answers Range requests with Access-Control-Allow-Origin: *.
//
// Not done here, on purpose: the FLAGS extension is Rice-compressed and is not read, so
// nothing is masked. The result is a quick look, not a measurement.

export const CLOUD = 'https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/'
export const SCALE_ARCSEC = 6.15
export const GAP_DAYS = 30 // exposures further apart start a new epoch (same rule as the pipeline)
const BLOCK = 2880
const HEAD_BYTES = 16 * BLOCK
const D2R = Math.PI / 180

// ---------------------------------------------------------------- FITS header

export type Header = Record<string, number | string | boolean>

const pad = (n: number) => Math.ceil(n / BLOCK) * BLOCK

// Parses the header that starts at `start`. Returns null if its END card is not in `text`.
export function parseHeader(text: string, start = 0): { header: Header; length: number } | null {
    const header: Header = {}
    for (let i = start; i + 80 <= text.length; i += 80) {
        const card = text.slice(i, i + 80)
        const key = card.slice(0, 8).trim()
        if (key === 'END') return { header, length: pad(i + 80 - start) }
        if (card[8] !== '=' || !key) continue
        const rest = card.slice(10)
        const t = rest.trimStart()
        if (t.startsWith("'")) {
            let s = ''
            for (let k = 1; k < t.length; k++) {
                if (t[k] === "'") {
                    if (t[k + 1] === "'") {
                        s += "'"
                        k++
                    } else break
                } else s += t[k]
            }
            header[key] = s.trimEnd()
        } else {
            const v = rest.split('/')[0].trim()
            if (v === 'T' || v === 'F') header[key] = v === 'T'
            else {
                const x = Number(v.replace(/[dD]/, 'E'))
                if (v !== '' && Number.isFinite(x)) header[key] = x
            }
        }
    }
    return null
}

const hnum = (h: Header, key: string, fallback?: number): number => {
    const v = h[key]
    if (typeof v === 'number') return v
    if (fallback !== undefined) return fallback
    throw new Error(`FITS header has no numeric ${key}`)
}

// Padded size of the data that follows a header.
export function dataBytes(h: Header): number {
    const naxis = hnum(h, 'NAXIS', 0)
    if (naxis === 0) return 0
    let n = 1
    for (let k = 1; k <= naxis; k++) n *= hnum(h, `NAXIS${k}`)
    return pad((Math.abs(hnum(h, 'BITPIX')) / 8) * hnum(h, 'GCOUNT', 1) * (hnum(h, 'PCOUNT', 0) + n))
}

// ---------------------------------------------------------------- TAN-SIP

type Poly = number[][] // c[p][q] multiplies u^p v^q

export type Wcs = {
    crpix: [number, number]
    crval: [number, number] // degrees
    cd: [number, number, number, number] // degrees per pixel
    cdInv: [number, number, number, number]
    a: Poly | null
    b: Poly | null
    ap: Poly | null
    bp: Poly | null
}

function readPoly(h: Header, name: string): Poly | null {
    const order = h[`${name}_ORDER`]
    if (typeof order !== 'number') return null
    const c: Poly = []
    for (let p = 0; p <= order; p++) {
        c.push([])
        for (let q = 0; q <= order; q++) c[p].push(hnum(h, `${name}_${p}_${q}`, 0))
    }
    return c
}

function polyval(c: Poly | null, u: number, v: number): number {
    if (!c) return 0
    let sum = 0
    let up = 1
    for (let p = 0; p < c.length; p++) {
        let vq = 1
        for (let q = 0; q < c[p].length; q++) {
            if (c[p][q] !== 0) sum += c[p][q] * up * vq
            vq *= v
        }
        up *= u
    }
    return sum
}

export function makeWcs(h: Header): Wcs {
    const c1 = String(h['CTYPE1'] ?? '')
    const c2 = String(h['CTYPE2'] ?? '')
    if (!c1.startsWith('RA---TAN') || !c2.startsWith('DEC--TAN')) {
        throw new Error(`unsupported projection ${c1} / ${c2}`)
    }
    let cd: [number, number, number, number]
    if (typeof h['CD1_1'] === 'number') {
        cd = [hnum(h, 'CD1_1'), hnum(h, 'CD1_2', 0), hnum(h, 'CD2_1', 0), hnum(h, 'CD2_2')]
    } else {
        const d1 = hnum(h, 'CDELT1', 1)
        const d2 = hnum(h, 'CDELT2', 1)
        cd = [d1 * hnum(h, 'PC1_1', 1), d1 * hnum(h, 'PC1_2', 0), d2 * hnum(h, 'PC2_1', 0), d2 * hnum(h, 'PC2_2', 1)]
    }
    const det = cd[0] * cd[3] - cd[1] * cd[2]
    if (!(Math.abs(det) > 0)) throw new Error('singular WCS matrix')
    const sip = c1.endsWith('-SIP')
    return {
        crpix: [hnum(h, 'CRPIX1'), hnum(h, 'CRPIX2')],
        crval: [hnum(h, 'CRVAL1'), hnum(h, 'CRVAL2')],
        cd,
        cdInv: [cd[3] / det, -cd[1] / det, -cd[2] / det, cd[0] / det],
        a: sip ? readPoly(h, 'A') : null,
        b: sip ? readPoly(h, 'B') : null,
        ap: sip ? readPoly(h, 'AP') : null,
        bp: sip ? readPoly(h, 'BP') : null
    }
}

// Gnomonic projection about (ra0, dec0): sky (degrees) -> tangent plane (degrees, xi east, eta north).
export function project(ra0: number, dec0: number, ra: number, dec: number): [number, number] {
    const d0 = dec0 * D2R
    const d = dec * D2R
    const dra = (ra - ra0) * D2R
    const den = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(dra)
    if (!(den > 1e-6)) return [NaN, NaN]
    return [
        (Math.cos(d) * Math.sin(dra)) / den / D2R,
        (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(dra)) / den / D2R
    ]
}

export function deproject(ra0: number, dec0: number, xiDeg: number, etaDeg: number): [number, number] {
    const d0 = dec0 * D2R
    const xi = xiDeg * D2R
    const eta = etaDeg * D2R
    const den = Math.cos(d0) - eta * Math.sin(d0)
    const ra = ra0 + Math.atan2(xi, den) / D2R
    const dec = Math.atan2(Math.sin(d0) + eta * Math.cos(d0), Math.hypot(xi, den)) / D2R
    return [((ra % 360) + 360) % 360, dec]
}

// 0-based pixel -> sky (degrees).
export function pixToWorld(w: Wcs, x: number, y: number): [number, number] {
    const u = x + 1 - w.crpix[0]
    const v = y + 1 - w.crpix[1]
    const U = u + polyval(w.a, u, v)
    const V = v + polyval(w.b, u, v)
    return deproject(w.crval[0], w.crval[1], w.cd[0] * U + w.cd[1] * V, w.cd[2] * U + w.cd[3] * V)
}

// Sky (degrees) -> 0-based pixel. The AP/BP polynomials give the first guess; the forward
// polynomials A/B are then inverted by fixed-point iteration (their Jacobian is close to 1).
export function worldToPix(w: Wcs, ra: number, dec: number): [number, number] {
    const [xi, eta] = project(w.crval[0], w.crval[1], ra, dec)
    if (Number.isNaN(xi)) return [NaN, NaN]
    const U = w.cdInv[0] * xi + w.cdInv[1] * eta
    const V = w.cdInv[2] * xi + w.cdInv[3] * eta
    let u = U + polyval(w.ap, U, V)
    let v = V + polyval(w.bp, U, V)
    if (w.a || w.b) {
        for (let k = 0; k < 20; k++) {
            const fu = u + polyval(w.a, u, v) - U
            const fv = v + polyval(w.b, u, v) - V
            u -= fu
            v -= fv
            if (Math.abs(fu) < 1e-9 && Math.abs(fv) < 1e-9) break
        }
    }
    return [u + w.crpix[0] - 1, v + w.crpix[1] - 1]
}

// ---------------------------------------------------------------- Range reading

export type Counter = { requests: number; bytes: number }

async function fetchRange(url: string, a: number, b: number, counter: Counter, signal?: AbortSignal): Promise<ArrayBuffer> {
    let last: unknown = null
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const r = await fetch(url, { headers: { Range: `bytes=${a}-${b}` }, signal })
            // 200 would mean the whole 66 MB file is being sent: refuse it.
            if (r.status !== 206) throw new Error(`HTTP ${r.status} for a range request`)
            const buf = await r.arrayBuffer()
            counter.requests += 1
            counter.bytes += buf.byteLength
            return buf
        } catch (e) {
            if (signal?.aborted) throw e
            last = e
        }
    }
    throw last instanceof Error ? last : new Error(String(last))
}

export type Cutout = {
    key: string
    mjd: number
    detector: number
    wcs: Wcs
    dataOff: number
    x0: number // 0-based detector pixel of the first column / row of `data`
    y0: number
    w: number
    h: number
    data: Float32Array // row-major, NaN where the file holds NaN
    x: number // position of the requested sky point, detector pixels
    y: number
}

// Header of the IMAGE extension, then the rows around (ra, dec). Returns null if the
// position falls outside the detector.
export async function readCutout(
    key: string,
    ra: number,
    dec: number,
    half: number,
    counter: Counter,
    signal?: AbortSignal
): Promise<Cutout | null> {
    const url = CLOUD + key
    const latin1 = new TextDecoder('latin1')
    let bytes = new Uint8Array(await fetchRange(url, 0, HEAD_BYTES - 1, counter, signal))
    let text = latin1.decode(bytes)
    const h0 = parseHeader(text, 0)
    if (!h0) throw new Error('primary FITS header not found')
    const off1 = h0.length + dataBytes(h0.header)
    let h1 = parseHeader(text, off1)
    while (!h1) {
        if (bytes.length > 8 * HEAD_BYTES) throw new Error('IMAGE header not found')
        const more = new Uint8Array(await fetchRange(url, bytes.length, bytes.length + HEAD_BYTES - 1, counter, signal))
        const joined = new Uint8Array(bytes.length + more.length)
        joined.set(bytes)
        joined.set(more, bytes.length)
        bytes = joined
        text = latin1.decode(bytes)
        h1 = parseHeader(text, off1)
    }
    const hdr = h1.header
    if (hdr['XTENSION'] !== 'IMAGE' || hnum(hdr, 'BITPIX') !== -32 || hnum(hdr, 'NAXIS') !== 2) {
        throw new Error('first extension is not an uncompressed float32 image')
    }
    const nx = hnum(hdr, 'NAXIS1')
    const ny = hnum(hdr, 'NAXIS2')
    const dataOff = off1 + h1.length
    const wcs = makeWcs(hdr)
    const [x, y] = worldToPix(wcs, ra, dec)
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (!(ix >= 0 && ix < nx && iy >= 0 && iy < ny)) return null
    const y0 = Math.max(0, iy - half)
    const y1 = Math.min(ny - 1, iy + half)
    const x0 = Math.max(0, ix - half)
    const x1 = Math.min(nx - 1, ix + half)
    const rows = new DataView(await fetchRange(url, dataOff + y0 * nx * 4, dataOff + (y1 + 1) * nx * 4 - 1, counter, signal))
    const w = x1 - x0 + 1
    const h = y1 - y0 + 1
    const data = new Float32Array(w * h)
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) data[j * w + i] = rows.getFloat32((j * nx + x0 + i) * 4, false)
    }
    return { key, mjd: hnum(hdr, 'MJD-AVG', NaN), detector: hnum(hdr, 'DETECTOR', 0), wcs, dataOff, x0, y0, w, h, data, x, y }
}

// ---------------------------------------------------------------- grid and stacking

// Display grid: TAN about (ra0, dec0); column 0 is the east (left) edge, row 0 the north (top) edge.
export type Grid = { ra0: number; dec0: number; npix: number }

export function gridToWorld(g: Grid, i: number, j: number): [number, number] {
    const c = (g.npix - 1) / 2
    const s = SCALE_ARCSEC / 3600
    return deproject(g.ra0, g.dec0, (c - i) * s, (c - j) * s)
}

export function worldToGrid(g: Grid, ra: number, dec: number): [number, number] {
    const c = (g.npix - 1) / 2
    const s = SCALE_ARCSEC / 3600
    const [xi, eta] = project(g.ra0, g.dec0, ra, dec)
    return [c - xi / s, c - eta / s]
}

export function median(values: number[]): number {
    if (!values.length) return NaN
    const s = values.slice().sort((p, q) => p - q)
    const m = s.length >> 1
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// One exposure on the display grid: median background of the cutout subtracted, bilinear
// interpolation over the finite pixels, NaN where less than half of the weight is finite.
export function resample(c: Cutout, g: Grid): Float32Array {
    const out = new Float32Array(g.npix * g.npix).fill(NaN)
    const finite: number[] = []
    for (const v of c.data) if (Number.isFinite(v)) finite.push(v)
    if (!finite.length) return out
    const bg = median(finite)
    for (let j = 0; j < g.npix; j++) {
        for (let i = 0; i < g.npix; i++) {
            const [ra, dec] = gridToWorld(g, i, j)
            const [x, y] = worldToPix(c.wcs, ra, dec)
            const fx = x - c.x0
            const fy = y - c.y0
            const ix = Math.floor(fx)
            const iy = Math.floor(fy)
            const tx = fx - ix
            const ty = fy - iy
            let num = 0
            let den = 0
            for (let dj = 0; dj < 2; dj++) {
                for (let di = 0; di < 2; di++) {
                    const px = ix + di
                    const py = iy + dj
                    if (px < 0 || px >= c.w || py < 0 || py >= c.h) continue
                    const v = c.data[py * c.w + px]
                    if (!Number.isFinite(v)) continue
                    const wgt = (di ? tx : 1 - tx) * (dj ? ty : 1 - ty)
                    num += wgt * (v - bg)
                    den += wgt
                }
            }
            if (den > 0.5) out[j * g.npix + i] = num / den
        }
    }
    return out
}

const CLIP_SIGMA = 5

// Clipped mean over frames, pixel by pixel (same rule as pipeline/stack_epochs.py).
export function clippedMean(frames: Float32Array[]): { stack: Float32Array; coverage: Uint16Array } {
    const n = frames[0].length
    const stack = new Float32Array(n).fill(NaN)
    const coverage = new Uint16Array(n)
    const med = new Float64Array(n)
    const mad = new Float64Array(n)
    const column = (k: number) => {
        const vals: number[] = []
        for (const f of frames) if (Number.isFinite(f[k])) vals.push(f[k])
        return vals
    }
    for (let k = 0; k < n; k++) {
        const vals = column(k)
        coverage[k] = vals.length
        med[k] = median(vals)
        mad[k] = 1.4826 * median(vals.map((v) => Math.abs(v - med[k])))
    }
    const floor = median(Array.from(mad).filter((v) => Number.isFinite(v)))
    for (let k = 0; k < n; k++) {
        let vals = column(k)
        if (!vals.length) continue
        if (frames.length >= 3) {
            const limit = CLIP_SIGMA * Math.max(mad[k], floor)
            vals = vals.filter((v) => Math.abs(v - med[k]) <= limit)
        }
        if (vals.length) stack[k] = vals.reduce((s, v) => s + v, 0) / vals.length
    }
    return { stack, coverage }
}

// ---------------------------------------------------------------- exposure list

export type Exposure = { mjd: number; detector: number; collection: number; key: string }

// Time-ordered exposures -> epochs; a gap of more than GAP_DAYS starts a new one.
export function splitEpochs(exposures: Exposure[]): Exposure[][] {
    const sorted = exposures.slice().sort((p, q) => p.mjd - q.mjd)
    const epochs: Exposure[][] = []
    for (const e of sorted) {
        const last = epochs[epochs.length - 1]
        if (last && e.mjd - last[last.length - 1].mjd <= GAP_DAYS) last.push(e)
        else epochs.push([e])
    }
    return epochs
}

// About `total` exposures of one epoch, the same number from each detector of the band,
// evenly spread in time. Equal detector shares keep the epochs comparable in brightness.
export function pickBalanced(epoch: Exposure[], dets: number[], total: number): Exposure[] {
    const per = Math.max(1, Math.round(total / dets.length))
    const out: Exposure[] = []
    for (const d of dets) {
        const sel = epoch.filter((e) => e.detector === d)
        if (!sel.length) continue
        const n = Math.min(per, sel.length)
        const idx = new Set<number>()
        for (let k = 0; k < n; k++) idx.add(Math.round(((k + 0.5) * sel.length) / n - 0.5))
        for (const i of idx) out.push(sel[i])
    }
    return out.sort((p, q) => p.mjd - q.mjd)
}

// ---------------------------------------------------------------- brightness scale

export type Scale = { vmin: number; vmax: number; soft: number }

// One asinh scale for all epochs of a scene (same rule as pipeline/stack_epochs.py).
export function sceneScale(stacks: Float32Array[]): Scale {
    const vals: number[] = []
    for (const s of stacks) for (const v of s) if (Number.isFinite(v)) vals.push(v)
    vals.sort((p, q) => p - q)
    if (!vals.length) return { vmin: 0, vmax: 1, soft: 1 }
    const med = median(vals)
    const sig = 1.4826 * median(vals.map((v) => Math.abs(v - med)))
    const soft = Math.max(3 * sig, 1e-6)
    const vmin = med - 2 * sig
    const pos = 0.999 * (vals.length - 1)
    const lo = Math.floor(pos)
    const p999 = vals[lo] + (pos - lo) * (vals[Math.min(lo + 1, vals.length - 1)] - vals[lo])
    return { vmin, vmax: Math.max(p999, vmin + 2 * soft), soft }
}

// Grey RGBA bytes for a canvas; pixels without data are transparent.
export function toRgba(stack: Float32Array, scale: Scale): Uint8ClampedArray {
    const out = new Uint8ClampedArray(stack.length * 4)
    const top = Math.asinh((scale.vmax - scale.vmin) / scale.soft)
    for (let k = 0; k < stack.length; k++) {
        const v = stack[k]
        if (!Number.isFinite(v)) continue
        const g = Math.round((255 * Math.asinh(Math.max(0, (v - scale.vmin) / scale.soft))) / top)
        out[4 * k] = out[4 * k + 1] = out[4 * k + 2] = g
        out[4 * k + 3] = 255
    }
    return out
}