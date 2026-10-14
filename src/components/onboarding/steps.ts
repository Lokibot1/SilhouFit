import { sizesFor, type Product } from '../../data/products'
import { fulfilmentAvailability } from '../../utils/checkout'

export interface TourStop {
  /** `data-tour` keys, tried in order: the first with a visible match is the spotlight. */
  targets: string[]
  body: string
  /** Shown instead of `body` when there is nothing to point at (no sample piece, or the target is not on the page). */
  fallback: string
  /** The target is in the top bar, so it can be found even when there is no sample piece to open a page for. */
  anyPage?: boolean
}

export interface TourStep {
  id: string
  title: string
  /** Where the step happens, or null when it needs no page of its own. */
  route: (product: Product | null) => string | null
  applies: (product: Product | null) => boolean
  stops: TourStop[]
}

/** The piece the tour shows: in stock, AR-ready and sold both online and in store; else the nearest thing to it. */
export function tourProduct(catalogue: Product[] | null): Product | null {
  const inStock = (catalogue ?? []).filter((p) => p.stock > 0)
  return (
    inStock.find((p) => p.arReady && p.channels.includes('online') && p.channels.includes('store')) ??
    inStock.find((p) => p.arReady) ??
    inStock[0] ??
    null
  )
}

/**
 * The real checkout for one piece, opened the way Buy now does plus `tour=1`, so a real Buy now is never mistaken for
 * the tour's sample. The cart is never touched.
 */
export function tourCheckoutPath(product: Product) {
  const size = sizesFor(product)[0]
  const color = product.colors[0].name
  return `/checkout?item=${product.id}&size=${encodeURIComponent(size)}&color=${encodeURIComponent(color)}&qty=1&tour=1`
}

const pickupAvailable = (product: Product | null) =>
  !product ||
  fulfilmentAvailability([{ product, size: sizesFor(product)[0], color: product.colors[0].name, qty: 1 }]).pickup === null

const STEPS: TourStep[] = [
  {
    id: 'explore',
    title: 'Explore the shop',
    route: () => '/shop',
    applies: () => true,
    stops: [
      {
        targets: ['shop-search', 'shop-search-toggle'],
        body: 'Search the catalogue by name, colour or category. On a phone, tap the magnifier to open the search.',
        fallback: 'The shop has a search bar in the top bar. Use it to find a piece by name, colour or category.',
      },
      {
        targets: ['shop-categories', 'shop-filters'],
        body: 'Narrow the shop by category, or open Filters for price, colour and availability.',
        fallback: 'On the shop page, category pills and a Filters button narrow the catalogue by price, colour and availability.',
      },
      {
        targets: ['product-card'],
        body: 'Open any piece to see its photos, sizes and colours.',
        fallback: 'Every piece in the shop opens to a page with its photos, sizes and colours.',
      },
    ],
  },
  {
    id: 'cart',
    title: 'Add to cart',
    route: (product) => (product ? `/shop/${product.id}` : null),
    applies: () => true,
    stops: [
      {
        targets: ['product-options'],
        body: 'Choose a colour and a size first. Both are required before you can add the piece.',
        fallback: 'On a piece page you choose a colour and a size, and both are required.',
      },
      {
        targets: ['product-add'],
        body: 'Add to cart keeps the piece for later. Buy now skips the cart and goes straight to checkout. Try Add to cart now if you like.',
        fallback: 'Add to cart keeps a piece for later. Buy now skips the cart and goes straight to checkout.',
      },
      {
        targets: ['cart'],
        body: 'Your cart is here, with a count of what you have added.',
        fallback: 'Your cart is in the top bar, with a count of what you have added.',
        anyPage: true,
      },
    ],
  },
  {
    id: 'ar',
    title: 'Try it on with AR',
    route: (product) => (product ? `/shop/${product.id}` : null),
    applies: () => true,
    stops: [
      {
        targets: ['product-ar'],
        body: 'AR try-on is coming soon, so this button is switched off for now. When it launches it will ask for camera access, only after you tap it.',
        fallback:
          'AR try-on is coming soon. When it launches, AR-ready pieces will have a Try-On button that asks for camera access only after you tap it.',
      },
    ],
  },
  {
    id: 'checkout',
    title: 'Check out',
    route: (product) => (product ? tourCheckoutPath(product) : null),
    applies: () => true,
    stops: [
      {
        targets: ['checkout-items'],
        body: 'This is the real checkout, opened with a sample piece. Your cart is untouched and nothing is ordered unless you press Place order.',
        fallback: 'Checkout lists your order, then asks how you want to get it and how you want to pay.',
      },
      {
        targets: ['checkout-payment'],
        body: 'Pay with GCash, Maya or cash. SilhouFit is a prototype, so no payment is taken.',
        fallback: 'You can pay with GCash, Maya or cash. SilhouFit is a prototype, so no payment is taken.',
      },
      {
        targets: ['checkout-place'],
        body: 'Place order finishes the purchase. The tour will never press it for you.',
        fallback: 'Place order finishes a purchase. The tour will never press it for you.',
      },
    ],
  },
  {
    id: 'pickup',
    title: 'Pick up in store',
    route: (product) => (product ? tourCheckoutPath(product) : null),
    applies: pickupAvailable,
    stops: [
      {
        targets: ['checkout-fulfilment'],
        body: 'Some pieces can be collected at the boutique for free. Choose Pick up in store instead of Delivery.',
        fallback: 'Some pieces can be collected at the boutique for free. Look for Pick up in store at checkout.',
      },
    ],
  },
]

/** The steps for this sample piece. Pick up in store drops out when the piece cannot be collected. */
export const tourSteps = (product: Product | null) => STEPS.filter((step) => step.applies(product))
