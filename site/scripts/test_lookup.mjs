// Local test of api/lookup.js without a server: calls the handler with mock request/response objects.
//
// Usage (from site/): node scripts/test_lookup.mjs > ..\logs\lookup_local.log 2>&1
import handler from '../api/lookup.js'

const CASES = [
    '/api/lookup?target=eps%20Ind%20B',
    '/api/lookup?target=WISE%20J085510.83-071442.5',
    '/api/lookup?target=Wolf%20359',
    '/api/lookup?ra=165.83&dec=7.01',
    '/api/lookup?target=no%20such%20star%20xyz123',
    '/api/lookup?ra=400&dec=7',
    '/api/lookup'
]

function call(url) {
    return new Promise((resolve) => {
        const headers = {}
        const res = {
            statusCode: 0,
            setHeader: (k, v) => {
                headers[k] = v
            },
            end: (body) => resolve({ status: res.statusCode, headers, body })
        }
        handler({ url }, res).catch((e) => resolve({ status: -1, headers, body: JSON.stringify({ thrown: String(e) }) }))
    })
}

for (const url of CASES) {
    const t0 = Date.now()
    const r = await call(url)
    const ms = Date.now() - t0
    const b = JSON.parse(r.body)
    console.log(`===== ${url}`)
    console.log(`status=${r.status} time=${ms}ms response_bytes=${Buffer.byteLength(r.body)} cache=${r.headers['Cache-Control']}`)
    console.log(`ok=${b.ok} error=${b.error ?? null} message=${b.message ?? null}`)
    if (b.target) console.log(`target=${JSON.stringify(b.target)}`)
    if (b.pos) console.log(`pos=${JSON.stringify(b.pos)}`)
    if (b.collections) console.log(`collections=${JSON.stringify(b.collections)}`)
    if (b.exposures) {
        const e = b.exposures
        const dets = {}
        for (const x of e) dets[x[1]] = (dets[x[1]] ?? 0) + 1
        console.log(`exposures=${e.length} per_detector=${JSON.stringify(dets)} columns=${JSON.stringify(b.columns)}`)
        if (e.length) {
            console.log(`first=${JSON.stringify(e[0])}`)
            console.log(`last=${JSON.stringify(e[e.length - 1])}`)
            // epochs: exposures more than 30 days apart start a new one (same rule as the pipeline)
            const ep = [1]
            for (let i = 1; i < e.length; i++) {
                if (e[i][0] - e[i - 1][0] > 30) ep.push(1)
                else ep[ep.length - 1]++
            }
            console.log(`epochs=${JSON.stringify(ep)}`)
        }
    }
}