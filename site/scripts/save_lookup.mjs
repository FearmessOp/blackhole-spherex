// Saved exposure lists for archive outages: data/sia/<slug>_spherex_{dr1,qr3}.csv -> the
// answer format of /api/lookup, written to site/public/data/lookup/<slug>.json.
// The rows are parsed with parseSia of site/api/lookup.js, so they are what the function
// would have returned. "saved_at" is the time the CSV files were written, not the time of this run.
// Saved answers in %TEMP%\lookup_saved\*.json (if any) are copied as they are.
//
// Usage: node site/scripts/save_lookup.mjs > logs/save_lookup.log 2>&1
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSia } from '../api/lookup.js'

const OUT = 'site/public/data/lookup'
const COLLECTIONS = ['spherex_dr1', 'spherex_qr3']
mkdirSync(OUT, { recursive: true })

const cands = JSON.parse(readFileSync('data/variable_candidate.json', 'utf8'))
for (const c of cands.filter((x) => x.slug === 'fq-pav')) {
    const lists = COLLECTIONS.map((id, i) => {
        const path = `data/sia/${c.slug}_${id}.csv`
        const rows = parseSia(readFileSync(path, 'utf8'), i)
        return { id, path, ok: rows !== null, rows: rows ?? [], mtime: statSync(path).mtime }
    })
    const savedAt = new Date(Math.max(...lists.map((l) => l.mtime.getTime()))).toISOString()
    const body = {
        ok: true,
        saved_at: savedAt,
        saved_from: lists.map((l) => l.path),
        target: {
            name: c.name,
            ra_deg: c.ra_deg,
            dec_deg: c.dec_deg,
            coord_epoch: c.coord_epoch,
            pmra_masyr: c.pmra_masyr,
            pmdec_masyr: c.pmdec_masyr,
            pm_bibcode: c.pm_bibcode || null,
            plx_mas: c.plx_mas,
            plx_bibcode: c.plx_bibcode || null,
            sp_type: c.sp_type || null,
            otype: c.otype || null,
            k_mag: c.k_mag,
            source: 'SIMBAD (data/variable_candidate.json)'
        },
        pos: { ra_deg: c.ra_query_deg, dec_deg: c.dec_query_deg, epoch: c.query_epoch, model: 'saved query position' },
        collections: lists.map((l) => ({ id: l.id, ok: l.ok, attempts: 0, rows: l.rows.length, error: l.ok ? null : 'not the SIA table' })),
        columns: ['mjd_mid', 'detector', 'collection_index', 'cloud_key', 'em_min_um', 'em_max_um'],
        exposures: lists.flatMap((l) => l.rows).sort((a, b) => a[0] - b[0])
    }
    writeFileSync(join(OUT, `${c.slug}.json`), JSON.stringify(body))
    console.log(c.slug, 'saved_at', savedAt, lists.map((l) => `${l.id}: ${l.rows.length} rows`).join(', '), 'total', body.exposures.length)
}

const tmp = join(process.env.TEMP ?? '', 'lookup_saved')
if (existsSync(tmp)) {
    for (const f of readdirSync(tmp).filter((n) => n.endsWith('.json'))) {
        copyFileSync(join(tmp, f), join(OUT, f))
        console.log('copied', join(tmp, f))
    }
} else console.log('no folder', tmp)