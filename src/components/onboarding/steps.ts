import type { Product } from '../../data/products'

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

/**
 * The real checkout for one piece, opened the way Buy now does plus `tour=1`, so a real Buy now is never mistaken for
 * the tour's sample. The cart is never touched.
 */
export function tourCheckoutPath(product: Product) {
  const variant = product.variants!.find((v) => v.stock > 0)!
  return `/checkout?item=${product.id}&variant=${variant.id}&qty=1&tour=1`
}

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
        body: 'Shirts marked AR ready have a Try-On button. It opens a preview of the shirt in your size and colour, and asks for camera access only after you tap it.',
        fallback:
          'AR-ready shirts have a Try-On button. It previews the shirt in your size and colour, and asks for camera access only after you tap it.',
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
        fallback: 'Checkout lists your order, then asks where to deliver it and how you want to pay.',
      },
      {
        targets: ['checkout-payment'],
        body: 'Pay online with GCash, Maya, card and more on a secure payment page. SilhouFit is a prototype, so no payment is taken.',
        fallback: 'You can pay online with GCash, Maya, card and more. SilhouFit is a prototype, so no payment is taken.',
      },
      {
        targets: ['checkout-place'],
        body: 'Place order finishes the purchase. The tour will never press it for you.',
        fallback: 'Place order finishes a purchase. The tour will never press it for you.',
      },
    ],
  },
]

/** The steps for this sample piece. */
export const tourSteps = (product: Product | null) => STEPS.filter((step) => step.applies(product))
