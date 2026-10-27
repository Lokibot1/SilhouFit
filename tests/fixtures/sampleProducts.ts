import type { SampleProduct } from '../../src/service/fetchStaffAnalytics'

// Twelve products as the API would list them: one sold out, one low, the rest in stock, every third AR ready.
const CATEGORIES = ['Hoodie', 'Pants', 'Headwear', 'Shorts']
export const SAMPLE_PRODUCTS: SampleProduct[] = Array.from({ length: 12 }, (_, n) => ({
  id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
  name: `Piece ${n + 1}`,
  category: CATEGORIES[n % CATEGORIES.length],
  price: 1200 + n * 150,
  stock: n === 0 ? 0 : n === 1 ? 3 : 20 + n,
  arReady: n % 3 === 0,
}))
