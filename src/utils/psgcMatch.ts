// Maps a place name from another source (OpenStreetMap) onto a PSGC list. It never guesses: no match, or an
// ambiguous one, is null and the form asks the user to pick.

/** Lowercase, no accents, no "City of"/"Barangay" labels, no "(…)" qualifiers or punctuation. */
export function normalizePlace(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(city of|municipality of|barangay|brgy|bgy)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Exact match first, then a single startsWith, then (for real words only) a single includes. */
export function matchPlace<T extends { name: string }>(list: T[], name: string): T | null {
  const wanted = normalizePlace(name)
  if (!wanted) return null
  const keyed = list.map((item) => ({ item, key: normalizePlace(item.name) }))
  const only = (hits: typeof keyed) => (hits.length === 1 ? hits[0].item : null)
  const exact = keyed.filter((k) => k.key === wanted)
  if (exact.length) return only(exact)
  const starts = keyed.filter((k) => k.key.startsWith(wanted))
  if (starts.length) return only(starts)
  // A bare number or a short word would match unrelated names ("17" in "117"), so it must match whole.
  if (wanted.length < 4 || !/[a-z]/.test(wanted)) return null
  return only(keyed.filter((k) => k.key.includes(wanted)))
}

// What OpenStreetMap calls a region, by its PSGC name.
const REGION_ALIASES: Record<string, string> = {
  'metro manila': 'ncr',
  'national capital region': 'ncr',
  'manila metropolitan area': 'ncr',
  mimaropa: 'mimaropa region',
  'southern tagalog': 'calabarzon',
  'cordillera administrative region': 'car',
  'bangsamoro autonomous region in muslim mindanao': 'barmm',
  'bangsamoro autonomous region': 'barmm',
  armm: 'barmm',
  'caraga region': 'caraga',
  davao: 'davao region',
  bicol: 'bicol region',
  ilocos: 'ilocos region',
}

/** Regions carry two names ("CALABARZON" and "Region IV-A"); either one matches. */
export function matchRegion<T extends { name: string; regionName: string }>(regions: T[], name: string): T | null {
  const wanted = normalizePlace(name)
  const target = REGION_ALIASES[wanted] ?? wanted
  const hits = regions.filter((r) => normalizePlace(r.name) === target || normalizePlace(r.regionName) === target)
  if (hits.length === 1) return hits[0]
  return hits.length ? null : matchPlace(regions, target)
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** A saved name back onto its list: the exact name first, then the fuzzy match. Null when none or more than one fit. */
export function findByName<T extends { name: string }>(list: T[], name: string): T | null {
  const exact = list.filter((item) => same(item.name, name))
  return exact.length ? (exact.length === 1 ? exact[0] : null) : matchPlace(list, name)
}

/** Like findByName for regions, which answer to either of their two names. */
export function findRegion<T extends { name: string; regionName: string }>(regions: T[], name: string): T | null {
  const exact = regions.filter((r) => same(r.name, name) || same(r.regionName, name))
  return exact.length ? (exact.length === 1 ? exact[0] : null) : matchRegion(regions, name)
}
