import { MotionConfig } from 'motion/react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BagIcon, CartIcon, HeartIcon, SparkleIcon, StoreIcon, XIcon } from '../../components/form/icons'
import { ProductCard } from '../../components/shop/ProductCard'
import { ShopHeader } from '../../components/shop/ShopHeader'
import { WishlistGridSkeleton } from '../../components/shop/ShopSkeleton'
import { SHOP_PRIMARY, SHOP_SECONDARY } from '../../components/shop/shopControls'
import { SpecSheet, type Choice } from '../../components/shop/SpecSheet'
import { useToast } from '../../components/toast/useToast'
import { PRIMARY_BUTTON } from '../../components/ui/buttonStyles'
import type { Product } from '../../data/products'
import { useCart } from '../../hooks/useCart'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useProductsByIds } from '../../hooks/useProducts'
import { useWishlist } from '../../hooks/useWishlist'
import { playAddToCart } from '../../utils/sound'

const DESCRIPTION =
  'Your SilhouFit wishlist: review the pieces you saved, then add them to your cart or buy them, one at a time or several together.'

interface Picked extends Choice {
  product: Product
}

/** Choosing options for each piece in turn; `picks` are the pieces done so far. */
interface Flow {
  action: 'cart' | 'buy'
  queue: Product[]
  picks: Picked[]
}

const plural = (n: number) => `${n} ${n === 1 ? 'piece' : 'pieces'}`

export function WishlistPage() {
  useDocumentTitle('Your wishlist — SilhouFit')
  useMetaDescription(DESCRIPTION)

  const wishlist = useWishlist()
  const products = useProductsByIds(wishlist.ids)
  const cart = useCart()
  const user = useCurrentUser()
  const navigate = useNavigate()
  const toast = useToast()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [flow, setFlow] = useState<Flow | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  // In the order they were saved. Ids for pieces that are archived or gone are hidden, not deleted.
  const saved = products.status === 'success' ? products.products : []
  const chosen = saved.filter((p) => selected.includes(p.id))
  const buyable = chosen.filter((p) => p.stock > 0)
  const allSelected = saved.length > 0 && chosen.length === saved.length

  function remove(list: Product[]) {
    const ids = list.map((p) => p.id)
    wishlist.remove(ids)
    setSelected((current) => current.filter((id) => !ids.includes(id)))
    // The cards disappear, so keep focus on the heading.
    headingRef.current?.focus()
    toast.show({
      kind: 'info',
      message: list.length === 1 ? `Removed ${list[0].name} from wishlist` : `Removed ${plural(list.length)} from wishlist`,
      action: { label: 'Undo', onClick: () => wishlist.add(ids) },
    })
  }

  function start(action: 'cart' | 'buy', list: Product[]) {
    const queue = list.filter((p) => p.stock > 0)
    if (queue.length < list.length) {
      const skipped = list.length - queue.length
      toast.show({ kind: 'info', message: `${plural(skipped)} sold out, so ${skipped === 1 ? 'it was' : 'they were'} left out.` })
    }
    if (queue.length === 0) return
    setFlow({ action, queue, picks: [] })
    setSheetOpen(true)
  }

  async function confirmChoice(choice: Choice) {
    if (!flow) return
    const picks = [...flow.picks, { product: flow.queue[flow.picks.length], ...choice }]
    if (picks.length < flow.queue.length) {
      setFlow({ ...flow, picks })
      return
    }
    setSheetOpen(false)
    if (flow.action === 'buy') {
      const query = new URLSearchParams()
      for (const { product, variantId, qty } of picks) {
        query.append('item', product.id)
        query.append('variant', variantId)
        query.append('qty', String(qty))
      }
      navigate(`/checkout?${query}`)
      return
    }
    const outcomes: Awaited<ReturnType<typeof cart.add>>[] = []
    for (const { product, variantId, qty } of picks) outcomes.push(await cart.add({ product, variantId, qty }))
    const added = picks.filter((_, i) => outcomes[i] === 'added')
    const limited = outcomes.filter((outcome) => outcome === 'limit').length
    if (limited > 0) {
      toast.show({ kind: 'info', message: `${plural(limited)} already at the stock limit in your cart, so ${limited === 1 ? 'it was' : 'they were'} not added.` })
    }
    if (added.length === 0) return
    // In the cart now, so no longer wanted here; Undo puts them back in both.
    const movedIds = added.map(({ product }) => product.id)
    wishlist.remove(movedIds)
    setSelected((current) => current.filter((id) => !movedIds.includes(id)))
    playAddToCart()
    toast.show({
      kind: 'success',
      message: added.length === 1 ? `Added to cart: ${[added[0].product.name, added[0].size, added[0].color].filter(Boolean).join(', ')} × ${added[0].qty}` : `Added ${plural(added.length)} to cart`,
      action: {
        label: 'Undo',
        onClick: () => {
          added.forEach(({ variantId, qty }) => void cart.remove(variantId, qty))
          wishlist.add(movedIds)
        },
      },
    })
  }

  function toggle(id: string, on: boolean) {
    setSelected((current) => (on ? [...current, id] : current.filter((x) => x !== id)))
  }

  const step = flow ? { index: flow.picks.length + 1, total: flow.queue.length } : undefined
  const sheetProduct = flow?.queue[flow.picks.length]

  return (
    <MotionConfig reducedMotion="user">
      <ShopHeader
        ref={headingRef}
        title="Your wishlist"
        crumb="Wishlist"
        backToShop
        summary={
          products.status === 'success' ? (
            <p className="font-ui text-sm text-fg-muted tabular-nums">{plural(saved.length)} saved</p>
          ) : undefined
        }
      />

      <div className="mx-auto max-w-6xl px-6 pb-24 2xl:max-w-[88rem]">
        {products.status === 'loading' && <WishlistGridSkeleton />}

        {products.status === 'error' && (
          <div role="alert" className="glass-card rounded-2xl p-6 sm:p-8">
            <h2 className="display text-2xl text-fg">Your wishlist did not load</h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-fg-muted">
              The request for stock and prices failed, most likely because the connection dropped or the service is
              briefly unavailable. Your saved pieces are kept. Check your connection, then try again.
            </p>
            <button type="button" onClick={products.retry} className={`${PRIMARY_BUTTON} mt-6`}>
              Try again
            </button>
          </div>
        )}

        {products.status === 'success' && saved.length === 0 && <EmptyWishlist name={user?.name} />}

        {products.status === 'success' && saved.length > 0 && (
          <>
            {/* Sticks just under the navbar (its 61px height) so the actions stay in reach while scrolling a long list. */}
            <div
              role="toolbar"
              aria-label="Wishlist actions"
              className="sticky top-[61px] z-10 -mx-6 flex flex-wrap items-center gap-2 border-b border-line bg-canvas/85 px-6 py-2 backdrop-blur-md sm:gap-3"
            >
              <button
                type="button"
                onClick={() => setSelected(allSelected ? [] : saved.map((p) => p.id))}
                className={SHOP_SECONDARY}
              >
                {allSelected ? 'Clear selection' : 'Select all'}
              </button>
              <p aria-live="polite" className="font-ui text-sm text-fg-muted tabular-nums">
                {chosen.length} selected
              </p>
              {/* A row of three on phones (a shorter label, the full name kept for screen readers); inline from sm. */}
              <div className="grid w-full grid-cols-3 gap-2 sm:ml-auto sm:flex sm:w-auto sm:gap-3">
                <button
                  type="button"
                  disabled={buyable.length === 0}
                  aria-label="Add to cart"
                  onClick={() => start('cart', chosen)}
                  className={`${SHOP_SECONDARY} min-w-0 gap-1.5 whitespace-nowrap max-sm:px-2 max-sm:text-xs`}
                >
                  <CartIcon size={16} />
                  <span className="max-sm:hidden">Add to cart</span>
                  <span aria-hidden="true" className="sm:hidden">
                    Cart
                  </span>
                </button>
                <button
                  type="button"
                  disabled={buyable.length === 0}
                  onClick={() => start('buy', chosen)}
                  className={`${SHOP_PRIMARY} min-w-0 gap-1.5 whitespace-nowrap max-sm:px-2 max-sm:text-xs`}
                >
                  <BagIcon size={16} />
                  Buy
                </button>
                <button
                  type="button"
                  disabled={chosen.length === 0}
                  onClick={() => remove(chosen)}
                  className={`${SHOP_SECONDARY} min-w-0 gap-1.5 whitespace-nowrap max-sm:px-2 max-sm:text-xs`}
                >
                  <XIcon size={16} />
                  Remove
                </button>
              </div>
            </div>
            {chosen.length > buyable.length && (
              <p className="mt-2 text-sm text-fg-muted">
                {plural(chosen.length - buyable.length)} selected {chosen.length - buyable.length === 1 ? 'is' : 'are'} sold out: they can be removed but not added or bought.
              </p>
            )}

            <ul className="mt-6 grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-4 sm:gap-y-10 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {saved.map((product, index) => (
                <li key={product.id} className="min-w-0">
                  <ProductCard
                    product={product}
                    index={index}
                    saved
                    onToggleSaved={(p) => remove([p])}
                    onAddToCart={(p) => start('cart', [p])}
                    onBuy={(p) => start('buy', [p])}
                    selection={{ selected: selected.includes(product.id), onChange: (on) => toggle(product.id, on) }}
                  />
                </li>
              ))}
            </ul>
          </>
        )}

        {flow && sheetProduct && (
          <SpecSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            product={sheetProduct}
            action={flow.action}
            inCart={cart.qtyOfVariant}
            onConfirm={confirmChoice}
            guest={!user}
            step={step}
          />
        )}
      </div>
    </MotionConfig>
  )
}

/** Nothing saved: greets by first name and points at the category already in their cart, else the newest pieces. */
function EmptyWishlist({ name }: { name?: string }) {
  const cart = useCart()
  const first = name?.trim().split(/\s+/)[0]
  const inCart = cart.lines.flatMap((line) => line.category || []).at(-1)
  const target = inCart ? `/shop?${new URLSearchParams({ category: inCart })}` : '/shop?sort=newest'
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-2 py-12 text-center sm:py-16">
      <span aria-hidden="true" className="text-fg-muted">
        <HeartIcon className="size-14" />
      </span>
      <h2 className="display mt-4 text-2xl text-fg">{first ? `Nothing saved yet, ${first}` : 'Nothing saved yet'}</h2>
      <p className="mt-3 text-base leading-relaxed text-fg-muted">
        {inCart
          ? `You have ${inCart} in your cart. See more like it, and tap the heart on anything you love to keep it here.`
          : 'Tap the heart on any piece you love to keep it here, then add it to your cart or buy it when you are ready.'}
      </p>
      <Link to={target} className={`${SHOP_PRIMARY} mt-6 w-full max-w-xs`}>
        {inCart ? <StoreIcon /> : <SparkleIcon />}
        {inCart ? `Browse ${inCart}` : 'Shop new arrivals'}
      </Link>
      {inCart && (
        <Link to="/shop" className={`${SHOP_SECONDARY} mt-2 w-full max-w-xs`}>
          Browse all pieces
        </Link>
      )}
    </div>
  )
}
