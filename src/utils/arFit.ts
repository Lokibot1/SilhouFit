import type { Entered } from '../components/body-setup/measurements'
import type { MeasurementKey } from '../service/fetchProductList'

// How a garment fits a body, for the AR fitting. Pure TypeScript with no rendering. Ease is garment minus body, in cm: negative means the
// garment is smaller than the body. A garment's widths are flat (pit to pit), so a girth is twice its width.

export type FitLevel = 'too-tight' | 'fitted' | 'regular' | 'loose' | 'oversized'
export type FitRegion = 'chest' | 'waist' | 'shoulders' | 'sleeve'
export interface RegionFit {
  easeCm: number
  level: FitLevel
}
export interface Fit {
  regions: Partial<Record<FitRegion, RegionFit>>
  /** The chest decides, unless a region is too tight. Null when nothing could be compared. */
  overall: FitLevel | null
}

/** A garment's measurements; a missing or null one is skipped. */
export type GarmentValues = Partial<Record<MeasurementKey, number | null>>

const LEVELS: FitLevel[] = ['too-tight', 'fitted', 'regular', 'loose', 'oversized']

// Per region: which body and garment measurement are compared, how many body cm one garment cm stands for, and the ease (cm) below which
// a fit is too tight, fitted, regular and loose; at or above the last it is oversized. These are first guesses, to tune.
const REGIONS: Record<FitRegion, { body: keyof Entered; garment: MeasurementKey; factor: number; limits: [number, number, number, number] }> = {
  chest: { body: 'chest', garment: 'chestWidthCm', factor: 2, limits: [0, 6, 14, 22] },
  waist: { body: 'waist', garment: 'waistWidthCm', factor: 2, limits: [0, 6, 14, 22] },
  shoulders: { body: 'shoulders', garment: 'shoulderWidthCm', factor: 1, limits: [-1, 2, 5, 8] },
  sleeve: { body: 'sleeve', garment: 'sleeveLengthCm', factor: 1, limits: [-2, 2, 5, 9] },
}

/** A garment sleeve shorter than this share of the arm is a short sleeve: it covers part of the arm, so it is not compared with the whole arm. */
const MIN_SLEEVE_SHARE = 0.6

/** The chest ease a recommended size aims for: the middle of "regular". */
const TARGET_CHEST_EASE = 8

const levelOf = (easeCm: number, limits: number[]): FitLevel => {
  const below = limits.findIndex((limit) => easeCm < limit)
  return LEVELS[below === -1 ? LEVELS.length - 1 : below]
}
const round1 = (n: number) => Math.round(n * 10) / 10

export function compareFit(body: Entered, garment: GarmentValues): Fit {
  const regions: Fit['regions'] = {}
  for (const [region, spec] of Object.entries(REGIONS) as [FitRegion, (typeof REGIONS)[FitRegion]][]) {
    const bodyCm = body[spec.body]
    const garmentCm = garment[spec.garment]
    if (bodyCm === undefined || garmentCm === null || garmentCm === undefined) continue
    if (region === 'sleeve' && garmentCm < bodyCm * MIN_SLEEVE_SHARE) continue
    const easeCm = round1(garmentCm * spec.factor - bodyCm)
    regions[region] = { easeCm, level: levelOf(easeCm, spec.limits) }
  }
  const found = Object.values(regions)
  const overall = found.length === 0 ? null : found.some((r) => r.level === 'too-tight') ? 'too-tight' : (regions.chest ?? found[0]).level
  return { regions, overall }
}

/**
 * The size to select first: of the sizes that are not too tight, the one whose chest ease is closest to a regular fit. Pass sizes smallest
 * first (as `buildSizeGuide` does); the smaller wins a tie.
 * Null without a chest measurement, or when every size is too tight.
 */
export function recommendSize(body: Entered, sizes: { size: string; values: GarmentValues }[]): string | null {
  let best: { size: string; distance: number } | null = null
  for (const { size, values } of sizes) {
    const fit = compareFit(body, values)
    const chest = fit.regions.chest
    if (!chest || fit.overall === 'too-tight') continue
    const distance = Math.abs(chest.easeCm - TARGET_CHEST_EASE)
    if (!best || distance < best.distance) best = { size, distance }
  }
  return best?.size ?? null
}
