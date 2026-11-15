// Vercel function: resolve a name at SIMBAD and list the SPHEREx exposures at IRSA.
//
//   /api/lookup?target=<name>        name resolved at SIMBAD (position, proper motion, parallax)
//   /api/lookup?ra=<deg>&dec=<deg>   position used as given
//
// The browser cannot call these services itself: the IRSA SIA service sends no CORS
// header (logs/sia_probe.log). Only the exposure list passes through this function;
// image bytes are read by the browser straight from the public cloud copy.
// Limits of the Vercel Hobby plan (logs/vercel_limits.log): 300 s, 4.5 MB response.
// The largest SIA answer measured was 0.32 MB; only the needed columns are returned.

const SIA = 'https://irsa.ipac.caltech.edu/SIA'
const SIMBAD = [
    'https://simbad.harvard.edu/simbad/sim-script',
    'https://simbad.cds.unistra.fr/simbad/sim-script'
]
const COLLECTIONS = ['spherex_dr1', 'spherex_qr3']
const IBE = 'https://irsa.ipac.caltech.edu/ibe/data/spherex/'
const RADIUS_DEG = 0.01
// The SIA query is centred on the position moved to this epoch (proper motion only).
const QUERY_EPOCH = 2026.0
// IRSA answered 9 of 12 test queries with "502 Proxy Error" (logs/sia_probe.log): retry.
// In the local test one collection needed 12 attempts (logs/lookup_local.log), so the
// time budget is the real limit, not the number of attempts.
const SIA_TRIES = 40
const SIA_BUDGET_MS = 45000
// The last field is the K magnitude: the quick look gives no rough motion for stars that are
// probably saturated (logs/k_saturation.log).
const FORMAT =
    '%IDLIST(1)|%COO(d;A;ICRS;J2000;2000)|%COO(d;D;ICRS;J2000;2000)|%COO(B)|' +
    '%PM(A)|%PM(D)|%PM(B)|%PLX(V)|%PLX(B)|%RV(V)|%SP(S)|%OTYPE(S)|%FLUXLIST(K;F)'
const N_FIELDS = 13

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const num = (s) => {
    const v = Number.parseFloat(String(s).trim())
    return Number.isFinite(v) ? v : null
}

async function fetchText(url, ms) {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), ms)
    try {
        const r = await fetch(url, { signal: ctl.signal })
        return { status: r.status, text: await r.text() }
    } finally {
        clearTimeout(timer)
    }
}

// Returns { found: true, target } | { found: false } ; throws if no SIMBAD server answers.
async function resolveName(name) {
    const script = `output console=off script=off\nformat object "${FORMAT}"\nquery id ${name}\n`
    let last = 'no attempt'
    for (const base of SIMBAD) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const r = await fetchText(`${base}?script=${encodeURIComponent(script)}`, 15000)
                if (r.status !== 200) {
                    last = `${base}: HTTP ${r.status}`
                    continue
                }
                const rows = r.text
                    .split('\n')
                    .filter((ln) => ln.split('|').length === N_FIELDS && !/error/i.test(ln))
                if (rows.length !== 1) return { found: false }
                const p = rows[0].split('|').map((s) => s.trim())
                const ra = num(p[1])
                const dec = num(p[2])
                if (ra === null || dec === null) return { found: false }
                return {
                    found: true,
                    target: {
                        name: p[0],
                        ra_deg: ra,
                        dec_deg: dec,
                        coord_epoch: 'J2000.0 (ICRS)',
                        pmra_masyr: num(p[4]),
                        pmdec_masyr: num(p[5]),
                        pm_bibcode: p[6] || null,
                        plx_mas: num(p[7]),
                        plx_bibcode: p[8] || null,
                        sp_type: p[10] || null,
                        otype: p[11] || null,
                        k_mag: num(p[12]),
                        source: `SIMBAD (${new URL(base).host})`
                    }
                }
            } catch (e) {
                last = `${base}: ${e}`
            }
        }
    }
    throw new Error(`SIMBAD not reachable (${last})`)
}

// One CSV line into fields; double quotes are honoured.
function splitCsv(line) {
    const out = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (quoted) {
            if (c === '"' && line[i + 1] === '"') {
                cur += '"'
                i++
            } else if (c === '"') quoted = false
            else cur += c
        } else if (c === '"') quoted = true
        else if (c === ',') {
            out.push(cur)
            cur = ''
        } else cur += c
    }
    out.push(cur)
    return out
}

// SIA CSV -> compact exposure rows. Returns null if the text is not the SIA table.
// Exported for site/scripts/save_lookup.mjs (saved exposure lists for archive outages).
export function parseSia(text, collIndex) {
    const lines = text.split(/\r?\n/).filter((ln) => ln.length > 0)
    if (!lines.length) return null
    const header = splitCsv(lines[0])
    const col = (name) => header.indexOf(name)
    const need = ['obs_id', 't_min', 't_max', 'energy_bandpassname', 'access_url', 'em_min', 'em_max']
    if (need.some((n) => col(n) < 0)) return null
    // IRSA leaves the JSON of the cloud_access column unquoted; its commas add fields
    // after that column. All columns used here must therefore lie before it.
    const cloud = col('cloud_access')
    if (cloud >= 0 && need.some((n) => col(n) > cloud)) return null
    const rows = []
    for (const line of lines.slice(1)) {
        const f = splitCsv(line)
        const det = /D([1-6])\s*$/.exec(f[col('energy_bandpassname')] ?? '')
        const tMin = num(f[col('t_min')])
        const tMax = num(f[col('t_max')])
        const url = f[col('access_url')] ?? ''
        if (!det || tMin === null || !url.startsWith(IBE)) continue
        // Path in the cloud bucket: the "key" of cloud_access, else the path of access_url
        // (equal in the files checked, logs/range_probe.log).
        const key = /"key"\s*:\s*"([^"]+)"/.exec(line)
        rows.push([
            Number(((tMin + (tMax ?? tMin)) / 2).toFixed(5)),
            Number(det[1]),
            collIndex,
            key ? key[1] : url.slice(IBE.length),
            Number(((num(f[col('em_min')]) ?? 0) * 1e6).toFixed(4)),
            Number(((num(f[col('em_max')]) ?? 0) * 1e6).toFixed(4))
        ])
    }
    return rows
}

async function siaList(coll, collIndex, ra, dec, deadline) {
    const url = `${SIA}?COLLECTION=${coll}&POS=${encodeURIComponent(`circle ${ra} ${dec} ${RADIUS_DEG}`)}&RESPONSEFORMAT=CSV`
    let last = 'no attempt'
    let attempts = 0
    while (attempts < SIA_TRIES && Date.now() < deadline) {
        attempts++
        try {
            const r = await fetchText(url, Math.max(2000, Math.min(20000, deadline - Date.now())))
            if (r.status === 200) {
                const rows = parseSia(r.text, collIndex)
                if (rows) return { id: coll, ok: true, attempts, rows }
                last = 'HTTP 200, but not the SIA table'
            } else last = `HTTP ${r.status}`
        } catch (e) {
            last = String(e)
        }
        await sleep(400)
    }
    return { id: coll, ok: false, attempts, rows: [], error: last }
}

function send(res, status, body, cacheSeconds) {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', cacheSeconds ? `public, s-maxage=${cacheSeconds}, max-age=300` : 'no-store')
    res.end(JSON.stringify(body))
}

export default async function handler(req, res) {
    const t0 = Date.now()
    const q = new URL(req.url, 'http://localhost').searchParams
    // A name goes into a SIMBAD script: one line, no control characters, no quotes.
    const name = (q.get('target') ?? '').replace(/[\u0000-\u001f"\\]/g, ' ').trim().slice(0, 80)
    const ra = num(q.get('ra') ?? '')
    const dec = num(q.get('dec') ?? '')

    let target = null
    let pos
    if (name) {
        let r
        try {
            r = await resolveName(name)
        } catch (e) {
            return send(res, 502, { ok: false, error: 'simbad_unreachable', message: String(e.message ?? e) })
        }
        if (!r.found) {
            return send(res, 404, { ok: false, error: 'name_not_found', message: `SIMBAD does not know "${name}".` }, 3600)
        }
        target = r.target
        const dt = QUERY_EPOCH - 2000.0
        pos = {
            ra_deg:
                (((target.ra_deg +
                    ((target.pmra_masyr ?? 0) * dt) / 3.6e6 / Math.cos((target.dec_deg * Math.PI) / 180)) %
                    360) +
                    360) %
                360,
            dec_deg: target.dec_deg + ((target.pmdec_masyr ?? 0) * dt) / 3.6e6,
            epoch: QUERY_EPOCH,
            model: 'SIMBAD J2000 position + proper motion, no parallax'
        }
    } else if (ra !== null && dec !== null && ra >= 0 && ra < 360 && dec >= -90 && dec <= 90) {
        pos = { ra_deg: ra, dec_deg: dec, epoch: null, model: 'position as entered' }
    } else {
        return send(res, 400, {
            ok: false,
            error: 'bad_request',
            message: 'Give target=<name> or ra=<deg 0..360>&dec=<deg -90..90>.'
        })
    }

    const deadline = t0 + SIA_BUDGET_MS
    const lists = await Promise.all(
        COLLECTIONS.map((c, i) => siaList(c, i, pos.ra_deg.toFixed(7), pos.dec_deg.toFixed(7), deadline))
    )
    const exposures = lists.flatMap((l) => l.rows).sort((a, b) => a[0] - b[0])
    const failed = lists.filter((l) => !l.ok)
    const body = {
        ok: failed.length < lists.length,
        target,
        pos,
        collections: lists.map((l) => ({ id: l.id, ok: l.ok, attempts: l.attempts, rows: l.rows.length, error: l.error ?? null })),
        columns: ['mjd_mid', 'detector', 'collection_index', 'cloud_key', 'em_min_um', 'em_max_um'],
        exposures,
        elapsed_ms: Date.now() - t0
    }
    if (failed.length === lists.length) {
        body.error = 'archive_unreachable'
        body.message = `The IRSA archive did not answer (${failed[0].error}).`
        return send(res, 502, body)
    }
    // A complete answer may be cached by the CDN; a partial one is not.
    return send(res, 200, body, failed.length ? 0 : 21600)
}