// Rough motion from the quick look against the full pipeline (block B, item 11).
//
// Builds the same scene as the site (same grid, same choice of exposures per epoch),
// measures the position on every epoch stack with measureEpoch() and compares the motion
// between epochs with
//   - the catalogue prediction (proper motion + parallax) computed here in TypeScript,
//   - the prediction of the astropy-based pipeline for the same epochs,
//   - the motion the full pipeline measures with the same method (windowed centroid on
//     epoch stacks of all cached, flag-masked exposures): data/astrometry/<slug>_stack_d*.json.
//
// Usage (from site/): node scripts/test_motion.mjs [exposures per epoch] > ..\logs\test_motion.log 2>&1
import { readFileSync } from 'node:fs'
import handler from '../api/lookup.js'
import { measureEpoch, motionBetween, pickBalanced, predictPosition, readFrames, splitEpochs, worldToGrid } from '../src/quicklook.ts'

const NPIX = 19
const HALF = 14
const PARALLEL = 6
const D2R = Math.PI / 180
const override = process.argv[2] ? Number(process.argv[2]) : null
const CASES = [
    { name: 'eps Ind B', dets: [1, 2, 3, 4, 5, 6], total: 6, ref: 'eps-indi-b_stack_d123456.json' },
    { name: 'WISE J085510.83-071442.5', dets: [5, 6], total: 8, ref: 'wise-0855_stack_d56.json' }
]
const f = (v, d = 2) => (v >= 0 ? '+' : '') + v.toFixed(d)

function lookup(name) {
    return new Promise((resolve) => {
        const res = { statusCode: 0, setHeader: () => { }, end: (body) => resolve(JSON.parse(body)) }
        handler({ url: `/api/lookup?target=${encodeURIComponent(name)}` }, res)
    })
}

let pairsTotal = 0
let pairsWithin2 = 0
let pairsPred2 = 0
for (const c of CASES) {
    const total = override ?? c.total
    console.log(`===== ${c.name}: detectors ${c.dets.join(',')}, ${total} exposures per epoch`)
    let l = null
    for (let attempt = 0; attempt < 3 && !(l && l.ok && l.collections.every((q) => q.ok)); attempt++) l = await lookup(c.name)
    if (!l.ok || !l.collections.every((q) => q.ok)) {
        console.log(`lookup failed or incomplete: ${JSON.stringify(l.collections ?? l)}`)
        continue
    }
    const t = l.target
    const cat = { ra: t.ra_deg, dec: t.dec_deg, pmra: t.pmra_masyr ?? 0, pmdec: t.pmdec_masyr ?? 0, plx: t.plx_mas ?? 0 }
    const exposures = l.exposures.map((e) => ({ mjd: e[0], detector: e[1], collection: e[2], key: e[3] }))
    const epochs = splitEpochs(exposures)
    // grid centre as on the site: catalogue position + proper motion at the mean time
    const mean = exposures.reduce((s, e) => s + e.mjd, 0) / exposures.length
    const dt = (mean - 51544.5) / 365.25
    const grid = { ra0: cat.ra + (cat.pmra * dt) / 3.6e6 / Math.cos(cat.dec * D2R), dec0: cat.dec + (cat.pmdec * dt) / 3.6e6, npix: NPIX }
    const jobs = epochs.flatMap((ep, k) => pickBalanced(ep, c.dets, total).map((e) => ({ k, e })))
    const counter = { requests: 0, bytes: 0 }
    const t0 = Date.now()
    const set = await readFrames(jobs, epochs.length, grid.ra0, grid.dec0, grid, HALF, PARALLEL, counter)
    console.log(`exposures listed=${exposures.length} epochs=${JSON.stringify(epochs.map((e) => e.length))} read=${JSON.stringify(set.frames.map((q) => q.length))} ` +
        `failed=${set.failed} off_detector=${set.offDetector} time=${((Date.now() - t0) / 1000).toFixed(1)}s bytes=${counter.bytes} requests=${counter.requests}`)

    const ref = JSON.parse(readFileSync(new URL(`../../data/astrometry/${c.ref}`, import.meta.url), 'utf8'))
    const cc = (NPIX - 1) / 2
    const rows = epochs.map((_, k) => {
        const mjds = set.mjd[k]
        if (!mjds.length) return null
        const mjd = mjds.reduce((s, v) => s + v, 0) / mjds.length
        const [ra, dec] = predictPosition(cat, mjd)
        const [px, py] = worldToGrid(grid, ra, dec)
        const pred = { east: (cc - px) * 6.15, north: (cc - py) * 6.15 }
        const t1 = Date.now()
        const m = measureEpoch(set.frames[k], NPIX, px, py, k + 1)
        // the same prediction at the mean date of the pipeline's epoch, for the comparison of the two predictions
        const [rra, rdec] = predictPosition(cat, ref[k].mjd)
        const [rx, ry] = worldToGrid(grid, rra, rdec)
        console.log(`epoch ${k}: n=${mjds.length} mean MJD=${mjd.toFixed(1)} predicted px=(${px.toFixed(2)}, ${py.toFixed(2)}) ` +
            (m ? `measured-predicted east=${f(m.east - pred.east)}+-${m.eastErr.toFixed(2)} north=${f(m.north - pred.north)}+-${m.northErr.toFixed(2)} arcsec ` +
                `(bootstrap kept ${m.bootKept}/200, ${Date.now() - t1} ms)` : 'not measured'))
        return { m, pred, predAtRef: { east: (cc - rx) * 6.15, north: (cc - ry) * 6.15 } }
    })
    for (let a = 0; a < rows.length; a++) {
        for (let b = a + 1; b < rows.length; b++) {
            const A = rows[a]
            const B = rows[b]
            const pe = ref[b].pred.east - ref[a].pred.east
            const pn = ref[b].pred.north - ref[a].pred.north
            const full = ref[a].win && ref[b].win ? {
                east: ref[b].win.east - ref[a].win.east, north: ref[b].win.north - ref[a].win.north,
                ee: Math.hypot(ref[a].win.ee, ref[b].win.ee), en: Math.hypot(ref[a].win.en, ref[b].win.en)
            } : null
            let line = `motion ${a} -> ${b}: pipeline prediction east=${f(pe)} north=${f(pn)}`
            if (A && B) {
                line += ` | TS prediction at pipeline dates east=${f(B.predAtRef.east - A.predAtRef.east)} north=${f(B.predAtRef.north - A.predAtRef.north)}` +
                    ` | TS prediction at quick-look dates east=${f(B.pred.east - A.pred.east)} north=${f(B.pred.north - A.pred.north)}`
            }
            if (full) line += ` | full pipeline east=${f(full.east)}+-${full.ee.toFixed(2)} north=${f(full.north)}+-${full.en.toFixed(2)}`
            if (A?.m && B?.m) {
                const q = motionBetween(A.m, B.m)
                line += ` | quick look east=${f(q.east)}+-${q.eastErr.toFixed(2)} north=${f(q.north)}+-${q.northErr.toFixed(2)} ` +
                    `total=${q.total.toFixed(2)}+-${q.totalErr.toFixed(2)} measurable=${q.measurable}`
                pairsTotal++
                const dpe = (q.east - (B.pred.east - A.pred.east)) / q.eastErr
                const dpn = (q.north - (B.pred.north - A.pred.north)) / q.northErr
                if (Math.abs(dpe) <= 2 && Math.abs(dpn) <= 2) pairsPred2++
                line += ` | quick-prediction: east ${f(dpe, 1)} north ${f(dpn, 1)} errors`
                if (full) {
                    const de = (q.east - full.east) / Math.hypot(q.eastErr, full.ee)
                    const dn = (q.north - full.north) / Math.hypot(q.northErr, full.en)
                    if (Math.abs(de) <= 2 && Math.abs(dn) <= 2) pairsWithin2++
                    line += ` | quick-full: east ${f(q.east - full.east)} (${f(de, 1)} errors) north ${f(q.north - full.north)} (${f(dn, 1)} errors)`
                }
            } else line += ' | quick look: not measured'
            console.log(line)
        }
    }
}
console.log(`\nepoch pairs measured by the quick look: ${pairsTotal}`)
console.log(`pairs within 2 combined errors of the full pipeline in east and north: ${pairsWithin2}`)
console.log(`pairs within 2 quick-look errors of the catalogue prediction in east and north: ${pairsPred2}`)