import { AnimatePresence, MotionConfig, animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BagIcon, CartIcon, ChevronDownIcon, FilterIcon, PaletteIcon, RulerIcon, StoreIcon, TrashIcon, UserIcon } from '../../components/form/icons'
import { ShopHeader } from '../../components/shop/ShopHeader'
import { CartListSkeleton } from '../../components/shop/ShopSkeleton'
import { SHOP_PRIMARY, SHOP_SECONDARY } from '../../components/shop/shopControls'
import { OPTION_BASE } from '../../components/shop/SpecSheet'
import { useToast } from '../../components/toast/useToast'
import { PRIMARY_BUTTON } from '../../components/ui/buttonStyles'
import { Checkbox } from '../../components/ui/Checkbox'
import { Modal } from '../../components/ui/Modal'
import { RowMenu } from '../../components/ui/RowMenu'
import { sizesFor, type Product } from '../../data/products'
import { lineKey, useCart, type Line } from '../../hooks/useCart'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useProducts } from '../../hooks/useProducts'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { resolveCartItems } from '../../utils/checkout'
import { formatPeso } from '../../utils/format'

const DESCRIPTION =
  'Your SilhouFit cart: review the pieces you added, change quantities, remove what you do not want, then check out the ones you pick.'

type Row = { line: Line; product: Product | undefined; problem: string | null }

/** Why a line cannot be bought, or null when it can. */
function problemWith(line: Line, product: Product | undefined) {
  if (!product) return 'No longer in the catalogue'
  if (product.stock === 0) return 'Sold out'
  if (!line.size || !line.color || !sizesFor(product).includes(line.size) || !product.colors.some((c) => c.name === line.color)) {
    return 'Size and colour were not chosen. Choose them to buy it, or remove it.'
  }
  return null
}

// A removed row slides away, then the gap closes. Motion's reduced-motion setting drops the slide and keeps the fade.
// A swiped row is already off screen, so it only closes the gap. A row that only changed variation gets a new key,
// so its old self leaves at once instead of sliding.
type Leaving = 'slide' | 'collapse' | 'instant'
const ROW_VARIANTS = {
  exit: (leaving: Leaving) => ({
    opacity: 0,
    x: leaving === 'slide' ? 80 : 0,
    height: 0,
    paddingTop: 0,
    paddingBottom: 0,
    overflow: 'hidden',
    transition:
      leaving === 'instant' ? { duration: 0 } : { duration: leaving === 'slide' ? DURATION.shift : DURATION.state, ease: EASE_OUT },
  }),
}

/** How far a row must be dragged, as a share of its width, for letting go to remove it. */
const SWIPE_REMOVE_AT = 0.5

/**
 * Below sm a row can be dragged right to left: a red Remove panel grows from the edge, and letting go past halfway
 * removes the line. From sm up the row does not move (the kebab menu is shown there).
 */
function SwipeRow({ onRemove, children }: { onRemove: () => void; children: ReactNode }) {
  const wide = useMediaQuery('(min-width: 640px)')
  const rowRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const reveal = useTransform(x, (v) => Math.max(0, -v))

  function release() {
    const width = rowRef.current?.offsetWidth ?? 320
    if (x.get() < -width * SWIPE_REMOVE_AT) {
      animate(x, -width, { duration: DURATION.state, ease: EASE_OUT }).then(onRemove)
    } else {
      animate(x, 0, { duration: DURATION.state, ease: EASE_OUT })
    }
  }

  return (
    <div className="relative">
      {!wide && (
        <motion.div
          aria-hidden="true"
          style={{ width: reveal }}
          className="absolute inset-y-0 right-0 flex items-center justify-end overflow-hidden rounded-xl bg-danger text-white"
        >
          <span className="font-ui flex items-center gap-2 px-4 text-sm font-semibold whitespace-nowrap">
            <TrashIcon />
            Remove
          </span>
        </motion.div>
      )}
      <motion.div
        ref={rowRef}
        drag={wide ? false : 'x'}
        dragConstraints={{ left: -640, right: 0 }}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={release}
        style={{ x }}
        className="relative flex gap-2 sm:gap-3"
      >
        {children}
      </motion.div>
    </div>
  )
}

const plural = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`

export function CartPage() {
  useDocumentTitle('Your cart — SilhouFit')
  useMetaDescription(DESCRIPTION)

  const products = useProducts()
  const cart = useCart()
  const user = useCurrentUser()
  const navigate = useNavigate()
  const toast = useToast()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  const [leaving, setLeaving] = useState<Leaving>('slide')
  // The row being edited is kept after the drawer closes so its content stays put while it slides out.
  const [editing, setEditing] = useState<{ row: Row; id: number } | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  const catalogue = products.status === 'success' ? products.data.products : null
  const rows: Row[] = catalogue
    ? cart.lines.map((line) => {
        const product = catalogue.find((p) => p.id === line.id)
        return { line, product, problem: problemWith(line, product) }
      })
    : []
  // Only keys still in the cart count as selected, so a line removed elsewhere drops out by itself.
  const chosen = rows.filter((row) => selected.includes(lineKey(row.line)))
  const buyableLines = chosen.filter((row) => !row.problem).map((row) => row.line)
  // The count and total use the same resolution as the navbar badge and the checkout, so all three agree.
  const bought = catalogue ? resolveCartItems(buyableLines, catalogue).items : []
  const count = bought.reduce((sum, item) => sum + item.qty, 0)
  const total = bought.reduce((sum, item) => sum + (item.product.salePrice ?? item.product.price) * item.qty, 0)
  const allSelected = rows.length > 0 && chosen.length === rows.length

  function removeOne(row: Row, how: Leaving = 'slide') {
    setLeaving(how)
    const key = lineKey(row.line)
    const { line, product } = row
    cart.removeLines([key])
    setSelected((current) => current.filter((k) => k !== key))
    // The row disappears, so keep focus on the heading.
    headingRef.current?.focus()
    toast.show({
      kind: 'info',
      message: `Removed ${product?.name ?? 'a piece'} from cart`,
      // Only a line that could be bought gets an Undo; a broken one is simply cleared.
      action:
        row.problem || !product
          ? undefined
          : {
              label: 'Undo',
              // Back through the stock check, in case the cart changed in the meantime.
              onClick: () =>
                cart.add({
                  product,
                  size: line.size,
                  color: line.color,
                  qty: line.qty,
                }),
            },
    })
  }

  function removeChosen() {
    setLeaving('slide')
    const keys = chosen.map((row) => lineKey(row.line))
    cart.removeLines(keys)
    setSelected([])
    setConfirming(false)
    headingRef.current?.focus()
    toast.show({
      kind: 'info',
      message: `Removed ${plural(keys.length)} from cart`,
    })
  }

  function changeVariant(row: Row, size: string, color: string) {
    setLeaving('instant')
    const key = lineKey(row.line)
    const nextKey = cart.changeVariant(key, size, color)
    // The line's key changed, so a ticked line stays ticked under its new key.
    setSelected((current) => {
      const rest = current.filter((k) => k !== key)
      return current.includes(key) && !rest.includes(nextKey) ? [...rest, nextKey] : rest
    })
    setEditOpen(false)
    headingRef.current?.focus()
    toast.show({
      kind: 'success',
      message: `Updated ${row.product?.name ?? 'piece'} to size ${size}, ${color}`,
    })
  }

  function openEditor(row: Row) {
    setEditing((current) => ({ row, id: (current?.id ?? 0) + 1 }))
    setEditOpen(true)
  }

  function toggle(key: string, on: boolean) {
    setSelected((current) => (on ? [...current, key] : current.filter((k) => k !== key)))
  }

  function checkout() {
    const query = new URLSearchParams({ source: 'cart' })
    for (const line of buyableLines) query.append('line', lineKey(line))
    navigate(`/checkout?${query}`)
  }

  const unbuyable = chosen.length - buyableLines.length

  return (
    <MotionConfig reducedMotion="user">
      <ShopHeader ref={headingRef} title="Your cart" icon={<CartIcon className="size-[1.1em]" />} crumb="Cart" backToShop />

      <div className="mx-auto max-w-6xl px-6 pb-24 max-sm:pb-36 2xl:max-w-[88rem]">
        {cart.lines.length === 0 && <EmptyCart signedIn={!!user} />}

        {cart.lines.length > 0 && products.status === 'loading' && <CartListSkeleton count={Math.min(cart.lines.length, 4)} />}

        {cart.lines.length > 0 && products.status === 'error' && (
          <div role="alert" className="glass-card rounded-2xl p-6 sm:p-8">
            <h2 className="display text-2xl text-fg">Your cart did not load</h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-fg-muted">
              The request for stock and prices failed, most likely because the connection dropped or the service is briefly unavailable. The
              pieces in your cart are kept. Check your connection, then try again.
            </p>
            <button type="button" onClick={products.retry} className={`${PRIMARY_BUTTON} mt-6`}>
              Try again
            </button>
          </div>
        )}

        {catalogue && (
          <>
            {unbuyable > 0 && (
              <p className="mt-2 text-sm text-fg-muted">
                {unbuyable} selected {unbuyable === 1 ? 'piece cannot' : 'pieces cannot'} be bought: {unbuyable === 1 ? 'it' : 'they'} can
                be removed and {unbuyable === 1 ? 'is' : 'are'} left out of the total.
              </p>
            )}

            {cart.lines.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line pb-3">
                <Checkbox
                  checked={allSelected}
                  onChange={(on) => setSelected(on ? rows.map((row) => lineKey(row.line)) : [])}
                  label="Select all items"
                  className="justify-start font-ui text-sm font-medium"
                >
                  Select all items
                </Checkbox>
                <p aria-live="polite" className="font-ui text-sm text-fg-muted tabular-nums">
                  {chosen.length} selected
                </p>
                <button
                  type="button"
                  disabled={chosen.length === 0}
                  onClick={() => setConfirming(true)}
                  className={`${SHOP_SECONDARY} ml-auto`}
                >
                  <TrashIcon />
                  Remove selected
                </button>
              </div>
            )}

            <ul className="divide-y divide-line">
              <AnimatePresence initial={false} custom={leaving}>
                {rows.map((row) => {
                  const { line, product, problem } = row
                  const key = lineKey(line)
                  const name = product?.name ?? 'this piece'
                  const picker = (
                    <Checkbox
                      checked={selected.includes(key)}
                      onChange={(on) => toggle(key, on)}
                      label={`Select ${name}`}
                      className="-ml-2.5 shrink-0 self-center sm:ml-0"
                    />
                  )
                  if (problem || !product) {
                    return (
                      <motion.li key={key} variants={ROW_VARIANTS} exit="exit" className="py-5">
                        <SwipeRow onRemove={() => removeOne(row, 'collapse')}>
                        {picker}
                        <div className="min-w-0 flex-1 rounded-xl border border-line-strong p-3">
                          <div className="flex items-start justify-between gap-3">
                            <p className="min-w-0 text-base font-semibold break-words text-fg">{product?.name ?? 'A piece in your cart'}</p>
                            <div className="max-sm:sr-only max-sm:focus-within:not-sr-only">
                              <RowMenu label={`More actions for ${name}`} actionLabel="Remove" onAction={() => removeOne(row)} />
                            </div>
                          </div>
                          <p className="mt-1 text-sm text-danger">{problem}</p>
                          <p className="mt-1 text-sm text-fg-muted">It is left out of the total and the count.</p>
                          {product && product.stock > 0 && (
                            <button type="button" onClick={() => openEditor(row)} className={`${SHOP_SECONDARY} mt-2`}>
                              Choose size and colour
                            </button>
                          )}
                        </div>
                        </SwipeRow>
                      </motion.li>
                    )
                  }
                  const unit = product.salePrice ?? product.price
                  const room = product.stock - (cart.qtyOfProduct(product.id) - line.qty)
                  const qty = Math.min(line.qty, product.stock)
                  return (
                    <motion.li key={key} variants={ROW_VARIANTS} exit="exit" className="py-5">
                      <SwipeRow onRemove={() => removeOne(row, 'collapse')}>
                      {picker}
                      <img
                        src={product.image}
                        alt={product.alt}
                        className="photo-mono h-20 w-16 shrink-0 sm:h-24 sm:w-18 rounded-xl border border-line object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <h2 className="min-w-0 text-base leading-snug font-semibold break-words text-fg">{product.name}</h2>
                          <div className="max-sm:sr-only max-sm:focus-within:not-sr-only">
                            <RowMenu label={`More actions for ${product.name}`} actionLabel="Remove" onAction={() => removeOne(row)} />
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label={`Change variation of ${product.name}, currently size ${line.size}, ${line.color}`}
                          onClick={() => openEditor(row)}
                          className="font-ui mt-1 inline-flex min-h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2 text-sm text-fg-muted hover:text-fg pointer-coarse:min-h-11"
                        >
                          <span className="truncate">
                            Size {line.size} · {line.color}
                          </span>
                          <ChevronDownIcon size={16} className="shrink-0" />
                        </button>
                        <p className="mt-0.5 text-sm text-fg-muted tabular-nums">{formatPeso(unit)} each</p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <div role="group" aria-label={`Quantity of ${product.name}`} className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-label={`Decrease quantity of ${product.name}`}
                              disabled={qty <= 1}
                              onClick={() => cart.setQty(key, qty - 1)}
                              className={`${SHOP_SECONDARY} size-9 pointer-coarse:size-11 px-0`}
                            >
                              −
                            </button>
                            <output aria-live="polite" className="font-ui min-w-6 text-center text-base font-semibold text-fg tabular-nums">
                              {qty}
                            </output>
                            <button
                              type="button"
                              aria-label={`Increase quantity of ${product.name}`}
                              disabled={qty >= room}
                              onClick={() => cart.setQty(key, qty + 1)}
                              className={`${SHOP_SECONDARY} size-9 pointer-coarse:size-11 px-0`}
                            >
                              +
                            </button>
                          </div>
                          <p className="text-right text-base font-semibold text-fg tabular-nums">
                            <span className="sr-only">Line total </span>
                            {formatPeso(unit * qty)}
                          </p>
                        </div>
                      </div>
                      </SwipeRow>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>

            {cart.lines.length > 0 && (
              <>
                {/* Fixed to the bottom of the screen on phones; sticky from sm up. Either way the total and Checkout stay in reach. */}
                <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/85 px-6 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:sticky sm:inset-x-auto sm:z-10 sm:-mx-6 sm:mt-4 sm:pb-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap">
                    <div className="flex w-full items-center justify-between gap-3 sm:ml-auto sm:w-auto">
                      <p className="font-ui text-right tabular-nums">
                        <span className="text-sm text-fg-muted">Total ({plural(count)}) </span>
                        <span className="text-xl font-semibold text-fg">{formatPeso(total)}</span>
                      </p>
                      <button type="button" onClick={checkout} disabled={bought.length === 0} className={`${SHOP_PRIMARY} shrink-0`}>
                        <CartIcon />
                        Checkout
                      </button>
                    </div>
                  </div>
                  {!user && bought.length > 0 && (
                    <p className="mt-1 text-sm text-fg-muted sm:text-right">You&apos;ll sign in before you pay.</p>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {editing?.row.product && (
          <VariationModal
            key={editing.id}
            open={editOpen}
            product={editing.row.product}
            line={editing.row.line}
            onClose={() => setEditOpen(false)}
            onSave={(size, color) => changeVariant(editing.row, size, color)}
          />
        )}

        <Modal open={confirming} onClose={() => setConfirming(false)} title="Are you sure?">
          <p className="pb-5 text-base leading-relaxed text-fg-muted">
            {chosen.length === 1
              ? 'This removes the selected piece from your cart.'
              : `This removes the ${chosen.length} selected pieces from your cart.`}
          </p>
          <div className="flex flex-col-reverse gap-2 pb-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setConfirming(false)} className={SHOP_PRIMARY}>
              Cancel
            </button>
            <button type="button" onClick={removeChosen} className={SHOP_SECONDARY}>
              Remove {plural(chosen.length)}
            </button>
          </div>
        </Modal>
      </div>
    </MotionConfig>
  )
}

/** Change a line's size and colour. Quantity is kept; a line already in that size and colour absorbs it. */
function VariationModal({
  open,
  product,
  line,
  onClose,
  onSave,
}: {
  open: boolean
  product: Product
  line: Line
  onClose: () => void
  onSave: (size: string, color: string) => void
}) {
  const [size, setSize] = useState(line.size && sizesFor(product).includes(line.size) ? line.size : '')
  const [color, setColor] = useState(
    line.color && product.colors.some((c) => c.name === line.color)
      ? line.color
      : product.colors.length === 1
        ? product.colors[0].name
        : '',
  )
  const changed = size !== line.size || color !== line.color

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change variation"
      icon={<FilterIcon />}
      variant="sheet-left"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={SHOP_SECONDARY}>
            Cancel
          </button>
          <button type="button" disabled={!size || !color || !changed} onClick={() => onSave(size, color)} className={SHOP_PRIMARY}>
            Update variation
          </button>
        </div>
      }
    >
      <div className="mb-5 flex gap-4 rounded-xl border border-line bg-fg/5 p-3">
        <img src={product.image} alt={product.alt} className="photo-mono h-32 w-24 shrink-0 rounded-xl border border-line object-cover" />
        <div className="min-w-0 flex-1">
          <p className="font-ui truncate text-[11px] tracking-[0.16em] text-fg-muted uppercase">
            {product.category} · {product.boutique}
          </p>
          <h3 className="mt-1 text-lg leading-tight font-semibold break-words text-fg">{product.name}</h3>
          <p className="mt-2 flex flex-wrap gap-x-2 text-base font-semibold text-fg tabular-nums">
            {product.salePrice !== undefined && (
              <>
                <span className="sr-only">Original price </span>
                <s className="font-normal text-fg-muted">{formatPeso(product.price)}</s>
                <span className="sr-only">Sale price </span>
              </>
            )}
            <span>{formatPeso(product.salePrice ?? product.price)}</span>
          </p>
          <p className="mt-1 text-sm text-fg-muted tabular-nums">
            Quantity {line.qty}
            {line.size && line.color && (
              <>
                {' '}
                · Now Size {line.size}, {line.color}
              </>
            )}
          </p>
        </div>
      </div>
      <fieldset className="pb-5">
        <legend className="font-ui text-xs font-semibold tracking-[0.12em] text-fg uppercase">
          <PaletteIcon size={16} className="mr-2 -mt-0.5 inline align-middle" />
          Colour
          <span className="font-normal text-fg-muted">{color ? `: ${color}` : ' (required)'}</span>
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {product.colors.map((c) => (
            <label key={c.name} className="relative">
              <input
                type="radio"
                name="variation-color"
                value={c.name}
                checked={color === c.name}
                onChange={() => setColor(c.name)}
                className="peer sr-only"
              />
              <span data-checked={color === c.name} className={OPTION_BASE}>
                <span aria-hidden="true" className="size-3 rounded-full border border-fg-muted" style={{ backgroundColor: c.hex }} />
                {c.name}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="pb-5">
        <legend className="font-ui text-xs font-semibold tracking-[0.12em] text-fg uppercase">
          <RulerIcon size={16} className="mr-2 -mt-0.5 inline align-middle" />
          Size
          <span className="font-normal text-fg-muted">{size ? `: ${size}` : ' (required)'}</span>
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {sizesFor(product).map((s) => (
            <label key={s} className="relative">
              <input
                type="radio"
                name="variation-size"
                value={s}
                checked={size === s}
                onChange={() => setSize(s)}
                className="peer sr-only"
              />
              <span data-checked={size === s} className={`${OPTION_BASE} min-w-8 pointer-coarse:min-w-11 tabular-nums`}>
                {s}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </Modal>
  )
}

/** No lines in the cart. It needs no catalogue, so it shows whatever the products request is doing. */
function EmptyCart({ signedIn }: { signedIn: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.state, ease: EASE_OUT, delay: 0.15 }}
      className="mx-auto flex max-w-xl flex-col items-center px-2 py-12 text-center sm:py-16"
    >
      <span aria-hidden="true" className="text-fg-muted">
        <BagIcon className="size-14" />
      </span>
      <h2 className="display mt-4 text-2xl text-fg">Your cart is currently empty</h2>
      <p className="mt-3 text-base leading-relaxed text-fg-muted">
        {signedIn ? 'Add items to place an order.' : 'Add items to place an order or log in to retrieve your cart.'}
      </p>
      <Link to="/shop" className={`${SHOP_PRIMARY} mt-6 w-full max-w-xs`}>
        <StoreIcon />
        Shop now
      </Link>
      {!signedIn && (
        <Link to="/login?next=%2Fcart" className={`${SHOP_SECONDARY} mt-2 w-full max-w-xs`}>
          <UserIcon />
          Log in
        </Link>
      )}
    </motion.div>
  )
}
