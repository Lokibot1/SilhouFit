import type { Product } from '../data/products'
import type { GarmentValues } from './arFit'

// Sizing the t-shirt model for the AR try-on. Pure TypeScript with no rendering.

/** Only the t-shirt model exists so far, so only shirts that are AR ready can be tried on. */
export const canTryOn = (product: Pick<Product, 'arReady' | 'category'>) => product.arReady && product.category === 'Shirt'

// What the committed model measures, in cm (flat widths, like a size chart).
// Length and sleeve: scripts/convert-tshirt.mjs output. Chest: half the girth of the torso below the underarm (the model is draped, so its x width
// is not a flat width). Shoulder: the width at the sleeve join. All approximate.
export const GARMENT_BASE = { length: 67.5, shoulder: 41.5, sleeve: 26.7, chest: 50.0 }

/**
 * Scale of the model for a size: width (x and z) from the chest, or from the shoulders when there is no chest; height from the total length.
 * A value a size lacks leaves that axis at 1.
 * shortcut: sleeve length is not scaled on its own (one uniform mesh), so a size with sleeves out of proportion shows the body's ratio; split the mesh to upgrade.
 */
export function garmentScale(values: GarmentValues) {
  const ratio = (value: number | null | undefined, base: number) => (value ? value / base : undefined)
  const width = ratio(values.chestWidthCm, GARMENT_BASE.chest) ?? ratio(values.shoulderWidthCm, GARMENT_BASE.shoulder) ?? 1
  return { x: width, y: ratio(values.totalLengthCm, GARMENT_BASE.length) ?? 1, z: width }
}
