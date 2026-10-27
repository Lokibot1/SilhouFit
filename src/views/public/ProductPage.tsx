import { MotionConfig } from 'motion/react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ProductGallery } from '../../components/shop/ProductGallery'
import { ProductPurchasePanel } from '../../components/shop/ProductPurchasePanel'
import { PRODUCT_BODY, PRODUCT_GRID, PRODUCT_SCREEN, ProductSkeleton } from '../../components/shop/ProductSkeleton'
import { ShopHeader } from '../../components/shop/ShopHeader'
import type { Choice } from '../../components/shop/SpecSheet'
import { useToast } from '../../components/toast/useToast'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/ui/buttonStyles'
import { choiceOf, type Product } from '../../data/products'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useProduct } from '../../hooks/useProducts'
import { useCart } from '../../hooks/useCart'
import { useWishlist } from '../../hooks/useWishlist'
import { formatPeso } from '../../utils/format'
import { playAddToCart } from '../../utils/sound'

const NOT_FOUND_DESCRIPTION =
  'This piece is no longer in the SilhouFit catalogue. Browse the shop to see what is in stock online and in store, and preview how each piece fits with AR.'

// Name, category, brand and price in a sentence of about 150-160 characters; short names get the brand added.
function describe(product: Product) {
  const from = product.boutique ? ` from ${product.boutique}` : ''
  const text = `${product.name}, a ${product.category.toLowerCase()} piece${from} at ${formatPeso(product.price)}. Check the stock, choose your size and colour, and add it to your cart.`
  return text.length < 150 ? text.replace('your cart', 'your SilhouFit cart') : text
}

export function ProductPage() {
  // The route param is the product's slug, or its id from older links.
  const { id } = useParams()
  const products = useProduct(id)
  const wishlist = useWishlist()
  const cart = useCart()
  const navigate = useNavigate()
  const toast = useToast()

  const product = products.status === 'success' ? products.product : undefined
  const missing = products.status === 'missing'

  useDocumentTitle(
    product ? `${product.name} — SilhouFit` : missing ? 'Piece not found — SilhouFit' : 'Loading the piece — SilhouFit',
  )
  useMetaDescription(product ? describe(product) : NOT_FOUND_DESCRIPTION)

  function toggleSaved(item: Product) {
    const wasSaved = wishlist.has(item.id)
    wishlist.toggle(item.id)
    toast.show(
      wasSaved
        ? { kind: 'info', message: 'Removed from wishlist', action: { label: 'Undo', onClick: () => wishlist.toggle(item.id) } }
        : { kind: 'success', message: 'Saved to wishlist' },
    )
  }

  async function add(item: Product, { size, color, qty, variantId }: Choice) {
    const outcome = await cart.add({ product: item, variantId, qty })
    if (outcome === 'failed') return
    if (outcome === 'limit') {
      toast.show({ kind: 'info', message: `All ${choiceOf(item, size, color).stock} in stock of ${item.name} in that size and colour are already in your cart.` })
      return
    }
    playAddToCart()
    toast.show({
      kind: 'success',
      message: `Added to cart: ${[item.name, size, color].filter(Boolean).join(', ')} × ${qty}`,
      action: { label: 'Undo', onClick: () => void cart.remove(variantId, qty) },
    })
  }

  function buy(item: Product, { qty, variantId }: Choice) {
    navigate(`/checkout?${new URLSearchParams({ item: item.id, variant: variantId, qty: String(qty) })}`)
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className={PRODUCT_SCREEN}>
      <ShopHeader
        title={product ? product.name : missing ? 'Piece not found' : 'Loading the piece'}
        crumb={product ? product.name : 'Product'}
        backToShop
        compact
      />

      <div className={PRODUCT_BODY}>
        {products.status === 'loading' && <ProductSkeleton />}

        {products.status === 'error' && (
          <div role="alert" className="glass-card rounded-2xl p-6 sm:p-8">
            <h2 className="display text-2xl text-fg">This piece did not load</h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-fg-muted">
              The request for stock and prices failed, most likely because the connection dropped or the service is
              briefly unavailable. Check your connection, then try again.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={products.retry} className={PRIMARY_BUTTON}>
                Try again
              </button>
              <Link to="/shop" className={SECONDARY_BUTTON}>
                Back to shop
              </Link>
            </div>
          </div>
        )}

        {missing && (
          <div className="glass-card rounded-2xl p-6 sm:p-8">
            <h2 className="display text-2xl text-fg">This piece is no longer in the catalogue</h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-fg-muted">
              It may have sold out for good or the link may be out of date. The shop has the current pieces.
            </p>
            <Link to="/shop" className={`${PRIMARY_BUTTON} mt-6 w-fit`}>
              Browse the shop
            </Link>
          </div>
        )}

        {product && (
          <div className={PRODUCT_GRID}>
            <ProductGallery key={`gallery-${product.id}`} product={product} saved={wishlist.has(product.id)} onToggleSaved={toggleSaved} />
            <ProductPurchasePanel
              key={`panel-${product.id}`}
              product={product}
              inCart={cart.qtyOfVariant}
              onAdd={(choice) => add(product, choice)}
              onBuy={(choice) => buy(product, choice)}
            />
          </div>
        )}
      </div>
      </div>
    </MotionConfig>
  )
}
