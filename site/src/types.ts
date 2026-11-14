// Shapes of the static JSON files under public/data/ (written by the Python pipeline).

export type XY = { x: number; y: number }

export type TargetEntry = {
    slug: string
    name: string
    sp_type?: string
    n_exposures?: number
    n_epochs?: number
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

export type Results = {
    saturation: {
        overflow: number
        exposures: number
        // OVERFLOW exposures whose core holds an empty (NaN) pixel / holds a value in all 9 pixels
        core_empty: number | null
        core_filled: number | null
    } | null
    fit: Fit | null
    stack_motion: StackMotion | null
    per_exposure_fit: PerExposureFit | null
    flicker: Flicker | null
    raw_dropped: { dropped: number; total: number; max_masked_fraction: number }
    default_band: string
    compare_bands: string[] | null
}