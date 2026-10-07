import { COUNTRIES, type Country } from '../data/countries'

/** Lowercase, drop diacritics and apostrophes so "cote" finds "Côte d'Ivoire". */
function fold(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Filters by name, ISO code or dial code ("+63" and "63" both work).
 * Rank: exact code, name prefix, exact dial code, name contains, then dial or code prefix.
 * Ties keep the dataset's name order.
 */
export function searchCountries(query: string): readonly Country[] {
  const q = fold(query)
  if (!q) return COUNTRIES

  const digits = /^\+?\d+$/.test(q) ? q.replace('+', '') : ''
  const ranked: { country: Country; rank: number }[] = []

  for (const country of COUNTRIES) {
    const name = fold(country.name)
    const code = country.code.toLowerCase()
    const dial = country.dial.slice(1)

    let rank = -1
    if (code === q) rank = 0
    else if (name.startsWith(q)) rank = 1
    else if (digits && dial === digits) rank = 2
    else if (name.includes(q)) rank = 3
    else if (digits ? dial.startsWith(digits) : code.startsWith(q)) rank = 4

    if (rank >= 0) ranked.push({ country, rank })
  }

  // Array.prototype.sort is stable, so equal ranks stay in name order.
  return ranked.sort((a, b) => a.rank - b.rank).map((entry) => entry.country)
}
