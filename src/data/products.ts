export const CATEGORIES = ['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Knitwear'] as const
export type Category = (typeof CATEGORIES)[number]

export type Badge = 'New' | 'Best seller' | 'Limited' | 'AR-ready'
export type Channel = 'online' | 'store'

/** Sizes offered per category. Stock is tracked per piece, not per size (the real backend can refine that). */
export const SIZES_BY_CATEGORY: Record<Category, string[]> = {
  Tops: ['XS', 'S', 'M', 'L', 'XL'],
  Outerwear: ['XS', 'S', 'M', 'L', 'XL'],
  Knitwear: ['XS', 'S', 'M', 'L', 'XL'],
  Bottoms: ['26', '28', '30', '32', '34', '36'],
  Dresses: ['XS', 'S', 'M', 'L'],
}

/** From 1 up to this many units, a card shows "Only N left". */
export const LOW_STOCK = 5

export interface Product {
  id: string
  name: string
  category: Category
  boutique: string
  price: number
  salePrice?: number
  image: string
  alt: string
  colors: { name: string; hex: string }[]
  badges: Badge[]
  stock: number
  channels: Channel[]
  arReady: boolean
  addedAt: string
  rating: number
  reviews: number
}

export const sizesFor = (product: Pick<Product, 'category'>) => SIZES_BY_CATEGORY[product.category]

const BLACK = { name: 'Black', hex: '#1b1d21' }
const WHITE = { name: 'White', hex: '#f1f1ee' }
const NAVY = { name: 'Navy', hex: '#26324a' }
const INDIGO = { name: 'Indigo', hex: '#3b4f7a' }
const SAND = { name: 'Sand', hex: '#cdb99a' }
const OLIVE = { name: 'Olive', hex: '#6b7048' }
const RUST = { name: 'Rust', hex: '#a24f34' }
const GREY = { name: 'Grey', hex: '#8b919b' }
const BLUSH = { name: 'Blush', hex: '#dba9a0' }

const AYALA = 'Ayala Atelier'
const BINONDO = 'Binondo Basics'
const LUMBAN = 'Lumban Loom'
const photo = (name: string) => `/images/gallery/${name}.webp`

// Mock catalogue, the stand-in for the API behind service/fetchProducts.ts.
// Photos reuse the Unsplash License gallery set; each trailing comment is the photo ID.
export const PRODUCTS: Product[] = [
  { id: 'p01', name: 'Heritage Polo', category: 'Tops', boutique: AYALA, price: 1890, image: photo('white-polo'), alt: 'White polo shirt on a wooden hanger', colors: [WHITE, NAVY], badges: ['Best seller'], stock: 24, channels: ['online', 'store'], arReady: false, addedAt: '2026-03-02', rating: 4.7, reviews: 212 }, // F5i3PZXYkvY
  { id: 'p02', name: 'Fence-Line Blazer', category: 'Outerwear', boutique: AYALA, price: 6490, salePrice: 4990, image: photo('blazer'), alt: 'Black blazer hanging on a rustic fence', colors: [BLACK], badges: ['AR-ready'], stock: 4, channels: ['store'], arReady: true, addedAt: '2026-02-11', rating: 4.5, reviews: 58 }, // VsCBt8j-qg4
  { id: 'p03', name: 'Rail Tank Set', category: 'Tops', boutique: BINONDO, price: 790, image: photo('tank-tops'), alt: 'Rail of tank tops in assorted colours', colors: [WHITE, BLACK, SAND, BLUSH], badges: [], stock: 60, channels: ['online', 'store'], arReady: false, addedAt: '2026-01-20', rating: 4.2, reviews: 340 }, // iYqeLjGDk9M
  { id: 'p04', name: 'Straight Leg Jean', category: 'Bottoms', boutique: LUMBAN, price: 2590, image: photo('straight-jeans'), alt: 'Straight-leg jeans on a hanger', colors: [INDIGO, BLACK], badges: ['Best seller', 'AR-ready'], stock: 31, channels: ['online', 'store'], arReady: true, addedAt: '2026-03-18', rating: 4.8, reviews: 489 }, // nC4-PXzKZcI
  { id: 'p05', name: 'Cable Knit Pullover', category: 'Knitwear', boutique: LUMBAN, price: 3290, image: photo('knitwear'), alt: 'Stack of folded knit sweaters', colors: [SAND, GREY, OLIVE], badges: ['New'], stock: 18, channels: ['online'], arReady: false, addedAt: '2026-09-01', rating: 4.6, reviews: 37 }, // 6-HTjxp21xo
  { id: 'p06', name: 'Oxford Dress Shirt', category: 'Tops', boutique: AYALA, price: 2190, image: photo('dress-shirts'), alt: 'White dress shirts on wooden hangers', colors: [WHITE, BLUSH], badges: [], stock: 3, channels: ['store'], arReady: false, addedAt: '2026-02-25', rating: 4.4, reviews: 91 }, // hMMXhKSZk7k
  { id: 'p07', name: 'Garden Print Dress', category: 'Dresses', boutique: BINONDO, price: 2890, salePrice: 2290, image: photo('floral-dresses'), alt: 'Rail of floral print dresses', colors: [BLUSH, OLIVE], badges: ['Limited', 'AR-ready'], stock: 5, channels: ['online', 'store'], arReady: true, addedAt: '2026-08-14', rating: 4.3, reviews: 66 }, // 1lmPFQ7ZXeM
  { id: 'p08', name: 'Everyday Crew Tee', category: 'Tops', boutique: BINONDO, price: 690, image: photo('black-tees'), alt: 'Black crew-neck t-shirts on hangers', colors: [BLACK, WHITE, GREY], badges: ['Best seller'], stock: 120, channels: ['online', 'store'], arReady: false, addedAt: '2025-12-05', rating: 4.9, reviews: 1043 }, // DjCo6_Rr4nE
  { id: 'p09', name: 'Showroom Denim Jacket', category: 'Outerwear', boutique: LUMBAN, price: 4190, image: photo('denim-jacket'), alt: 'Denim jacket displayed in a shop', colors: [INDIGO], badges: ['AR-ready'], stock: 12, channels: ['online', 'store'], arReady: true, addedAt: '2026-04-09', rating: 4.6, reviews: 154 }, // zs6-wsPk8hI
  { id: 'p10', name: 'Rugby Stripe Polo', category: 'Tops', boutique: AYALA, price: 1990, image: photo('striped-polo'), alt: 'Striped rugby polo shirt, close up', colors: [NAVY, RUST], badges: ['New'], stock: 22, channels: ['online'], arReady: false, addedAt: '2026-09-20', rating: 4.1, reviews: 19 }, // 88b_XeVGGE0
  { id: 'p11', name: 'Atelier Gown', category: 'Dresses', boutique: AYALA, price: 8900, image: photo('dress-on-hanger'), alt: 'White gown hanging against a wooden wall', colors: [WHITE], badges: ['Limited', 'AR-ready'], stock: 2, channels: ['store'], arReady: true, addedAt: '2026-07-07', rating: 5, reviews: 12 }, // lKHPn48Jju4
  { id: 'p12', name: 'Hook Wall Jacket', category: 'Outerwear', boutique: LUMBAN, price: 3790, image: photo('jackets-on-hooks'), alt: 'Jackets and a cap hanging on wall hooks', colors: [OLIVE, BLACK], badges: [], stock: 15, channels: ['store'], arReady: false, addedAt: '2026-01-30', rating: 4, reviews: 44 }, // 8xTN-V_s6sU
  { id: 'p13', name: 'Studio White Tee', category: 'Tops', boutique: BINONDO, price: 790, image: photo('white-tee'), alt: 'White t-shirt on a black hanger', colors: [WHITE], badges: [], stock: 85, channels: ['online', 'store'], arReady: false, addedAt: '2025-11-14', rating: 4.5, reviews: 612 }, // TvL5vIgwiwo
  { id: 'p14', name: 'Earth Tone Sweater', category: 'Knitwear', boutique: LUMBAN, price: 2990, salePrice: 2390, image: photo('sweater-stack'), alt: 'Folded wool sweaters in earth tones', colors: [RUST, SAND, OLIVE], badges: [], stock: 9, channels: ['online', 'store'], arReady: false, addedAt: '2026-05-22', rating: 4.4, reviews: 103 }, // 3FQBV3LvrDM
  { id: 'p15', name: 'Camo Weekend Tank', category: 'Tops', boutique: BINONDO, price: 890, image: photo('tank-top-outfit'), alt: 'White tank top worn with camouflage trousers', colors: [WHITE, OLIVE], badges: ['New', 'AR-ready'], stock: 40, channels: ['online'], arReady: true, addedAt: '2026-09-28', rating: 4.2, reviews: 8 }, // JYPTSbq5Kos
  { id: 'p16', name: 'Light Wash Jean', category: 'Bottoms', boutique: AYALA, price: 2390, image: photo('jeans-on-hanger'), alt: 'Light-wash jeans on a wooden hanger', colors: [INDIGO, GREY], badges: ['AR-ready'], stock: 4, channels: ['store'], arReady: true, addedAt: '2026-03-30', rating: 4.3, reviews: 77 }, // EtOMMg1nSR8
  { id: 'p17', name: 'Rail White Shirt', category: 'Tops', boutique: AYALA, price: 1790, image: photo('white-shirt-rail'), alt: 'White shirts on a rail against black', colors: [WHITE], badges: [], stock: 33, channels: ['online', 'store'], arReady: false, addedAt: '2026-02-03', rating: 4.5, reviews: 129 }, // e8sbQNYEwX8
  { id: 'p18', name: 'Stacked Raw Denim', category: 'Bottoms', boutique: LUMBAN, price: 2790, image: photo('folded-jeans'), alt: 'Folded jeans stacked on a boot', colors: [INDIGO, BLACK], badges: ['Limited'], stock: 6, channels: ['online'], arReady: false, addedAt: '2026-06-12', rating: 4.7, reviews: 51 }, // Arxc2ZOfGRU
  { id: 'p19', name: 'Boxy Blazer', category: 'Outerwear', boutique: BINONDO, price: 5290, image: photo('blazer'), alt: 'Black blazer hanging on a rustic fence', colors: [BLACK, GREY], badges: ['AR-ready'], stock: 8, channels: ['online', 'store'], arReady: true, addedAt: '2026-08-02', rating: 4.2, reviews: 29 }, // VsCBt8j-qg4
  { id: 'p20', name: 'Soft Merino Knit', category: 'Knitwear', boutique: AYALA, price: 3890, image: photo('knitwear'), alt: 'Stack of folded knit sweaters', colors: [GREY, BLUSH], badges: ['New', 'AR-ready'], stock: 14, channels: ['online', 'store'], arReady: true, addedAt: '2026-10-02', rating: 4.8, reviews: 16 }, // 6-HTjxp21xo
  { id: 'p21', name: 'Summer Wrap Dress', category: 'Dresses', boutique: LUMBAN, price: 2490, image: photo('floral-dresses'), alt: 'Rail of floral print dresses', colors: [BLUSH, RUST], badges: [], stock: 20, channels: ['online'], arReady: false, addedAt: '2026-05-05', rating: 4.1, reviews: 85 }, // 1lmPFQ7ZXeM
  { id: 'p22', name: 'Weekend Tapered Jean', category: 'Bottoms', boutique: BINONDO, price: 1990, salePrice: 1590, image: photo('straight-jeans'), alt: 'Straight-leg jeans on a hanger', colors: [INDIGO, SAND], badges: [], stock: 27, channels: ['online', 'store'], arReady: false, addedAt: '2025-12-19', rating: 4, reviews: 201 }, // nC4-PXzKZcI
  { id: 'p23', name: 'Washed Black Tee', category: 'Tops', boutique: LUMBAN, price: 990, image: photo('black-tees'), alt: 'Black crew-neck t-shirts on hangers', colors: [BLACK], badges: [], stock: 5, channels: ['store'], arReady: false, addedAt: '2026-04-27', rating: 4.3, reviews: 63 }, // DjCo6_Rr4nE
  { id: 'p24', name: 'Field Denim Jacket', category: 'Outerwear', boutique: AYALA, price: 4590, image: photo('denim-jacket'), alt: 'Denim jacket displayed in a shop', colors: [INDIGO, SAND], badges: ['Best seller'], stock: 0, channels: ['online'], arReady: false, addedAt: '2026-01-08', rating: 4.9, reviews: 318 }, // zs6-wsPk8hI
]
