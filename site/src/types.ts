// Shapes of the static JSON files under public/data/ (written by the Python pipeline).

export type XY = { x: number; y: number }

export type TargetEntry = {
    slug: string
    name: string
    sp_type?: string
    n_exposures?: number
    n_epochs?: number
    set?: string // "fast": one of the ten fast movers added as a test of the fit
}

export type Epoch = {
    index: number
    t_start: string
    t_end: string
    n_exposures: number
    predicted: XY
}

export type Frame = {
    epoch: number
    png: string
    n_frames: number
    wave_min_um: number
    wave_max_um: number
}

export type Band = { id: string; label: string; dets: number[] | null; frames: Frame[] }

export type Meta = {
    name: string
    grid: { npix: number; scale_arcsec: number }
    n_exposures: number
    epochs: Epoch[]
    bands: Band[]
}

export type FitMethod = {
    id: string
    label: string
    n_used: number
    pm_east: number
    pm_east_err: number
    pm_north: number
    pm_north_err: number
    plx: number
    plx_err: number
    plx_loo_min: number | null
    plx_loo_max: number | null
    plx_excess_pct: number
}

export type Arrow = { x: number; y: number; dx: number; dy: number; span_years: number }

export type Fit = {
    reference: { pm_east: number; pm_north: number; plx: number; source: string; bibcode: string }
    methods: FitMethod[]
    arrow: Arrow
}

export type MotionPair = {
    from: number
    to: number
    predicted: { east: number; north: number }
    methods: { id: string; label: string; east: number; east_err: number; north: number; north_err: number }[]
}

// A Gaia star close to the target that is also seen on the long-wavelength stacks.
export type Neighbour = {
    gaia_id: string
    g: number | null
    xy: XY[] | null // per epoch, Gaia position of the star on the display grid
    sep_arcsec: number[] // per epoch, from the predicted target position
    amp_ratio: number[] // per epoch, neighbour / target amplitude on the D5+D6 stack
    amp_ratio_range: [number, number][] // 16-84% bootstrap range
    short_offset_max_arcsec: number | null
    short_snr_min: number
}

export type StackMotion = {
    epochs: { epoch: number; n_frames: number; snr_peak: number }[]
    pairs: MotionPair[]
    neighbour: Neighbour | null
}

export type PerExposureFit = {
    n_exposures: number
    median_snr: number
    plx: { label: string; value: number; err: number }[]
    reference_plx: number
}

export type Flicker = {
    n_stars: number
    raw_scatter_median: number
    epoch_std_median: number
}

// Difference image of one detector selection (pipeline/diff_image.py, logs/diff_image_<slug>.log).
export type DiffBand = {
    id: string
    png: string
    dets_used: number[] // detectors with exposures in both epochs
    n_first: number
    n_last: number
    vmax: number // the grey scale runs from -vmax to +vmax, MJy/sr
    distinct: boolean // the target's bright-dark pair stands out from the field-star residuals
    n_stars: number
    star_ratio_median: number | null // |residual| / own peak of constant field stars
    star_ratio_p90: number | null
    lobe_bright_ratio: number // the target's bright and dark side / its own peak
    lobe_dark_ratio: number
    lobe_bright_sigma: number
    lobe_dark_sigma: number
}

export type Diff = { from_epoch: number; to_epoch: number; label: string; bands: DiffBand[] }

export type Results = {
    saturation: {
        overflow: number
        exposures: number
        // OVERFLOW exposures whose core holds an empty (NaN) pixel / holds a value in all 9 pixels
        core_empty: number | null
        core_filled: number | null
    } | null
    fit: Fit | null
    // fast mover whose fit is not shown: too few usable exposures (pipeline/fast_movers_table.py)
    fit_not_shown?: {
        usable: number
        usable_per_epoch: number[]
        exposures: number
        min_exposures: number
        min_epochs: number
        min_per_epoch: number
    } | null
    // fast mover: the brightest source near the marker is not at the catalogue position (per epoch, arcsec)
    off_target?: { offset_arcsec: number[]; limit_arcsec: number } | null
    stack_motion: StackMotion | null
    per_exposure_fit: PerExposureFit | null
    flicker: Flicker | null
    raw_dropped: { dropped: number; total: number; max_masked_fraction: number }
    has_diff?: boolean // diff.json exists for this target; it is requested only then
    default_band: string
    compare_bands: string[] | null
}