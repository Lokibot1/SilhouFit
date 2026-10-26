import type { Address } from '../service/addresses'
import { getBarangays, getCities, getRegions } from '../service/psgc'
import { findByName, findRegion } from './psgcMatch'

export interface Place {
  code: string | null
  name: string
}

export interface ResolvedAddress {
  /** True when the places are plain text: the lists could not place the region, or could not load. */
  typed: boolean
  region: Place
  city: Place
  barangay: Place
  /** The saved province, '' when there is none. */
  province: string
  /** What did not match, for the form to say. */
  note: string | null
}

const unmatched = (level: string) => `We couldn't match your ${level} to our list. Pick it again.`

/**
 * Puts a saved address's place names back onto the PSGC lists so the form can offer them as selects. It never
 * guesses: a level that does not match is left empty (with everything below it) for the user to pick again.
 * A list that cannot load leaves the saved names as text, so editing is never blocked. An abort rejects.
 */
export async function resolveAddressCodes(address: Address, signal: AbortSignal): Promise<ResolvedAddress> {
  const province = address.province ?? ''
  const text: ResolvedAddress = {
    typed: true,
    region: { code: null, name: address.region },
    city: { code: null, name: address.cityMunicipality },
    barangay: { code: null, name: address.barangay },
    province,
    note: null,
  }
  const empty: Place = { code: null, name: '' }
  try {
    const region = findRegion(await getRegions(signal), address.region)
    if (!region) return { ...text, note: "We couldn't match your region to our list, so it is shown as text." }
    const picked = { ...text, typed: false, region: { code: region.code, name: region.name } }

    const city = findByName(await getCities(region.code, signal), address.cityMunicipality)
    if (!city) return { ...picked, city: empty, barangay: empty, note: unmatched('city or municipality') }
    picked.city = { code: city.code, name: city.name }

    const barangay = findByName(await getBarangays(city.code, signal), address.barangay)
    if (!barangay) return { ...picked, barangay: empty, note: unmatched('barangay') }
    return { ...picked, barangay: { code: barangay.code, name: barangay.name } }
  } catch (error) {
    if (signal.aborted) throw error
    return { ...text, note: "We couldn't load the address lists, so your saved places are shown as text." }
  }
}
