// Test of src/quicklook.ts against astropy (data/quicklook/wcs_reference.json, written by
// pipeline/wcs_reference.py): header parsing, TAN-SIP in both directions, data offset and
// the 3x3 pixel values read with Range requests from the cloud copy.
//
// Usage (from site/): node scripts/test_wcs.mjs > ..\logs\test_wcs.log 2>&1
import { readFileSync } from 'node:fs'
import { makeWcs, parseHeader, pixToWorld, readCutout, worldToPix } from '../src/quicklook.ts'

const ref = JSON.parse(readFileSync(new URL('../../data/quicklook/wcs_reference.json', import.meta.url), 'utf8'))
const D2R = Math.PI / 180
let worstPix = 0
let worstSky = 0
let worstRound = 0
let boxMismatch = 0
let offMismatch = 0
let failed = 0
const counter = { requests: 0, bytes: 0 }

console.log(`node ${process.version}; ${ref.cases.length} cases from wcs_reference.json (${ref.slug})`)
for (const c of ref.cases) {
    const parsed = parseHeader(c.header, 0)
    if (!parsed) {
        console.log(`${c.key}: header not parsed`)
        failed++
        continue
    }
    const w = makeWcs(parsed.header)

    // sky -> pixel against astropy all_world2pix
    let dPix = 0
    c.world.forEach(([ra, dec], k) => {
        const [x, y] = worldToPix(w, ra, dec)
        dPix = Math.max(dPix, Math.hypot(x - c.world_to_pix[k][0], y - c.world_to_pix[k][1]))
    })
    // pixel -> sky against astropy all_pix2world (arcsec on the sky)
    let dSky = 0
    c.pix.forEach(([x, y], k) => {
        const [ra, dec] = pixToWorld(w, x, y)
        const [ra0, dec0] = c.pix_to_world[k]
        const dra = (((ra - ra0 + 540) % 360) - 180) * Math.cos(dec0 * D2R)
        dSky = Math.max(dSky, Math.hypot(dra, dec - dec0) * 3600)
    })
    // own round trip pixel -> sky -> pixel
    let dRound = 0
    for (const [x, y] of c.pix) {
        const [ra, dec] = pixToWorld(w, x, y)
        const [x2, y2] = worldToPix(w, ra, dec)
        dRound = Math.max(dRound, Math.hypot(x2 - x, y2 - y))
    }
    worstPix = Math.max(worstPix, dPix)
    worstSky = Math.max(worstSky, dSky)
    worstRound = Math.max(worstRound, dRound)

    // Range read: 3x3 pixels at the target, against the values read by Python
    let line = ''
    try {
        const [ra, dec] = c.world[12]
        const cut = await readCutout(c.key, ra, dec, 1, counter)
        if (!cut) throw new Error('position outside the detector')
        const offOk = cut.dataOff === c.data_off
        const posOk = cut.x0 === c.box_ix - 1 && cut.y0 === c.box_iy - 1 && cut.w === 3 && cut.h === 3
        let dBox = 0
        let nanOk = true
        for (let j = 0; j < 3; j++) {
            for (let i = 0; i < 3; i++) {
                const a = cut.data[j * 3 + i]
                const b = c.box[j][i]
                if (b === null || !Number.isFinite(a)) nanOk = nanOk && b === null && !Number.isFinite(a)
                else dBox = Math.max(dBox, Math.abs(a - b))
            }
        }
        if (!offOk) offMismatch++
        if (!posOk || !nanOk || dBox !== 0) boxMismatch++
        line = `data_off ts=${cut.dataOff} py=${c.data_off} equal=${offOk} box_position_equal=${posOk} ` +
            `box_max_abs_diff=${dBox} nan_pattern_equal=${nanOk} detector=${cut.detector} mjd=${cut.mjd}`
    } catch (e) {
        failed++
        line = `RANGE READ FAILED: ${e}`
    }
    console.log(`${c.key}`)
    console.log(`  detector ${c.detector} ${c.collection}: sky->pix max diff=${dPix.toExponential(2)} px (25 points); ` +
        `pix->sky max diff=${dSky.toExponential(2)} arcsec (7 points); round trip=${dRound.toExponential(2)} px`)
    console.log(`  ${line}`)
}
console.log(`\nworst sky->pixel difference to astropy: ${worstPix.toExponential(2)} px`)
console.log(`worst pixel->sky difference to astropy: ${worstSky.toExponential(2)} arcsec`)
console.log(`worst round trip: ${worstRound.toExponential(2)} px`)
console.log(`data offset mismatches: ${offMismatch}; 3x3 box mismatches: ${boxMismatch}; failed cases: ${failed}`)
console.log(`range requests: ${counter.requests}, bytes: ${counter.bytes}`)