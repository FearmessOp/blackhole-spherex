// All text of the site, in one place: English (default) and Turkish.
// A key that is missing in Turkish falls back to English. Numbers, units, catalogue
// names and log paths are passed in as values and are never translated.
// Language: ?lang=tr or ?lang=en in the address, else the choice kept in localStorage, else English.
import { createElement, Fragment, useSyncExternalStore, type ReactNode } from 'react'

export type Lang = 'en' | 'tr'
type Vars = Record<string, string | number>
type RichVars = Record<string, ReactNode>

const STORE_KEY = 'spherex-lang'
const isLang = (v: unknown): v is Lang => v === 'en' || v === 'tr'

function initialLang(): Lang {
    const q = new URLSearchParams(window.location.search).get('lang')
    if (isLang(q)) return q
    try {
        const s = window.localStorage.getItem(STORE_KEY)
        if (isLang(s)) return s
    } catch {
        // localStorage can be blocked; the default is used then
    }
    return 'en'
}

let current: Lang = initialLang()
const listeners = new Set<() => void>()
document.documentElement.lang = current

// Turkish taken from localStorage: the address gets lang=tr too, so that a copied link keeps the language.
if (current === 'tr') {
    const url = new URL(window.location.href)
    if (url.searchParams.get('lang') !== 'tr') {
        url.searchParams.set('lang', 'tr')
        window.history.replaceState(null, '', url)
    }
}

export const getLang = (): Lang => current

// Adds ?lang=tr to an address of this site so that a shared link keeps the language.
export function withLang(url: string): string {
    if (current !== 'tr') return url
    return url + (url.includes('?') ? '&' : '?') + 'lang=tr'
}

export function setLang(l: Lang) {
    current = l
    try {
        window.localStorage.setItem(STORE_KEY, l)
    } catch {
        // not kept; the address still carries the choice
    }
    const url = new URL(window.location.href)
    if (l === 'tr') url.searchParams.set('lang', 'tr')
    else url.searchParams.delete('lang')
    window.history.replaceState(null, '', url)
    document.documentElement.lang = l
    listeners.forEach((f) => f())
}

function subscribe(f: () => void) {
    listeners.add(f)
    return () => {
        listeners.delete(f)
    }
}

// ---------------------------------------------------------------- opening, target selector, tabs
const enOpening = {
    'app.title': 'SPHEREx motion viewer',
    'app.tagline': 'Blinks SPHEREx images of a patch of sky in time order, so that you can see what moves and how far.',
    'app.scale': '1 pixel = 6.15 arcsec',
    'app.howto': 'How to read this page',
    'guide.start': 'Find the mover',
    'guide.start.sub': 'New here? Spot three real moving objects in about a minute.',
    'search.label': 'Any star or position',
    'search.placeholder': 'Star name (Wolf 359) or RA Dec in degrees (164.0924 6.9952)',
    'search.placeholder.short': 'Star name or RA Dec (deg)',
    'search.show': 'Show',
    'search.badpos': 'RA must be between 0 and 360 degrees and Dec between -90 and +90 degrees.',
    'search.badurl': 'The address of this page holds no usable position.',
    'targets.fast': 'Fast movers, a test of the fit',
    'targets.fast.pick': 'Fast movers, a test of the fit ({n})…',
    'targets.loading': 'Loading target list…',
    'targets.empty': 'No prepared targets are available; enter a star name or a position above.',
    'card.meta': '{n} exposures · {e} epochs',
    'tab.images': 'Images',
    'tab.measurement': 'Measurement',
    'tab.validation': 'Validation',
    'load.target': 'Loading…',
    'load.failed': 'Could not load the data for this target.',
    'foot.team': 'NASA Space Apps Challenge 2026 · team Blackhole 102',
    'foot.data': 'Data: SPHEREx (NASA/IPAC IRSA), SIMBAD (CDS), Gaia DR3 (ESA)',
    'foot.code': 'Source code',
    'foot.license': 'Apache-2.0; Gaia rows CC BY-NC 3.0 IGO'
} as const

const trOpening = {
    'app.title': 'SPHEREx hareket görüntüleyici',
    'app.tagline': 'SPHEREx görüntülerini zaman sırasıyla art arda gösterir; neyin, ne kadar hareket ettiğini görürsünüz.',
    'app.scale': '1 piksel = 6.15 arcsec',
    'app.howto': 'Bu sayfa nasıl okunur',
    'guide.start': 'Hareket edeni bul',
    'guide.start.sub': 'İlk kez mi buradasınız? Bir dakikada üç gerçek hareketli cismi bulun.',
    'search.label': 'Herhangi bir yıldız ya da konum',
    'search.placeholder': 'Yıldız adı (Wolf 359) ya da derece olarak RA Dec (164.0924 6.9952)',
    'search.placeholder.short': 'Yıldız adı ya da RA Dec (derece)',
    'search.show': 'Göster',
    'search.badpos': 'RA 0 ile 360 derece, Dec -90 ile +90 derece arasında olmalı.',
    'search.badurl': 'Bu sayfanın adresinde kullanılabilir bir konum yok.',
    'targets.fast': 'Hızlı cisimler, fit için bir sınama',
    'targets.fast.pick': 'Hızlı cisimler, fit için bir sınama ({n})…',
    'targets.loading': 'Hedef listesi yükleniyor…',
    'targets.empty': 'Hazır hedef yok; yukarıya bir yıldız adı ya da konum girin.',
    'card.meta': '{n} pozlama · {e} dönem',
    'tab.images': 'Görüntüler',
    'tab.measurement': 'Ölçüm',
    'tab.validation': 'Doğrulama',
    'load.target': 'Yükleniyor…',
    'load.failed': 'Bu hedefin verisi yüklenemedi.',
    'foot.team': 'NASA Space Apps Challenge 2026 · Blackhole 102 takımı',
    'foot.data': 'Veri: SPHEREx (NASA/IPAC IRSA), SIMBAD (CDS), Gaia DR3 (ESA)',
    'foot.code': 'Kaynak kod',
    'foot.license': 'Apache-2.0; Gaia satırları CC BY-NC 3.0 IGO'
}

// ---------------------------------------------------------------- controls, image panels
const enPanels = {
    'ctl.playback': 'Playback',
    'ctl.pause': 'Pause',
    'ctl.play': 'Play',
    'ctl.view': 'View',
    'ctl.blink': 'Blink epochs',
    'ctl.diff': 'Difference',
    'ctl.diff.title': 'Last epoch minus first epoch',
    'ctl.diff.none': 'No usable difference image for this detector selection',
    'ctl.diff.none.quick': 'No detector was read in both the first and the last epoch',
    'ctl.epoch': 'Epoch',
    'ctl.speed': 'Speed',
    'speed.slow': 'Slow',
    'speed.normal': 'Normal',
    'speed.fast': 'Fast',
    'ctl.detector': 'Detector',
    'ctl.overlay': 'Overlay',
    'ctl.marker': 'Catalogue position (SIMBAD position + proper motion)',
    'ctl.marker.entered': 'Entered position',
    'band.all': 'All',
    'band.label.all': 'All detectors',
    'band.label.d123': 'Detectors 1-3 (short wavelength)',
    'band.label.d56': 'Detectors 5+6 (long wavelength)',
    'band.label.det': 'Detector {n}',
    'sky.compass': 'N up, E left',
    'sky.motion': 'motion ×{k}',
    'panel.stack': 'Stacked per epoch: {band}',
    'panel.raw': 'Raw exposures, one at a time',
    'panel.diff': 'Difference: epoch {b} minus epoch {a}, {band}',
    'panel.epoch': 'Epoch {i} of {n}: {from} to {to}',
    'panel.stack.detail': '{n} exposures stacked, {lo}–{hi} µm',
    'panel.stack.none': 'No exposures of this detector selection in this epoch',
    'raw.caption': '{w} µm, detector {d}',
    'raw.detail': '{t} UTC, epoch {e}, {rel}, exposure {i} of {n}',
    'raw.failed': 'Could not load the raw exposures.',
    'raw.loading': 'Loading raw exposures…',
    'raw.none': 'No raw exposures for this detector selection.',
    'diff.caption': 'bright = where it is now, dark = where it was',
    'diff.detail':
        'Detectors {dets} (those with exposures in both epochs), {n1} and {n2} exposures. Linear scale, zero is mid grey, ±{vmax} MJy/sr. Check: {stars} constant field stars leave {med} (median) and {p90} (90th percentile) of their own peak in this image; the bright and the dark side of the target are {bright} and {dark} of its peak. The amber marker is the catalogue position in the last epoch.',
    'compare.title': 'Short versus long wavelength',
    'compare.detail':
        'The same epoch in two stacks. Each band has its own brightness scale; the amber marker is the catalogue position of the target.',
    'label.target': 'target, catalogue position',
    'label.neighbour': 'Gaia neighbour, not the target',
    'label.gaia': 'Gaia star, not the target',
    'sum.fit':
        'This star moves across the sky by {v} arcsec per year; the catalogue says {c}. Its parallax (distance) comes out {pct}% {side} the catalogue.',
    'sum.above': 'above',
    'sum.below': 'below',
    'sum.stack':
        'Between the first and last epoch this object moved {v} arcsec; the catalogue predicts {c}. It is only seen at long wavelength.',
    'sum.sat': 'Too bright for SPHEREx: the core is saturated in {a} of {b} exposures, so its position cannot be measured.',
    'sum.nofit': 'Too few clean exposures to measure its motion: {u} of {b} are usable.',
    'sum.none': 'No measurement for this target yet.',
    'raw.black': 'Black pixels in the core: saturated, no value.',
    'search.aria': 'Any star or position',
    'ctl.keys': 'Keys: Space play / pause, ← → epoch'
} as const

const trPanels = {
    'ctl.playback': 'Oynatma',
    'ctl.pause': 'Duraklat',
    'ctl.play': 'Oynat',
    'ctl.view': 'Görünüm',
    'ctl.blink': 'Dönemleri art arda göster',
    'ctl.diff': 'Fark',
    'ctl.diff.title': 'Son dönem eksi ilk dönem',
    'ctl.diff.none': 'Bu dedektör seçimi için kullanılabilir fark görüntüsü yok',
    'ctl.diff.none.quick': 'Hem ilk hem son dönemde okunan dedektör yok',
    'ctl.epoch': 'Dönem',
    'ctl.speed': 'Hız',
    'speed.slow': 'Yavaş',
    'speed.normal': 'Normal',
    'speed.fast': 'Hızlı',
    'ctl.detector': 'Dedektör',
    'ctl.overlay': 'İşaret',
    'ctl.marker': 'Katalog konumu (SIMBAD konumu + özdevinim)',
    'ctl.marker.entered': 'Girilen konum',
    'band.all': 'Hepsi',
    'band.label.all': 'Bütün dedektörler',
    'band.label.d123': 'Dedektör 1-3 (kısa dalga boyu)',
    'band.label.d56': 'Dedektör 5+6 (uzun dalga boyu)',
    'band.label.det': 'Dedektör {n}',
    'sky.compass': 'K yukarı, D sol',
    'sky.motion': 'hareket ×{k}',
    'panel.stack': 'Dönem toplamı: {band}',
    'panel.raw': 'Ham pozlamalar, tek tek',
    'panel.diff': 'Fark: dönem {b} eksi dönem {a}, {band}',
    'panel.epoch': 'Dönem {i} / {n}: {from} – {to}',
    'panel.stack.detail': '{n} pozlama toplandı, {lo}–{hi} µm',
    'panel.stack.none': 'Bu dönemde bu dedektör seçiminin pozlaması yok',
    'raw.caption': '{w} µm, dedektör {d}',
    'raw.detail': '{t} UTC, dönem {e}, {rel}, pozlama {i} / {n}',
    'raw.failed': 'Ham pozlamalar yüklenemedi.',
    'raw.loading': 'Ham pozlamalar yükleniyor…',
    'raw.none': 'Bu dedektör seçimi için ham pozlama yok.',
    'diff.caption': 'parlak = şimdi olduğu yer, koyu = önce olduğu yer',
    'diff.detail':
        'Dedektör {dets} (iki dönemde de pozlaması olanlar), {n1} ve {n2} pozlama. Doğrusal ölçek, sıfır orta gri, ±{vmax} MJy/sr. Kontrol: {stars} sabit alan yıldızı bu görüntüde kendi tepe değerinin {med} (ortanca) ve {p90} (90. yüzdelik) kadarını bırakıyor; hedefin parlak ve koyu yanı kendi tepe değerinin {bright} ve {dark} kadarı. Amber işaret son dönemdeki katalog konumudur.',
    'compare.title': 'Kısa ve uzun dalga boyu',
    'compare.detail':
        'Aynı dönem, iki ayrı toplamda. Her bandın kendi parlaklık ölçeği var; amber işaret hedefin katalog konumudur.',
    'label.target': 'hedef, katalog konumu',
    'label.neighbour': 'Gaia komşusu, hedef değil',
    'label.gaia': 'Gaia yıldızı, hedef değil',
    'sum.fit':
        'Bu yıldız gökyüzünde yılda {v} arcsec yol alıyor; katalog {c} diyor. Paralaksı (uzaklığı) kataloğun %{pct} {side} çıkıyor.',
    'sum.above': 'üstünde',
    'sum.below': 'altında',
    'sum.stack':
        'İlk ve son dönem arasında bu cisim {v} arcsec yol aldı; katalog {c} öngörüyor. Yalnızca uzun dalga boyunda görülüyor.',
    'sum.sat': 'SPHEREx için fazla parlak: çekirdeği {b} pozlamanın {a} tanesinde doymuş, bu yüzden konumu ölçülemiyor.',
    'sum.nofit': 'Hareketini ölçmek için temiz pozlama az: {b} pozlamanın {u} tanesi kullanılabilir.',
    'sum.none': 'Bu hedef için henüz ölçüm yok.',
    'raw.black': 'Çekirdekteki siyah pikseller: doymuş, değer yok.',
    'search.aria': 'Herhangi bir yıldız ya da konum',
    'ctl.keys': 'Tuşlar: Boşluk oynat / duraklat, ← → dönem'
}

// ---------------------------------------------------------------- guided mode "Find the mover"
const enGuide = {
    'guide.title': 'Find the mover',
    'guide.step': 'Step {i} of {n}',
    'guide.skip': 'Skip the guide',
    'guide.close': 'Close the guide',
    'guide.done':
        'Those were three real movers in SPHEREx images. Now look at any other star: type a name or a position into the search box.',
    'guide.tosearch': 'Go to the search box',
    'guide.again': 'Play again',
    'guide.failed': 'Could not load the data for this step.',
    'guide.next': 'Next',
    'guide.finish': 'Finish',
    'guide.showme': 'Show me',
    'guide.hint.show': 'Show a hint',
    'guide.hint.hide': 'Hide the hint',
    'guide.band.d123': 'Short wavelength (D1–3)',
    'guide.band.d56': 'Long wavelength (D5+6)',
    'guide.ask.barnard':
        'Three stacks of the same patch of sky, taken months apart, are blinked. One star changes pixel: click it.',
    'guide.ask.eps':
        'This one moves by only about one pixel over four epochs. Click the source that shifts; a difference image is there as a hint.',
    'guide.ask.wise.long': 'At long wavelength a faint source appears and moves towards the marked Gaia star. Click it.',
    'guide.ask.wise.short':
        'At short wavelength this cold object is not seen; the marked source is a Gaia star, not the target. Switch to long wavelength, then click what appears and moves.',
    'guide.where': '{arcsec} arcsec ({px} pixels) from its catalogue position in epoch {e} of {n}',
    'guide.fb.step': 'Right for epoch {e}: your click was {where}. Now click it in epoch {next}.',
    'guide.fb.hit':
        'Found in every epoch: this is the object that moves. Your last click was {where}. The amber dots are its catalogue positions in all {n} epochs.',
    'guide.fb.shown': 'The amber marker now shows the catalogue position of the target.',
    'guide.fb.neighbour': 'That is the marked Gaia star. The target is the object that moves; your click was {where}.',
    'guide.fb.band': 'The target is not visible at short wavelength. Your click was {where}; switch to long wavelength.',
    'guide.fb.miss.hint': 'Not the mover. Your click was {where}. The difference image is shown as a hint.',
    'guide.fb.miss.again': 'Not the mover. Your click was {where}. Try again.',
    'guide.explain.base':
        '{name}: between the first and the last epoch the catalogue moves it by {arcsec} arcsec ({px} pixels).',
    'guide.explain.sat':
        'Its core is saturated in {a} of {b} exposures, so the site shows no measured motion for it.',
    'guide.explain.eps':
        '{name}, a pair of brown dwarfs: measured proper motion (ePSF fit) {e} ± {ee} east and {n} ± {ne} north in mas/yr; SIMBAD gives {re} and {rn}. The arrow is drawn {k} times longer than the motion.',
    'guide.explain.wise':
        '{name}, seen only at long wavelength: from the first to the last epoch it moved {e} ± {ee} arcsec east and {n} ± {ne} north ({method}). The catalogue predicts {pe} and {pn}.',
    'guide.click': 'Click the object that moves where it is in epoch {e} of {n} (see the epoch line under the image). One click per epoch, in order.',
    'guide.click.badge': 'Click the image',
    'guide.stacked': '{n} exposures stacked',
    'guide.hint.title': 'Hint: epoch {b} minus epoch {a}',
    'guide.hint.detail':
        'Whatever stays in place cancels to grey; a source that moved leaves a bright and a dark side.',
    'game.play': 'Play the game',
    'game.title': 'Find the mover: game',
    'game.hud': 'Round {i} · score {s} · found {f} of {p}',
    'game.end': 'End game',
    'game.close': 'Close the game',
    'game.ask': 'Somewhere in this patch of sky one object moves between the epochs. Click it in every epoch, in order.',
    'game.step': 'Epoch {e} of {n}: click the mover where it is in this epoch.',
    'game.time': '{s} s',
    'game.hint': 'Hint (−{p})',
    'game.miss': 'Not the mover ({n} wrong, −{p} each). Try again.',
    'game.hit': 'Found in {s} s: {name}. Round score {r}.',
    'game.shown': 'Shown: {name}. No points for this round.',
    'game.next': 'Next star',
    'game.open': 'Open this target',
    'game.failed': 'Could not load the game targets.',
    'game.summary':
        'Game over. Rounds played: {r}; found: {f}; mean time: {t} s; total score: {s}. Best score in this browser: {b}.',
    'game.rules.title': 'How scoring works',
    'game.rules':
        'The object is clicked once per epoch, in epoch order; a click counts when it is within {px} pixels of the object\'s catalogue position in that epoch. Found in every epoch: {f} points; each wrong click −{w}; hint opened −{h}; time bonus from +{b} at 0 s down to 0 at {s} s, linear. A round opened with "Show me" scores 0. A round never scores below 0.'
} as const

const trGuide = {
    'guide.title': 'Hareket edeni bul',
    'guide.step': 'Adım {i} / {n}',
    'guide.skip': 'Rehberi geç',
    'guide.close': 'Rehberi kapat',
    'guide.done':
        'Bunlar SPHEREx görüntülerindeki üç gerçek hareketli cisimdi. Şimdi başka bir yıldıza bakın: arama kutusuna bir ad ya da konum yazın.',
    'guide.tosearch': 'Arama kutusuna git',
    'guide.again': 'Yeniden oyna',
    'guide.failed': 'Bu adımın verisi yüklenemedi.',
    'guide.next': 'Sonraki',
    'guide.finish': 'Bitir',
    'guide.showme': 'Göster',
    'guide.hint.show': 'İpucu göster',
    'guide.hint.hide': 'İpucunu gizle',
    'guide.band.d123': 'Kısa dalga boyu (D1–3)',
    'guide.band.d56': 'Uzun dalga boyu (D5+6)',
    'guide.ask.barnard':
        'Gökyüzünün aynı parçasının aylar arayla alınmış üç toplamı art arda gösteriliyor. Bir yıldız piksel değiştiriyor: ona tıklayın.',
    'guide.ask.eps':
        'Bu cisim dört dönemde yalnızca bir piksel kadar hareket ediyor. Yer değiştiren kaynağa tıklayın; ipucu olarak bir fark görüntüsü var.',
    'guide.ask.wise.long':
        'Uzun dalga boyunda sönük bir kaynak beliriyor ve işaretli Gaia yıldızına doğru hareket ediyor. Ona tıklayın.',
    'guide.ask.wise.short':
        'Bu soğuk cisim kısa dalga boyunda görülmez; işaretli kaynak bir Gaia yıldızıdır, hedef değildir. Uzun dalga boyuna geçin, sonra beliren ve hareket eden şeye tıklayın.',
    'guide.where': 'dönem {e} / {n} katalog konumundan {arcsec} arcsec ({px} piksel) uzakta',
    'guide.fb.step': 'Dönem {e} doğru: tıkladığınız yer {where}. Şimdi dönem {next} içinde tıklayın.',
    'guide.fb.hit':
        'Her dönemde bulundu: hareket eden cisim bu. Son tıkladığınız yer {where}. Amber noktalar cismin {n} dönemdeki katalog konumları.',
    'guide.fb.shown': 'Amber işaret artık hedefin katalog konumunu gösteriyor.',
    'guide.fb.neighbour': 'Bu, işaretli Gaia yıldızı; hareket eden hedef değil. Tıkladığınız yer hedefin {where}.',
    'guide.fb.band': 'Hedef kısa dalga boyunda görünmüyor. Tıkladığınız yer {where}; uzun dalga boyuna geçin.',
    'guide.fb.miss.hint': 'Hareket eden bu değil. Tıkladığınız yer {where}. Fark görüntüsü ipucu olarak gösteriliyor.',
    'guide.fb.miss.again': 'Hareket eden bu değil. Tıkladığınız yer {where}. Yeniden deneyin.',
    'guide.explain.base':
        '{name}: ilk ve son dönem arasında katalog onu {arcsec} arcsec ({px} piksel) hareket ettiriyor.',
    'guide.explain.sat':
        'Çekirdeği {b} pozlamanın {a} tanesinde doymuş, bu yüzden site onun için ölçülmüş bir hareket göstermiyor.',
    'guide.explain.eps':
        '{name}, bir kahverengi cüce çifti: ölçülen özdevinim (ePSF fit) doğuya {e} ± {ee}, kuzeye {n} ± {ne} mas/yr; SIMBAD {re} ve {rn} veriyor. Ok, hareketin {k} katı uzunlukta çizildi.',
    'guide.explain.wise':
        '{name}, yalnızca uzun dalga boyunda görülüyor: ilk dönemden son döneme doğuya {e} ± {ee} arcsec, kuzeye {n} ± {ne} hareket etti ({method}). Katalog {pe} ve {pn} öngörüyor.',
    'guide.click': 'Hareket eden cisme, dönem {e} / {n} içindeki yerinde tıklayın (görüntünün altındaki dönem satırına bakın). Her dönem için bir tıklama, sırayla.',
    'guide.click.badge': 'Görüntüye tıklayın',
    'guide.stacked': '{n} pozlama toplandı',
    'guide.hint.title': 'İpucu: dönem {b} eksi dönem {a}',
    'guide.hint.detail':
        'Yerinde duran her şey griye sıfırlanır; hareket eden kaynak bir parlak, bir koyu yan bırakır.',
    'game.play': 'Oyunu oyna',
    'game.title': 'Hareket edeni bul: oyun',
    'game.hud': 'Tur {i} · puan {s} · bulunan {f} / {p}',
    'game.end': 'Oyunu bitir',
    'game.close': 'Oyunu kapat',
    'game.ask': 'Gökyüzünün bu parçasında bir cisim dönemler arasında hareket ediyor. Her dönemde, sırayla ona tıklayın.',
    'game.step': 'Dönem {e} / {n}: hareket eden cisme bu dönemdeki yerinde tıklayın.',
    'game.time': '{s} sn',
    'game.hint': 'İpucu (−{p})',
    'game.miss': 'Hareket eden bu değil ({n} yanlış, her biri −{p}). Yeniden deneyin.',
    'game.hit': '{s} sn içinde bulundu: {name}. Tur puanı {r}.',
    'game.shown': 'Gösterildi: {name}. Bu tur puan yok.',
    'game.next': 'Sonraki yıldız',
    'game.open': 'Bu hedefi aç',
    'game.failed': 'Oyun hedefleri yüklenemedi.',
    'game.summary':
        'Oyun bitti. Oynanan tur: {r}; bulunan: {f}; ortalama süre: {t} sn; toplam puan: {s}. Bu tarayıcıdaki en iyi puan: {b}.',
    'game.rules.title': 'Puan nasıl hesaplanır',
    'game.rules':
        'Cisme her dönem için bir kez, dönem sırasıyla tıklanır; tıklama, cismin o dönemdeki katalog konumuna {px} piksel içindeyse sayılır. Her dönemde bulundu: {f} puan; her yanlış tıklama −{w}; ipucu açıldıysa −{h}; süre bonusu 0 sn\'de +{b}\'den {s} sn\'de 0\'a doğrusal iner. "Göster" ile açılan tur 0 puan alır. Tur puanı 0\'ın altına inmez.'
}

// ---------------------------------------------------------------- quick look
const enQuick = {
    'quick.err.name_not_found': 'SIMBAD does not know this name. Check the spelling, or enter RA and Dec in degrees.',
    'quick.err.simbad_unreachable':
        'SIMBAD could not be reached, so the name was not resolved. Try again, or enter RA and Dec in degrees.',
    'quick.err.archive_unreachable':
        'The NASA archive (IRSA) is not answering right now, so the list of SPHEREx images could not be fetched. This is on the archive side; try again in a minute. The prepared targets above work without it.',
    'quick.retry': 'Try again',
    'quick.err.bad_request': 'Enter a star name, or RA and Dec in degrees (RA 0 to 360, Dec -90 to +90).',
    'quick.err.no_answer': 'The lookup service did not answer. Try again in a moment.',
    'quick.err.no_exposures': 'The public SPHEREx releases at IRSA hold no exposure of this position.',
    'quick.err.none_read': 'None of the selected exposures could be read from the cloud copy of the archive.',
    'quick.err.read_failed': 'Reading the images failed: {msg}',
    'quick.title.pos': 'RA {ra}°, Dec {dec}°',
    'quick.banner.bold': 'Quick look, unmasked, no measurement.',
    'quick.banner':
        'A few exposures per epoch are read straight from the archive and stacked in your browser. Flagged pixels are not removed. The only numbers taken from these images are the rough motions listed below the image; they are not a measurement of the full data.',
    'quick.lookup': 'Looking up the position and the list of SPHEREx exposures… this can take up to a minute.',
    'quick.partial': 'The archive did not answer for {ids}; the exposure list is incomplete.',
    'quick.progress': 'Reading exposure {done} of {total} ({mb} MB)',
    'quick.stack.detail': '{a} of {b} exposures of this epoch read and stacked',
    'quick.diff.detail':
        'Detectors {dets} (those read in both epochs), {n1} and {n2} exposures. Linear scale, zero is mid grey, ±{vmax} MJy/sr. Unmasked and made from a few exposures: bad pixels and brightness changes of constant stars also show up, and this image was not checked against field stars.',
    'quick.stats': '{listed} exposures listed in {epochs} epochs; {read} read in {s} s ({mb} MB in {req} requests)',
    'quick.stats.failed': '; {n} could not be read',
    'quick.stats.off': '; {n} do not contain the position',
    'quick.grid': 'The grid is fixed on the sky (north up, east left) and all epochs share one brightness scale.',
    'quick.marker.cat':
        'The amber marker is the catalogue position moved with the catalogue proper motion; both are from {source}.',
    'quick.marker.entered': 'The amber marker is the position that was entered.',
    'quick.motion.title': 'Rough motion between epochs',
    'quick.motion.head': 'Motion (east / north, arcsec)',
    'quick.motion.unit': ' (east / north, arcsec)',
    'quick.motion.pred': 'Catalogue prediction',
    'quick.motion.meas': 'Rough measurement',
    'quick.motion.pair': 'Epoch {a} → {b}',
    'quick.motion.na': 'not available',
    'quick.motion.none': 'not measured',
    'quick.motion.slow': 'too slow to measure with this data',
    'quick.motion.note':
        'Rough: windowed centroid on the stacks shown above (a few unmasked exposures per epoch), looked for within 1.5 pixels of the {where}. Errors are a bootstrap over the exposures; nothing is aligned to field stars. A number is only given when the motion is larger than its error; otherwise the line reads “too slow to measure with this data”, which also covers a source that is too faint in these few exposures. “Not measured” means that no source was found at that place in one of the two epochs.',
    'quick.motion.where.cat': 'catalogue position (proper motion and parallax)',
    'quick.motion.where.entered': 'entered position',
    'quick.motion.sat':
        'Probably saturated in SPHEREx, no motion given: SIMBAD gives K = {k}, brighter than K = {lim}. Prepared targets that bright are saturated in most exposures, and a saturated core does not give a reliable position.'
} as const

const trQuick = {
    'quick.err.name_not_found': 'SIMBAD bu adı tanımıyor. Yazımı kontrol edin ya da RA ve Dec değerlerini derece olarak girin.',
    'quick.err.simbad_unreachable':
        'SIMBAD\'a ulaşılamadı, bu yüzden ad çözülemedi. Yeniden deneyin ya da RA ve Dec değerlerini derece olarak girin.',
    'quick.err.archive_unreachable':
        'NASA arşivi (IRSA) şu anda yanıt vermiyor, bu yüzden SPHEREx görüntülerinin listesi alınamadı. Sorun arşiv tarafında; bir dakika sonra yeniden deneyin. Yukarıdaki hazır hedefler arşiv olmadan da çalışır.',
    'quick.retry': 'Yeniden dene',
    'quick.err.bad_request': 'Bir yıldız adı ya da derece olarak RA ve Dec girin (RA 0 ile 360, Dec -90 ile +90).',
    'quick.err.no_answer': 'Arama hizmeti yanıt vermedi. Biraz sonra yeniden deneyin.',
    'quick.err.no_exposures': 'IRSA\'daki açık SPHEREx sürümlerinde bu konumun pozlaması yok.',
    'quick.err.none_read': 'Seçilen pozlamaların hiçbiri arşivin bulut kopyasından okunamadı.',
    'quick.err.read_failed': 'Görüntüler okunamadı: {msg}',
    'quick.title.pos': 'RA {ra}°, Dec {dec}°',
    'quick.banner.bold': 'Hızlı bakış, maskesiz, ölçüm yok.',
    'quick.banner':
        'Her dönemden birkaç pozlama doğrudan arşivden okunur ve tarayıcınızda toplanır. İşaretli (bozuk) pikseller çıkarılmaz. Bu görüntülerden alınan tek sayılar, görüntünün altındaki kaba hareketlerdir; bunlar verinin tamamının ölçümü değildir.',
    'quick.lookup': 'Konum ve SPHEREx pozlama listesi aranıyor… bu bir dakika kadar sürebilir.',
    'quick.partial': 'Arşiv {ids} için yanıt vermedi; pozlama listesi eksik.',
    'quick.progress': 'Pozlama okunuyor: {done} / {total} ({mb} MB)',
    'quick.stack.detail': 'Bu dönemin {b} pozlamasından {a} tanesi okundu ve toplandı',
    'quick.diff.detail':
        'Dedektör {dets} (iki dönemde de okunanlar), {n1} ve {n2} pozlama. Doğrusal ölçek, sıfır orta gri, ±{vmax} MJy/sr. Maskesiz ve birkaç pozlamadan yapıldı: bozuk pikseller ve sabit yıldızların parlaklık değişimleri de görünür; bu görüntü alan yıldızlarıyla kontrol edilmedi.',
    'quick.stats': '{epochs} dönemde {listed} pozlama listelendi; {read} tanesi {s} s içinde okundu ({req} istekte {mb} MB)',
    'quick.stats.failed': '; {n} tanesi okunamadı',
    'quick.stats.off': '; {n} tanesi konumu içermiyor',
    'quick.grid': 'Izgara gökyüzünde sabittir (kuzey yukarı, doğu sol) ve bütün dönemler tek bir parlaklık ölçeğini paylaşır.',
    'quick.marker.cat':
        'Amber işaret, katalog özdevinimiyle taşınmış katalog konumudur; ikisi de {source} kaynağından.',
    'quick.marker.entered': 'Amber işaret girilen konumdur.',
    'quick.motion.title': 'Dönemler arası kaba hareket',
    'quick.motion.head': 'Hareket (doğu / kuzey, arcsec)',
    'quick.motion.unit': ' (doğu / kuzey, arcsec)',
    'quick.motion.pred': 'Katalog öngörüsü',
    'quick.motion.meas': 'Kaba ölçüm',
    'quick.motion.pair': 'Dönem {a} → {b}',
    'quick.motion.na': 'yok',
    'quick.motion.none': 'ölçülmedi',
    'quick.motion.slow': 'bu veriyle ölçülemeyecek kadar yavaş',
    'quick.motion.note':
        'Kaba: yukarıdaki toplamlarda (dönem başına birkaç maskesiz pozlama) pencereli merkez; {where} çevresinde 1.5 piksel içinde arandı. Hatalar pozlamalar üzerinden bootstrap ile bulundu; hiçbir şey alan yıldızlarına hizalanmadı. Sayı yalnızca hareket hatasından büyükse verilir; değilse satırda “bu veriyle ölçülemeyecek kadar yavaş” yazar; bu, bu birkaç pozlamada fazla sönük kalan bir kaynağı da kapsar. “Ölçülmedi”, iki dönemden birinde o yerde kaynak bulunamadı demektir.',
    'quick.motion.where.cat': 'katalog konumu (özdevinim ve paralaks)',
    'quick.motion.where.entered': 'girilen konum',
    'quick.motion.sat':
        'SPHEREx\'te büyük olasılıkla doymuş, hareket verilmiyor: SIMBAD K = {k} diyor, bu K = {lim} değerinden parlak. Bu kadar parlak hazır hedefler pozlamaların çoğunda doymuş; doymuş bir çekirdek güvenilir bir konum vermez.'
}

// ---------------------------------------------------------------- explanations ("?" buttons, "How to read this page")
// Numbers in these texts are placeholders; the values are read from the site's data files.
const enHelp = {
    'help.button': 'What is this?',
    'help.close': 'Close',
    'help.stack':
        'All exposures of one observing period (an epoch) are laid on top of each other and averaged, which removes the flicker and brings out faint things. The epochs are shown one after the other; whatever jumps between them has moved.',
    'help.raw':
        'The single exposures in time order, as the telescope took them. Each one is taken at a different wavelength, so the brightness jumps from frame to frame.',
    'help.diff':
        'The last epoch minus the first one. Whatever stayed in place cancels to grey; something that moved leaves a bright spot where it is now and a dark spot where it was.',
    'help.detector':
        'SPHEREx has six detectors, each for its own range of infrared wavelengths, from short (1) to long (6). Cold objects only show up in the long ones.',
    'help.marker':
        'The amber cross marks where the catalogue (SIMBAD) says the target should be on that date. It is not measured from these images.',
    'help.flicker':
        'How much stars that are known to be constant seem to change in these images. It tells you how large a change must be before it means anything.',
    'help.measured':
        'Where the target was found in the images and how fast it moves across the sky, next to the catalogue values. The ± is the statistical error only.',
    'help.validation':
        'The same measurement was made on stars whose motion is already known, to see whether the method and its errors can be trusted. Stars that disagree stay in the tables.',
    'help.quick':
        'For a star that was not prepared, your browser reads a few exposures straight from the archive and stacks them. Nothing is cleaned, so treat it as a first look, not as a measurement.',
    'howto.title': 'How to read this page',
    'howto.q1': 'What am I looking at?',
    'howto.a1':
        'A small patch of sky around one target, as seen by the SPHEREx space telescope. North is up, east is left, and one pixel is {scale} arcsec.',
    'howto.q2': 'Why does it flicker?',
    'howto.a2':
        'Every raw exposure is taken at a different wavelength, and a star is not equally bright at all wavelengths. In the {name} field, constant stars change by {raw} from one raw exposure to the next, but only by {ep} between epoch averages.',
    'howto.q3': 'What is the stack for?',
    'howto.a3':
        'Averaging all exposures of one epoch removes the flicker and brings out faint objects. Blink the epochs: distant stars stay put, a nearby object changes pixel.',
    'howto.q4': 'How was the motion measured?',
    'howto.a4':
        'The position of the target is measured in every exposure and compared with Gaia stars in the same exposure. A steady motion plus the yearly parallax wobble is then fitted to all positions; for {name} this used {n} exposures.',
    'howto.q5': 'How far can the numbers be trusted?',
    'howto.a5':
        'The same fit was run on {stars} Gaia stars with known motion: for {all3} of them all three results are within 2 errors of Gaia. Of {fitted} fast movers that could be judged, {both} agree with the catalogue in both motion components. The errors are statistical only; the limits are listed with each target.'
} as const

const trHelp = {
    'help.button': 'Bu nedir?',
    'help.close': 'Kapat',
    'help.stack':
        'Bir gözlem döneminin bütün pozlamaları üst üste konup ortalanır; bu, titremeyi giderir ve sönük şeyleri ortaya çıkarır. Dönemler art arda gösterilir; aralarında yer değiştiren şey hareket etmiştir.',
    'help.raw':
        'Tek tek pozlamalar, teleskobun aldığı zaman sırasıyla. Her biri farklı bir dalga boyunda alınır, bu yüzden parlaklık kareden kareye değişir.',
    'help.diff':
        'Son dönem eksi ilk dönem. Yerinde duran her şey griye sıfırlanır; hareket eden bir şey şimdi olduğu yerde parlak, önce olduğu yerde koyu bir leke bırakır.',
    'help.detector':
        'SPHEREx\'in altı dedektörü vardır; her biri kızılötesinin kendi dalga boyu aralığına bakar, kısadan (1) uzuna (6). Soğuk cisimler yalnızca uzun olanlarda görünür.',
    'help.marker':
        'Amber artı işareti, kataloğa (SIMBAD) göre hedefin o tarihte olması gereken yeri gösterir. Bu görüntülerden ölçülmemiştir.',
    'help.flicker':
        'Sabit olduğu bilinen yıldızların bu görüntülerde ne kadar değişiyor göründüğü. Bir değişimin anlam taşıması için ne kadar büyük olması gerektiğini söyler.',
    'help.measured':
        'Hedefin görüntülerde bulunduğu yer ve gökyüzünde ne kadar hızlı hareket ettiği, katalog değerlerinin yanında. ± yalnızca istatistiksel hatadır.',
    'help.validation':
        'Aynı ölçüm, hareketi zaten bilinen yıldızlarda da yapıldı; amaç yönteme ve hatalarına güvenilip güvenilemeyeceğini görmek. Uyuşmayan yıldızlar tablolarda duruyor.',
    'help.quick':
        'Hazırlanmamış bir yıldız için tarayıcınız birkaç pozlamayı doğrudan arşivden okur ve toplar. Hiçbir şey temizlenmez; bunu ölçüm değil, ilk bakış sayın.',
    'howto.title': 'Bu sayfa nasıl okunur',
    'howto.q1': 'Neye bakıyorum?',
    'howto.a1':
        'SPHEREx uzay teleskobunun gördüğü, bir hedefin çevresindeki küçük bir gökyüzü parçasına. Kuzey yukarıda, doğu solda; bir piksel {scale} arcsec.',
    'howto.q2': 'Neden titriyor?',
    'howto.a2':
        'Her ham pozlama farklı bir dalga boyunda alınır ve bir yıldız her dalga boyunda aynı parlaklıkta değildir. {name} alanında sabit yıldızlar bir ham pozlamadan ötekine {raw} değişiyor, dönem ortalamaları arasında ise yalnızca {ep}.',
    'howto.q3': 'Toplam ne işe yarıyor?',
    'howto.a3':
        'Bir dönemin bütün pozlamalarının ortalaması titremeyi giderir ve sönük cisimleri ortaya çıkarır. Dönemleri art arda izleyin: uzak yıldızlar yerinde durur, yakın bir cisim piksel değiştirir.',
    'howto.q4': 'Hareket nasıl ölçüldü?',
    'howto.a4':
        'Hedefin konumu her pozlamada ölçülür ve aynı pozlamadaki Gaia yıldızlarıyla karşılaştırılır. Sonra bütün konumlara düzgün bir hareket ile yıllık paralaks salınımı birlikte uydurulur; {name} için {n} pozlama kullanıldı.',
    'howto.q5': 'Sayılara ne kadar güvenilir?',
    'howto.a5':
        'Aynı fit, hareketi bilinen {stars} Gaia yıldızında çalıştırıldı: {all3} tanesinde üç sonuç da Gaia\'nın 2 hata payı içinde. Değerlendirilebilen {fitted} hızlı cismin {both} tanesi iki hareket bileşeninde de katalogla uyuşuyor. Hatalar yalnızca istatistiksel; sınırlar her hedefin yanında yazılı.'
}

// ---------------------------------------------------------------- measurement section
// Keys "m:<label>" translate the method labels that come from results.json.
const enMeasure = {
    and: ' and ',
    'm:Windowed centroid': 'Windowed centroid',
    'm:ePSF fit': 'ePSF fit',
    'm:Gaussian fit': 'Gaussian fit',
    'm:Gaussian fit, neighbour modelled': 'Gaussian fit, neighbour modelled',
    'flicker.bold': 'Flicker.',
    'flicker.text':
        '{n} constant Gaia stars in this field change by {raw} from one raw exposure to the next (each exposure is at a different wavelength) and by {ep} between epoch means, compared detector by detector. Medians of the per-star scatter; epoch means are averages of aperture fluxes, not measured on the stacked image.',
    'flicker.none': 'Not measured for this field yet.',
    'raw.dropped':
        'Raw playback leaves out {a} of {b} exposures: those with more than {pct}% of their pixels masked. They are still part of the stacks.',
    'raw.all': 'Raw playback shows all {b} exposures; none has more than {pct}% of its pixels masked.',
    'nb.bold': 'The source next to the amber marker in the short-wavelength stack is not the target.',
    'nb.star': 'It is the star Gaia DR3 {id}',
    'nb.g': ' (G = {g})',
    'nb.fitted': ', fitted within {a} arcsec of its Gaia position',
    'nb.rest':
        '. It lies {seps} arcsec from the predicted target position in the {n} epochs; the target is moving towards it. On the long-wavelength stacks the star has {ratios} of the target\'s amplitude (16–84% bootstrap range in brackets) and pulls a single-source measurement towards itself. The measurement labelled {label} in the table below fits both sources, with the star fixed at its Gaia position and one shared width; where the range is wide the two sources are not well separated.',
    'res.title': 'Measured',
    'res.off.bold': 'The bright source next to the amber marker is not at the catalogue position of the target.',
    'res.off':
        'Its centroid on the stacks lies {offs} arcsec from the catalogue position in the {n} epochs (more than {lim} arcsec counts as another source). The amber marker is the catalogue position.',
    'res.sat.fit':
        'The OVERFLOW flag is set at the target position in {a} of {b} exposures. The fit below uses only exposures with an unsaturated core.',
    'res.nofit':
        'No motion fit is shown for this target: {u} of {b} exposures have a clean core measured by both position methods ({per} in the {n} epochs). The rule is at least {me} exposures, in at least {mp} epochs of at least {mpe}.',
    'res.sat':
        'Saturated target: the OVERFLOW flag is set at the target position in {a} of {b} exposures. Too few exposures have an unsaturated core to measure a motion, so no motion measurement is shown for this target. The amber marker is the catalogue position.',
    'res.sat.mixed':
        'In {e} of these exposures at least one of the central 3×3 pixels is empty and shows as black in the raw playback; in {f} all nine pixels still carry a value and are drawn as they are, but their brightness is not reliable.',
    'res.sat.filled':
        'In all {f} of these exposures the central 3×3 pixels still carry a value and are drawn as they are, but their brightness is not reliable.',
    'res.sat.empty':
        'In all {e} of these exposures at least one of the central 3×3 pixels is empty and shows as black in the raw playback.',
    'res.row.pme': 'Proper motion east (mas/yr)',
    'res.row.pmn': 'Proper motion north (mas/yr)',
    'res.row.plx': 'Parallax (mas)',
    'res.row.n': 'Exposures used',
    'res.above': 'above',
    'res.below': 'below',
    'res.plx.item.same': '{pct}% ({label})',
    'res.plx.item': '{pct}% {side} ({label})',
    'res.plx.same': 'The measured parallax is {list} {side} the {source} value.',
    'res.plx.mixed': 'The measured parallax is {list} the {source} value.',
    'res.stat': 'The ± values are statistical only (bootstrap over exposures)',
    'res.plx.loo': '; leaving one epoch out moves the parallax between {ranges} mas.',
    'res.plx.noloo': '; there are too few epochs to repeat the fit with one epoch left out.',
    'res.arrow':
        'Positions are aligned to Gaia DR3 field stars exposure by exposure. The arrow on the stacked image is the measured proper motion (ePSF fit) over the {yrs} years of data, drawn {k} times longer than the real motion ({px} pixels) so that its direction can be read.',
    'res.motion.pred': '{source} prediction',
    'res.motion.note':
        'Measured on stacks of detectors 5 and 6 only (peak S/N {snr} in the {n} epochs). With {n} epochs a proper motion + parallax fit is not constrained. Not aligned to field stars; errors are bootstrap over frames.',
    'res.pe':
        'A fit on single exposures did not work: {n} usable exposures with a median S/N of {snr}, and the two position methods disagree (parallax {plx} mas against {ref}).',
    'res.none': 'No position or motion measurement has been made for this target.'
} as const

const trMeasure = {
    and: ' ve ',
    'm:Windowed centroid': 'Pencereli merkez',
    'm:ePSF fit': 'ePSF fit',
    'm:Gaussian fit': 'Gauss fit',
    'm:Gaussian fit, neighbour modelled': 'Gauss fit, komşu modellendi',
    'flicker.bold': 'Titreme.',
    'flicker.text':
        'Bu alandaki {n} sabit Gaia yıldızı bir ham pozlamadan ötekine {raw} değişiyor (her pozlama farklı bir dalga boyundadır); dönem ortalamaları arasında, dedektör dedektör karşılaştırıldığında, {ep} değişiyor. Değerler yıldız başına saçılmanın ortancasıdır; dönem ortalamaları açıklık akılarının ortalamasıdır, toplam görüntüde ölçülmemiştir.',
    'flicker.none': 'Bu alan için henüz ölçülmedi.',
    'raw.dropped':
        'Ham oynatma {b} pozlamanın {a} tanesini dışarıda bırakıyor: piksellerinin %{pct} kadarından fazlası maskeli olanları. Bunlar toplamlarda yine de var.',
    'raw.all': 'Ham oynatma {b} pozlamanın hepsini gösteriyor; hiçbirinde piksellerin %{pct} kadarından fazlası maskeli değil.',
    'nb.bold': 'Kısa dalga boyu toplamında amber işaretin yanındaki kaynak hedef değildir.',
    'nb.star': 'Bu, Gaia DR3 {id} yıldızıdır',
    'nb.g': ' (G = {g})',
    'nb.fitted': '; fit, Gaia konumunun {a} arcsec yakınında',
    'nb.rest':
        '. {n} dönemde hedefin öngörülen konumundan {seps} arcsec uzakta; hedef ona doğru hareket ediyor. Uzun dalga boyu toplamlarında yıldızın genliği hedefin genliğinin {ratios} katı (parantez içinde %16–84 bootstrap aralığı) ve tek kaynaklı bir ölçümü kendine doğru çekiyor. Aşağıdaki tabloda {label} adlı ölçüm iki kaynağı birlikte uydurur; yıldız Gaia konumunda sabit tutulur ve tek bir ortak genişlik kullanılır. Aralığın geniş olduğu yerde iki kaynak iyi ayrılmamıştır.',
    'res.title': 'Ölçülen',
    'res.off.bold': 'Amber işaretin yanındaki parlak kaynak hedefin katalog konumunda değil.',
    'res.off':
        'Toplamlardaki merkezi, {n} dönemde katalog konumundan {offs} arcsec uzakta ({lim} arcsec üzeri başka bir kaynak sayılır). Amber işaret katalog konumudur.',
    'res.sat.fit':
        'OVERFLOW bayrağı {b} pozlamanın {a} tanesinde hedef konumunda işaretli. Aşağıdaki fit yalnızca çekirdeği doymamış pozlamaları kullanır.',
    'res.nofit':
        'Bu hedef için hareket fiti gösterilmiyor: {b} pozlamanın {u} tanesinde iki konum yöntemiyle de ölçülmüş temiz bir çekirdek var ({n} dönemde {per}). Kural: en az {me} pozlama, her birinde en az {mpe} pozlama olan en az {mp} dönem.',
    'res.sat':
        'Doymuş hedef: OVERFLOW bayrağı {b} pozlamanın {a} tanesinde hedef konumunda işaretli. Hareket ölçmek için çekirdeği doymamış pozlama sayısı yetersiz, bu yüzden bu hedef için hareket ölçümü gösterilmiyor. Amber işaret katalog konumudur.',
    'res.sat.mixed':
        'Bu pozlamaların {e} tanesinde merkezdeki 3×3 pikselden en az biri boş ve ham oynatmada siyah görünüyor; {f} tanesinde dokuz pikselin hepsi hâlâ değer taşıyor ve olduğu gibi çiziliyor, ama parlaklıkları güvenilir değil.',
    'res.sat.filled':
        'Bu {f} pozlamanın hepsinde merkezdeki 3×3 piksel hâlâ değer taşıyor ve olduğu gibi çiziliyor, ama parlaklıkları güvenilir değil.',
    'res.sat.empty':
        'Bu {e} pozlamanın hepsinde merkezdeki 3×3 pikselden en az biri boş ve ham oynatmada siyah görünüyor.',
    'res.row.pme': 'Özdevinim, doğu (mas/yr)',
    'res.row.pmn': 'Özdevinim, kuzey (mas/yr)',
    'res.row.plx': 'Paralaks (mas)',
    'res.row.n': 'Kullanılan pozlama',
    'res.above': 'üstünde',
    'res.below': 'altında',
    'res.plx.item.same': '%{pct} ({label})',
    'res.plx.item': '%{pct} {side} ({label})',
    'res.plx.same': 'Ölçülen paralaks {source} değerinin {list} {side}.',
    'res.plx.mixed': 'Ölçülen paralaks {source} değerinin {list}.',
    'res.stat': '± değerleri yalnızca istatistikseldir (pozlamalar üzerinden bootstrap)',
    'res.plx.loo': '; bir dönem dışarıda bırakılınca paralaks {ranges} mas arasında değişiyor.',
    'res.plx.noloo': '; fiti bir dönem dışarıda bırakarak yinelemek için dönem sayısı yetersiz.',
    'res.arrow':
        'Konumlar pozlama pozlama Gaia DR3 alan yıldızlarına hizalanır. Toplam görüntüdeki ok, {yrs} yıllık veride ölçülen özdevinimdir (ePSF fit); yönü okunabilsin diye gerçek hareketin ({px} piksel) {k} katı uzunlukta çizildi.',
    'res.motion.pred': '{source} öngörüsü',
    'res.motion.note':
        'Yalnızca dedektör 5 ve 6 toplamlarında ölçüldü ({n} dönemde tepe S/N {snr}). {n} dönemle özdevinim + paralaks fiti kısıtlanamaz. Alan yıldızlarına hizalanmadı; hatalar kareler üzerinden bootstrap ile bulundu.',
    'res.pe':
        'Tek pozlamalar üzerinde fit çalışmadı: ortanca S/N değeri {snr} olan {n} kullanılabilir pozlama var ve iki konum yöntemi uyuşmuyor (paralaks {plx} mas, katalog {ref}).',
    'res.none': 'Bu hedef için konum ya da hareket ölçümü yapılmadı.'
}

// ---------------------------------------------------------------- validation sections
const enValid = {
    'val.title': 'Validation',
    'val.intro':
        'Control test: the proper motion and parallax fit used for the targets was run on {stars} Gaia DR3 field stars in the {fields} prepared fields and compared with the Gaia values. Each star was aligned with at least {other} other field stars in the same exposure, never with itself. Selection, fixed before the results were seen: at least {me} exposures, in at least {mp} epochs of at least {mpe} exposures. {nf} stars did not pass and are listed below. Stars that disagree with Gaia stay in the tables.',
    'val.head.diff': 'Measured minus Gaia, {n} stars',
    'val.head.median': 'Median',
    'val.head.scatter': 'Scatter',
    'val.head.err': 'Median error of one fit',
    'val.head.within': 'Within 2 errors',
    'val.head.expected': 'Expected',
    'val.row.pme': 'Proper motion east',
    'val.row.pmn': 'Proper motion north',
    'val.row.plx': 'Parallax',
    'val.of': '{a} of {b}',
    'val.all3': 'All three together',
    'val.note':
        'Scatter is 1.4826 × the median absolute deviation; errors are bootstrap errors over exposures. "Expected" is the count for Gaussian errors of the right size (for all three: if the three were independent). These field stars move by less than the error of one fit, so the test shows whether the fit invents motion and whether the errors have the right size. It does not show a large motion being recovered; for that see the fast movers below.',
    'val.noalign':
        'Without the alignment the parallax is wrong: the median difference from Gaia is {psf} mas (ePSF fit) and {win} mas (windowed centroid), and {npsf} and {nwin} of {n} stars are within 2 errors.',
    'val.byfield': 'By field, stars within 2 errors',
    'val.field': 'Field',
    'val.fitted': 'Stars fitted',
    'val.allthree': 'All three',
    'val.notfitted': 'Not fitted',
    'val.allstars': 'All {n} stars, one row each',
    'val.cell.note':
        'Each cell: Gaia / measured ± error (difference in errors). Proper motion in mas/yr, parallax in mas. Amber cells are more than 2 errors from Gaia.',
    'val.fieldname': '{name} field',
    'val.col.exposures': 'Exposures',
    'val.nf.row': 'Not fitted: Gaia DR3 {id}, {reason}',
    'val.source': 'Source of these numbers:',
    'fast.title': 'Validation on fast movers',
    'fast.intro':
        'The fit used for Epsilon Indi B (proper motion and parallax, aligned to Gaia field stars in every exposure) was run without changes on {n} more stars with a large catalogue motion and compared with SIMBAD. A target is judged if it has at least {me} usable exposures, in at least {mp} epochs of at least {mpe}; {fitted} of {n} are. Of these, both proper motion components are within 2 errors of SIMBAD for {both}, the parallax for {plx}. The errors are statistical only (bootstrap over exposures).',
    'fast.target': 'Target',
    'fast.used': 'Exposures used',
    'fast.notjudged': 'Not judged: {u} of {b} exposures usable{per}. SIMBAD: {ref}.',
    'fast.perepoch': ' ({list} per epoch)',
    'fast.note':
        'Each cell: measured ± error, the SIMBAD value, and the difference in brackets. Amber cells are more than 2 errors from SIMBAD. "Usable" means a clean, unsaturated core measured by both position methods.'
} as const

const trValid = {
    'val.title': 'Doğrulama',
    'val.intro':
        'Kontrol testi: hedefler için kullanılan özdevinim ve paralaks fiti, {fields} hazır alandaki {stars} Gaia DR3 alan yıldızında çalıştırıldı ve Gaia değerleriyle karşılaştırıldı. Her yıldız aynı pozlamadaki en az {other} başka alan yıldızıyla hizalandı, hiçbir zaman kendisiyle değil. Sonuçlar görülmeden önce sabitlenen seçim: en az {me} pozlama, her birinde en az {mpe} pozlama olan en az {mp} dönem. {nf} yıldız seçimi geçemedi; aşağıda listelendi. Gaia ile uyuşmayan yıldızlar tablolarda duruyor.',
    'val.head.diff': 'Ölçülen eksi Gaia, {n} yıldız',
    'val.head.median': 'Ortanca',
    'val.head.scatter': 'Saçılma',
    'val.head.err': 'Bir fitin ortanca hatası',
    'val.head.within': '2 hata içinde',
    'val.head.expected': 'Beklenen',
    'val.row.pme': 'Özdevinim, doğu',
    'val.row.pmn': 'Özdevinim, kuzey',
    'val.row.plx': 'Paralaks',
    'val.of': '{a} / {b}',
    'val.all3': 'Üçü birlikte',
    'val.note':
        'Saçılma, ortanca mutlak sapmanın 1.4826 katıdır; hatalar pozlamalar üzerinden bootstrap hatalarıdır. “Beklenen”, doğru büyüklükte Gauss hataları için beklenen sayıdır (üçü birlikte: üçü bağımsız olsaydı). Bu alan yıldızları bir fitin hatasından az hareket eder; yani test, fitin hareket uydurup uydurmadığını ve hataların doğru büyüklükte olup olmadığını gösterir. Büyük bir hareketin geri bulunduğunu göstermez; bunun için aşağıdaki hızlı cisimlere bakın.',
    'val.noalign':
        'Hizalama olmadan paralaks yanlış çıkıyor: Gaia\'dan ortanca fark {psf} mas (ePSF fit) ve {win} mas (pencereli merkez); {n} yıldızın {npsf} ve {nwin} tanesi 2 hata içinde.',
    'val.byfield': 'Alan alan, 2 hata içindeki yıldızlar',
    'val.field': 'Alan',
    'val.fitted': 'Fit yapılan yıldız',
    'val.allthree': 'Üçü birlikte',
    'val.notfitted': 'Fit yapılmayan',
    'val.allstars': '{n} yıldızın hepsi, her biri bir satır',
    'val.cell.note':
        'Her hücre: Gaia / ölçülen ± hata (hata cinsinden fark). Özdevinim mas/yr, paralaks mas. Amber hücreler Gaia\'dan 2 hatadan fazla uzakta.',
    'val.fieldname': '{name} alanı',
    'val.col.exposures': 'Pozlama',
    'val.source': 'Bu sayıların kaynağı:',
    'fast.title': 'Hızlı cisimlerle doğrulama',
    'fast.intro':
        'Epsilon Indi B için kullanılan fit (özdevinim ve paralaks, her pozlamada Gaia alan yıldızlarına hizalı), katalog hareketi büyük {n} yıldızda değiştirilmeden çalıştırıldı ve SIMBAD ile karşılaştırıldı. Bir hedef, her birinde en az {mpe} pozlama olan en az {mp} dönemde en az {me} kullanılabilir pozlaması varsa değerlendirilir; {n} hedefin {fitted} tanesi böyle. Bunların {both} tanesinde iki özdevinim bileşeni de, {plx} tanesinde paralaks SIMBAD\'ın 2 hata payı içinde. Hatalar yalnızca istatistikseldir (pozlamalar üzerinden bootstrap).',
    'fast.target': 'Hedef',
    'fast.used': 'Kullanılan pozlama',
    'fast.notjudged': 'Değerlendirilmedi: {b} pozlamanın {u} tanesi kullanılabilir{per}. SIMBAD: {ref}.',
    'fast.perepoch': ' (dönem başına {list})',
    'fast.note':
        'Her hücre: ölçülen ± hata, SIMBAD değeri ve parantez içinde fark. Amber hücreler SIMBAD\'dan 2 hatadan fazla uzakta. “Kullanılabilir”, iki konum yöntemiyle de ölçülmüş temiz, doymamış bir çekirdek demektir.'
}

// ---------------------------------------------------------------- lookup
const EN = { ...enOpening, ...enPanels, ...enGuide, ...enQuick, ...enHelp, ...enMeasure, ...enValid }
export type Key = keyof typeof EN
// Turkish may lack keys; those fall back to English.
const TR: Partial<Record<Key, string>> = {
    ...trOpening,
    ...trPanels,
    ...trGuide,
    ...trQuick,
    ...trHelp,
    ...trMeasure,
    ...trValid
}

const text = (key: Key): string => (current === 'tr' ? TR[key] : undefined) ?? EN[key]

// Text of a key in the current language; {name} placeholders are filled from vars.
export function t(key: Key, vars?: Vars): string {
    const s = text(key)
    return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s
}

// The same with React nodes in the placeholders (a highlighted number, a link).
export function rich(key: Key, vars: RichVars): ReactNode {
    const parts = text(key).split(/(\{\w+\})/)
    return createElement(
        Fragment,
        null,
        ...parts.map((p) => {
            const m = /^\{(\w+)\}$/.exec(p)
            return m && m[1] in vars ? vars[m[1]] : p
        })
    )
}

// A method label that comes from a data file ("ePSF fit"): translated if the dictionary has it.
export function label(name: string): string {
    const key = `m:${name}`
    return key in EN ? t(key as Key) : name
}

// Components call this so that they are drawn again when the language changes.
export function useLang(): Lang {
    return useSyncExternalStore(subscribe, getLang)
}

// Long name of a detector selection. English keeps the label written by the pipeline (meta.json).
export function bandLabel(b: { id: string; label: string }): string {
    if (current === 'en') return b.label
    if (b.id === 'all' || b.id === 'd123' || b.id === 'd56') return t(`band.label.${b.id}` as Key)
    const m = /^d(\d)$/.exec(b.id)
    return m ? t('band.label.det', { n: m[1] }) : b.label
}

// Caption of a difference image. English keeps the label written by the pipeline (diff.json).
export function diffCaption(pipelineLabel: string): string {
    return current === 'en' ? pipelineLabel : t('diff.caption')
}