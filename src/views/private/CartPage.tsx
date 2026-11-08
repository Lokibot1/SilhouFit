import { AnimatePresence, MotionConfig, animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BagIcon, CartIcon, CheckIcon, ChevronDownIcon, FilterIcon, MinusIcon, PaletteIcon, PlusIcon, RulerIcon, StoreIcon, TrashIcon, UserIcon } from '../../components/form/icons'
import { ConfirmDialog } from '../../components/admin/users/ConfirmDialog'
import { ShopHeader } from '../../components/shop/ShopHeader'
import { CartListSkeleton } from '../../components/shop/ShopSkeleton'
import { KRAL_CHIP, KRAL_DANGER, KRAL_PRIMARY, KRAL_SECONDARY } from '../../components/shop/shopControls'
import { KRAL_LEGEND, KRAL_OPTION } from '../../components/shop/SpecSheet'
import { useToast } from '../../components/toast/useToast'
import { Checkbox } from '../../components/ui/Checkbox'
import { Modal } from '../../components/ui/Modal'
import { PhotoImg } from '../../components/ui/PhotoImg'
import { RowMenu } from '../../components/ui/RowMenu'
import { choiceOf, sizesFor, type Product } from '../../data/products'
import { lineKey, useCart, type Line } from '../../hooks/useCart'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { loadProduct } from '../../hooks/useProducts'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { formatPeso, variantLabel } from '../../utils/format'

const DESCRIPTION =
  'Your SilhouFit cart: review the pieces you added, change quantities, remove what you do not want, then check out the ones you pick.'

type Row = { line: Line; problem: string | null }

/** Why a line cannot be bought, or null when it can. */
function problemWith(line: Line) {
  if (!line.active) return 'No longer available'
  if (line.stock === 0) return 'Sold out'
  return null
}

/** What a line can be bought for: its quantity, lowered to the variant's stock. */
const buyableQty = (line: Line) => Math.min(line.qty, line.stock)

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
          className="absolute inset-y-0 right-0 flex items-center justify-end overflow-hidden bg-kral-red text-kral-paper"
        >
          <span className="font-kral-mono flex items-center gap-2 px-4 text-base font-medium whitespace-nowrap uppercase">
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

  const cart = useCart()
  const user = useCurrentUser()
  const navigate = useNavigate()
  const toast = useToast()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearPending, setClearPending] = useState(false)
  const [leaving, setLeaving] = useState<Leaving>('slide')
  // The row being edited is kept after the drawer closes so its content stays put while it slides out.
  const [editing, setEditing] = useState<{ row: Row; product: Product; id: number } | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  const ready = cart.status === 'ready'
  const rows: Row[] = ready ? cart.lines.map((line) => ({ line, problem: problemWith(line) })) : []
  // Only keys still in the cart count as selected, so a line removed elsewhere drops out by itself.
  const chosen = rows.filter((row) => selected.includes(lineKey(row.line)))
  const buyableLines = chosen.filter((row) => !row.problem).map((row) => row.line)
  // The same quantities the checkout takes: lowered to the variant's stock.
  const count = buyableLines.reduce((sum, line) => sum + buyableQty(line), 0)
  const total = buyableLines.reduce((sum, line) => sum + line.unitPrice * buyableQty(line), 0)
  const allSelected = rows.length > 0 && chosen.length === rows.length

  function removeOne(row: Row, how: Leaving = 'slide') {
    setLeaving(how)
    const key = lineKey(row.line)
    const { line } = row
    void cart.removeLines([key])
    setSelected((current) => current.filter((k) => k !== key))
    // The row disappears, so keep focus on the heading.
    headingRef.current?.focus()
    toast.show({
      kind: 'info',
      message: `Removed ${line.name} from cart`,
      // Only a line that could be bought gets an Undo; a broken one is simply cleared.
      action: row.problem
        ? undefined
        : {
            label: 'Undo',
            // Back through the stock check, in case the cart changed in the meantime.
            onClick: () =>
              loadProduct(line.productId)
                .then((product) => cart.add({ product, variantId: line.variantId, qty: line.qty }))
                .catch(() =>
                  toast.show({ kind: 'error', message: `Couldn't put ${line.name} back. The request failed, most likely because the connection dropped. Add it again from the shop.` }),
                ),
          },
    })
  }

  function removeChosen() {
    setLeaving('slide')
    const keys = chosen.map((row) => lineKey(row.line))
    void cart.removeLines(keys)
    setSelected([])
    setConfirming(false)
    headingRef.current?.focus()
    toast.show({
      kind: 'info',
      message: `Removed ${plural(keys.length)} from cart`,
    })
  }

  /** Back through the stock check, one line at a time. A piece that sold out or went away is named, not silently dropped. */
  async function putBack(lines: Line[]) {
    const missed: string[] = []
    let failed = 0
    for (const line of lines) {
      const outcome = await loadProduct(line.productId).then(
        (product) => cart.add({ product, variantId: line.variantId, qty: line.qty }),
        () => 'limit' as const,
      )
      if (outcome === 'limit') missed.push(line.name)
      else if (outcome === 'failed') failed++ // the cart has already said why
    }
    if (missed.length > 0) {
      const restored = lines.length - missed.length - failed
      toast.show({ kind: 'info', message: `Put back ${restored} of ${plural(lines.length)}. ${missed.join(', ')} ${missed.length === 1 ? 'is' : 'are'} out of stock or no longer available.` })
    } else if (failed === 0) toast.show({ kind: 'success', message: 'Put your cart back' })
  }

  async function clearAll() {
    setLeaving('slide')
    setClearPending(true)
    const cleared = await cart.clearLines()
    setClearPending(false)
    setClearing(false)
    if (!cleared) return // the cart has already said why, and shows what it still holds
    setSelected([])
    headingRef.current?.focus()
    toast.show({ kind: 'info', message: 'Cleared your cart', action: { label: 'Undo', onClick: () => void putBack(cleared) } })
  }

  async function changeVariant(row: Row, size: string, color: string) {
    setLeaving('instant')
    const key = lineKey(row.line)
    const nextKey = await cart.changeVariant(key, size, color)
    if (nextKey === key) {
      setEditOpen(false)
      return
    }
    // The line's key changed, so a ticked line stays ticked under its new key.
    setSelected((current) => {
      const rest = current.filter((k) => k !== key)
      return current.includes(key) && !rest.includes(nextKey) ? [...rest, nextKey] : rest
    })
    setEditOpen(false)
    headingRef.current?.focus()
    toast.show({
      kind: 'success',
      message: `Updated ${row.line.name} to ${variantLabel(size, color).toLowerCase()}`,
    })
  }

  // The editor needs the piece's sizes and colours, which its detail has.
  function openEditor(row: Row) {
    loadProduct(row.line.productId).then(
      (product) => {
        setEditing((current) => ({ row, product, id: (current?.id ?? 0) + 1 }))
        setEditOpen(true)
      },
      () =>
        toast.show({
          kind: 'error',
          message: `Couldn't load ${row.line.name}. Check your connection, then try again.`,
          action: { label: 'Try again', onClick: () => openEditor(row) },
        }),
    )
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
      <ShopHeader tone="kral" ref={headingRef} title="Your cart" icon={<CartIcon className="size-[1.1em]" />} crumb="Cart" backToShop />

      <div className="mx-auto max-w-6xl px-6 pb-24 max-sm:pb-36 2xl:max-w-[88rem]">
        {ready && cart.lines.length === 0 && <EmptyCart signedIn={!!user} />}

        {cart.status === 'loading' && <CartListSkeleton count={Math.min(cart.count || 1, 4)} />}

        {cart.status === 'error' && (
          <div role="alert" className="border border-kral-rule p-6 sm:p-8">
            <h2 className="font-kral-display text-xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-2xl">Your cart did not load</h2>
            <p className="font-kral-mono mt-3 max-w-xl text-base leading-relaxed text-kral-muted">
              The request for stock and prices failed, most likely because the connection dropped or the service is briefly unavailable. The
              pieces in your cart are kept. Check your connection, then try again.
            </p>
            <button type="button" onClick={cart.retry} className={`${KRAL_PRIMARY} mt-6 w-fit`}>
              Try again
            </button>
          </div>
        )}

        {ready && (
          <>
            {unbuyable > 0 && (
              <p className="font-kral-mono mt-2 text-base text-kral-muted md:text-sm">
                {unbuyable} selected {unbuyable === 1 ? 'piece cannot' : 'pieces cannot'} be bought: {unbuyable === 1 ? 'it' : 'they'} can
                be removed and {unbuyable === 1 ? 'is' : 'are'} left out of the total.
              </p>
            )}

            {cart.lines.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-kral-rule pb-3">
                <Checkbox
                  tone="kral"
                  checked={allSelected}
                  onChange={(on) => setSelected(on ? rows.map((row) => lineKey(row.line)) : [])}
                  label="Select all items"
                  className="font-kral-mono justify-start text-base font-medium uppercase md:text-xs md:tracking-[0.08em]"
                >
                  Select all items
                </Checkbox>
                <p aria-live="polite" className="font-kral-mono text-base text-kral-muted tabular-nums md:text-xs md:tracking-[0.08em]">
                  {chosen.length} selected
                </p>
                <button
                  type="button"
                  disabled={chosen.length === 0}
                  onClick={() => setConfirming(true)}
                  className={`${KRAL_SECONDARY} ml-auto`}
                >
                  <TrashIcon />
                  Remove selected
                </button>
                {user && (
                  <button type="button" onClick={() => setClearing(true)} className={KRAL_SECONDARY}>
                    Clear cart
                  </button>
                )}
              </div>
            )}

            <ul className="divide-y divide-kral-rule">
              <AnimatePresence initial={false} custom={leaving}>
                {rows.map((row) => {
                  const { line, problem } = row
                  const key = lineKey(line)
                  const name = line.name
                  const picker = (
                    <Checkbox
                      tone="kral"
                      checked={selected.includes(key)}
                      onChange={(on) => toggle(key, on)}
                      label={`Select ${name}`}
                      className="-ml-2.5 shrink-0 self-center sm:ml-0"
                    />
                  )
                  if (problem) {
                    return (
                      <motion.li key={key} variants={ROW_VARIANTS} exit="exit" className={`-mx-3 px-3 py-5 ${selected.includes(key) ? 'bg-kral-fg/10' : ''}`}>
                        <SwipeRow onRemove={() => removeOne(row, 'collapse')}>
                        {picker}
                        <div className="min-w-0 flex-1 border border-kral-rule p-3">
                          <div className="flex items-start justify-between gap-3">
                            <p className="font-kral-display min-w-0 text-sm leading-tight font-extrabold [overflow-wrap:anywhere] text-kral-fg uppercase sm:text-base">{line.name}</p>
                            <div className="max-sm:sr-only max-sm:focus-within:not-sr-only">
                              <RowMenu tone="kral" label={`More actions for ${name}`} actionLabel="Remove" onAction={() => removeOne(row)} />
                            </div>
                          </div>
                          <p className="font-kral-mono mt-1 text-base font-medium text-danger md:text-sm">{problem}</p>
                          <p className="font-kral-mono mt-1 text-base text-kral-muted md:text-sm">It is left out of the total and the count.</p>
                          {line.active && (
                            <button type="button" onClick={() => openEditor(row)} className={`${KRAL_SECONDARY} mt-2 max-w-full whitespace-normal! text-center`}>
                              Choose size and colour
                            </button>
                          )}
                        </div>
                        </SwipeRow>
                      </motion.li>
                    )
                  }
                  const unit = line.unitPrice
                  const qty = buyableQty(line)
                  return (
                    <motion.li key={key} variants={ROW_VARIANTS} exit="exit" className={`-mx-3 px-3 py-5 ${selected.includes(key) ? 'bg-kral-fg/10' : ''}`}>
                      <SwipeRow onRemove={() => removeOne(row, 'collapse')}>
                      {picker}
                      <PhotoImg
                        tone="kral"
                        src={line.image}
                        alt={line.name}
                        className="photo-mono h-20 w-16 shrink-0 object-cover sm:h-24 sm:w-18"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <h2 className="font-kral-display min-w-0 text-sm leading-snug font-extrabold [overflow-wrap:anywhere] text-kral-fg uppercase sm:text-base">{line.name}</h2>
                          <div className="max-sm:sr-only max-sm:focus-within:not-sr-only">
                            <RowMenu tone="kral" label={`More actions for ${line.name}`} actionLabel="Remove" onAction={() => removeOne(row)} />
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label={`Change variation of ${line.name}, currently ${variantLabel(line.size, line.color)}`}
                          onClick={() => openEditor(row)}
                          className={`${KRAL_CHIP} mt-1 h-auto w-fit max-w-full py-2 text-left whitespace-normal!`}
                        >
                          <span className="min-w-0 [overflow-wrap:anywhere]">
                            {variantLabel(line.size, line.color)}
                          </span>
                          <ChevronDownIcon size={16} className="shrink-0" />
                        </button>
                        <p className="font-kral-mono mt-0.5 text-base text-kral-muted tabular-nums md:text-sm">{formatPeso(unit)} each</p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <div role="group" aria-label={`Quantity of ${line.name}`} className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-label={`Decrease quantity of ${line.name}`}
                              disabled={qty <= 1}
                              onClick={() => cart.setQty(key, qty - 1)}
                              className={`${KRAL_SECONDARY} size-11 px-0`}
                            >
                              <MinusIcon />
                            </button>
                            <output aria-live="polite" className="font-kral-mono min-w-6 text-center text-base font-medium text-kral-fg tabular-nums">
                              {qty}
                            </output>
                            <button
                              type="button"
                              aria-label={`Increase quantity of ${line.name}`}
                              disabled={qty >= line.stock}
                              onClick={() => cart.setQty(key, qty + 1)}
                              className={`${KRAL_SECONDARY} size-11 px-0`}
                            >
                              <PlusIcon />
                            </button>
                          </div>
                          <p className="font-kral-mono text-right text-base font-medium text-kral-fg tabular-nums">
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
                <div className="fixed inset-x-0 bottom-0 z-30 border-t border-kral-rule bg-kral-bg/90 px-6 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:sticky sm:inset-x-auto sm:z-10 sm:-mx-6 sm:mt-4 sm:pb-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap">
                    <div className="flex w-full items-center justify-between gap-3 sm:ml-auto sm:w-auto">
                      <p className="font-kral-mono text-right tabular-nums">
                        <span className="text-base text-kral-muted md:text-sm">Total ({plural(count)}) </span>
                        <span className="text-xl font-medium text-kral-fg">{formatPeso(total)}</span>
                      </p>
                      <button type="button" onClick={checkout} disabled={count === 0} className={`${KRAL_PRIMARY} shrink-0`}>
                        <CartIcon />
                        Checkout
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {editing && (
          <VariationModal
            key={editing.id}
            open={editOpen}
            product={editing.product}
            line={editing.row.line}
            onClose={() => setEditOpen(false)}
            onSave={(size, color) => changeVariant(editing.row, size, color)}
          />
        )}

        <ConfirmDialog tone="kral" open={clearing} title="Clear your cart?" confirmLabel="Clear cart" pending={clearPending} onConfirm={() => void clearAll()} onClose={() => setClearing(false)}>
          Every piece in your cart is removed, including any that are sold out or no longer in the shop. You can undo this right after.
        </ConfirmDialog>

        <Modal open={confirming} onClose={() => setConfirming(false)} title="Are you sure?" tone="kral">
          <p className="font-kral-mono pb-5 text-base leading-relaxed text-kral-muted">
            {chosen.length === 1
              ? 'This removes the selected piece from your cart.'
              : `This removes the ${chosen.length} selected pieces from your cart.`}
          </p>
          <div className="flex flex-col-reverse gap-2 pb-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setConfirming(false)} className={KRAL_PRIMARY}>
              Cancel
            </button>
            <button type="button" onClick={removeChosen} className={KRAL_DANGER}>
              <TrashIcon />
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
  const changed = size !== (line.size ?? '') || color !== (line.color ?? '')
  // The size and colour have to come to a variant that is in stock.
  const { stock } = choiceOf(product, size, color)
  const unavailable = !!size && !!color && stock === 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change variation"
      icon={<FilterIcon />}
      variant="sheet-left"
      tone="kral"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={KRAL_SECONDARY}>
            Cancel
          </button>
          <button type="button" disabled={!size || !color || !changed || unavailable} onClick={() => onSave(size, color)} className={KRAL_PRIMARY}>
            <CheckIcon />
            Update variation
          </button>
        </div>
      }
    >
      <div className="mb-5 flex gap-4 border border-kral-rule p-3">
        <PhotoImg tone="kral" src={product.image} alt={product.alt} className="photo-mono h-32 w-24 shrink-0 object-cover" />
        <div className="min-w-0 flex-1">
          <p className="font-kral-mono truncate text-xs tracking-[0.08em] text-kral-muted uppercase">
            {product.category} · {product.boutique}
          </p>
          <h3 className="font-kral-display mt-1 text-lg leading-tight font-extrabold [overflow-wrap:anywhere] text-kral-fg uppercase">{product.name}</h3>
          <p className="font-kral-mono mt-2 flex flex-wrap gap-x-2 text-base font-medium text-kral-fg tabular-nums">
            {product.salePrice !== undefined && (
              <>
                <span className="sr-only">Original price </span>
                <s className="font-normal text-kral-muted">{formatPeso(product.price)}</s>
                <span className="sr-only">Sale price </span>
              </>
            )}
            <span>{formatPeso(product.salePrice ?? product.price)}</span>
          </p>
          <p className="font-kral-mono mt-1 text-base text-kral-muted tabular-nums md:text-sm">
            Quantity {line.qty}
            {(line.size || line.color) && <> · Now {variantLabel(line.size, line.color)}</>}
          </p>
        </div>
      </div>
      {unavailable && <p className="font-kral-mono pb-5 text-base text-danger md:text-sm">That size and colour is not available. Choose another.</p>}
      <fieldset className="pb-5">
        <legend className={KRAL_LEGEND}>
          <PaletteIcon size={16} className="mr-2 -mt-0.5 inline align-middle" />
          Colour
          <span className="font-normal text-kral-muted">{color ? `: ${color}` : ' (required)'}</span>
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
              <span data-checked={color === c.name} className={KRAL_OPTION}>
                <span aria-hidden="true" className="size-3 border border-kral-muted" style={{ backgroundColor: c.hex }} />
                {c.name}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="pb-5">
        <legend className={KRAL_LEGEND}>
          <RulerIcon size={16} className="mr-2 -mt-0.5 inline align-middle" />
          Size
          <span className="font-normal text-kral-muted">{size ? `: ${size}` : ' (required)'}</span>
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
              <span data-checked={size === s} className={`${KRAL_OPTION} min-w-11 tabular-nums`}>
                {s}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </Modal>
  )
}

/** No lines in the cart. */
function EmptyCart({ signedIn }: { signedIn: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.state, ease: EASE_OUT, delay: 0.15 }}
      className="mx-auto flex max-w-xl flex-col items-center px-2 py-12 text-center sm:py-16"
    >
      <span aria-hidden="true" className="text-kral-muted">
        <BagIcon className="size-14" />
      </span>
      <h2 className="font-kral-display mt-4 text-xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-2xl">Your cart is currently empty</h2>
      <p className="font-kral-mono mt-3 text-base leading-relaxed text-kral-muted">
        {signedIn ? 'Add items to place an order.' : 'Log in to add items and place an order.'}
      </p>
      <Link to="/shop" className={`${KRAL_PRIMARY} mt-6 w-full max-w-xs`}>
        <StoreIcon />
        Shop now
      </Link>
      {!signedIn && (
        <Link to="/login?next=%2Fcart" className={`${KRAL_SECONDARY} mt-2 w-full max-w-xs`}>
          <UserIcon />
          Log in
        </Link>
      )}
    </motion.div>
  )
}
