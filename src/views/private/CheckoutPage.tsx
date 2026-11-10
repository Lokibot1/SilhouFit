import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AddressForm } from '../../components/address/AddressForm'
import { CheckoutSkeleton } from '../../components/checkout/CheckoutSkeleton'
import { PaymentMethods } from '../../components/checkout/PaymentMethods'
import { PriceSummary } from '../../components/checkout/PriceSummary'
import { CountrySelect } from '../../components/form/CountrySelect'
import { FloatingField } from '../../components/form/FloatingField'
import { AlertIcon, BagIcon, CheckIcon, MapPinIcon, NoteIcon, ReceiptIcon, SpinnerIcon, StoreIcon } from '../../components/form/icons'
import { KRAL_INPUT, KRAL_PRIMARY, KRAL_SECONDARY } from '../../components/shop/shopControls'
import { IconEditButton } from '../../components/ui/IconEditButton'
import { Modal } from '../../components/ui/Modal'
import { SampleDataBadge } from '../../components/ui/SampleDataBadge'
import { PhotoImg } from '../../components/ui/PhotoImg'
import { Select } from '../../components/ui/Select'
import { useToast } from '../../components/toast/useToast'
import { DEFAULT_COUNTRY_CODE, findCountry } from '../../data/countries'
import { lineKey, useCart } from '../../hooks/useCart'
import { useCurrentUser, type CurrentUser } from '../../hooks/useCurrentUser'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useProductsByIds } from '../../hooks/useProducts'
import { useWishlist } from '../../hooks/useWishlist'
import { getDefaultAddress, loadAddresses, onAddressesChanged, type Address } from '../../service/addresses'
import { addCartItem, removeCartItem } from '../../service/cartApi'
import { createCheckoutSession, createOrder, loadAllOrders, OrdersError, usesSampleOrders, type CustomerOrder } from '../../service/ordersApi'
import {
  computeTotals,
  deliveryEta,
  parseCheckoutItems,
  resolveCartItems,
  saveLastOrder,
  type CheckoutItem,
  type Payment,
  type Provider,
} from '../../utils/checkout'
import {
  ADDRESS_FIELD_ORDER,
  ADDRESS_LIMITS,
  cleanPlaceName,
  cleanText,
  filterCity,
  filterFullName,
  filterNote,
  filterPhone,
  filterPostal,
  filterStreet,
  toNationalPhone,
  validateCity,
  validateFullName,
  validatePostal,
  validateStreet,
  type AddressErrors,
  type AddressField,
  type AddressValues,
} from '../../utils/checkoutValidation'
import { formatPeso, variantLabel } from '../../utils/format'
import { adaptOrderToReceipt } from '../../utils/orders'
import { hasProfanity, PROFANITY_ERROR } from '../../utils/profanity'
import { LIMITS, sanitizePhoneDigits, validatePhone } from '../../utils/signUpValidation'

const META_DESCRIPTION =
  'Review your SilhouFit order, pick a saved delivery address and add a note for the seller. Online payment opens soon, so your order is held as awaiting payment.'

const SECTION = 'border border-kral-rule p-5'
const HEADING = 'font-kral-display flex items-center gap-2 text-lg leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-xl'
const MUTED = 'font-kral-mono text-base text-kral-muted'
const KRAL_LINK = 'kral-focus font-kral-mono min-h-11 cursor-pointer text-base font-medium text-kral-fg uppercase underline underline-offset-4 hover:text-kral-red-ink'
const fieldId = (name: AddressField) => `checkout-${name}`

const FILTERS: Record<AddressField, (value: string) => string> = {
  fullName: filterFullName,
  phone: sanitizePhoneDigits,
  street: filterStreet,
  city: filterCity,
  postal: filterPostal,
}
const VALIDATORS: Record<AddressField, (value: string) => string | null> = {
  fullName: validateFullName,
  phone: validatePhone,
  street: validateStreet,
  city: validateCity,
  postal: validatePostal,
}

function Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="font-kral-mono flex items-center gap-2 text-base text-kral-muted uppercase md:text-xs md:tracking-[0.08em]">
        <li>
          <Link to="/" className="tap kral-focus relative hover:text-kral-fg after:absolute after:-inset-x-1.5 after:-inset-y-4 after:content-['']">
            Home
          </Link>
        </li>
        <li aria-hidden="true">//</li>
        <li>
          <Link to="/shop" className="tap kral-focus relative hover:text-kral-fg after:absolute after:-inset-x-1.5 after:-inset-y-4 after:content-['']">
            Shop
          </Link>
        </li>
        <li aria-hidden="true">//</li>
        <li aria-current="page" className="text-kral-fg">
          Checkout
        </li>
      </ol>
    </nav>
  )
}

function ItemRow({ item, change, compact }: { item: CheckoutItem; change: boolean; compact: boolean }) {
  const { product, size, color, qty, unit } = item
  return (
    <li className={`flex min-w-0 gap-4 ${compact ? 'lg:gap-3' : ''}`}>
      <PhotoImg
        tone="kral"
        src={product.image}
        alt={product.alt}
        className={`h-24 w-18 shrink-0 object-cover transition-[width,height] duration-200 ease-out motion-reduce:transition-none ${compact ? 'lg:h-16 lg:w-12' : ''}`}
      />
      <div className="min-w-0 flex-1">
        <p className="font-kral-mono truncate text-xs tracking-[0.08em] text-kral-muted uppercase">
          {product.category} · {product.boutique}
        </p>
        <h3 className={`font-kral-display mt-1 text-sm leading-tight font-extrabold [overflow-wrap:anywhere] text-kral-fg uppercase sm:text-base ${compact ? 'lg:text-sm' : ''}`}>{product.name}</h3>
        <p className={`${MUTED} mt-1 md:text-sm`}>{variantLabel(size, color)}</p>
        {/* Wraps instead of overflowing: a sale piece shows two prices, and quantities make them long. */}
        <div className={`mt-2 ${compact ? 'lg:mt-1' : ''} flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1`}>
          {change ? (
            <IconEditButton tone="kral" to={`/shop?item=${product.id}&action=buy`} label={`Change options for ${product.name}`} hint="Change options" />
          ) : (
            <span />
          )}
          <div className="font-kral-mono ml-auto min-w-0 text-right tabular-nums">
            <p className="text-base text-kral-muted md:text-sm">
              {formatPeso(unit)} × {qty}
            </p>
            <p className="flex flex-wrap justify-end gap-x-2 text-base font-medium text-kral-fg">
              {product.salePrice !== undefined && (
                <>
                  <span className="sr-only">Original price </span>
                  <s className="font-normal text-kral-muted">{formatPeso(product.price * qty)}</s>
                </>
              )}
              <span>{formatPeso(unit * qty)}</span>
            </p>
          </div>
        </div>
      </div>
    </li>
  )
}

/** The five checkout fields a saved address fills. */
function valuesOf(address: Address): AddressValues {
  const barangay = cleanPlaceName(address.barangay)
  const area = /^(barangay|brgy)\b/i.test(barangay) ? barangay : `Barangay ${barangay}`
  const street = [address.streetAddress, address.addressLine2, barangay && area].filter(Boolean).join(', ')
  return {
    fullName: FILTERS.fullName(address.recipientName),
    phone: FILTERS.phone(toNationalPhone(address.phone)),
    street: FILTERS.street(street),
    city: FILTERS.city(cleanPlaceName(address.cityMunicipality)),
    postal: FILTERS.postal(address.postalCode),
  }
}

/** What went wrong with the order, as the panel says it: what happened, why, and the next step. */
function describeFailure(error: OrdersError): { title: string; body: string; again: boolean } {
  const title = "We couldn't place your order"
  switch (error.kind) {
    case 'no-coordinates':
      return { title: 'This address has no map pin', body: `${error.detail ?? 'Pin this address on the map so we can deliver to it.'} Your order was not placed.`, again: false }
    case 'validation':
      return { title, body: error.detail ?? 'Your cart changed. Reload your cart, then check out again.', again: false }
    case 'not-found':
      return { title, body: error.detail ?? 'That address is gone. Pick another delivery address.', again: false }
    case 'forbidden':
      return { title, body: 'Your session ended, so no order was made. Sign in again, then check out.', again: false }
    case 'rate-limit':
      return { title, body: 'Our servers are limiting requests right now, so no order was made. Wait a minute, then try again.', again: true }
    case 'network':
      return { title, body: 'The connection dropped before we got a reply, and no new order shows on your account. Your details are kept: check your connection, then try again.', again: true }
    default:
      return { title, body: 'Something went wrong on our side, so no order was made. Your details are kept: try again in a moment.', again: true }
  }
}

const TWO_MINUTES = 120_000

/**
 * After a dropped connection the order may still have been created. Looks for an unpaid order made in the last two
 * minutes with the same total, so a retry never places a second one.
 */
async function findJustPlaced(total: number): Promise<CustomerOrder | null> {
  try {
    const orders = await loadAllOrders({ force: true })
    return orders.find((o) => o.status === 'PENDING_PAYMENT' && o.total === total && Date.now() - new Date(o.createdAt).getTime() < TWO_MINUTES) ?? null
  } catch {
    return null
  }
}

/** Takes the Buy now lines out of the cart again; a line that is already gone is fine. */
async function dropLines(itemIds: string[]) {
  await Promise.allSettled(itemIds.map((id) => removeCartItem(id)))
}

/**
 * The order API names cart lines, and Buy now has none, so each piece is put in the cart for the moment of the order.
 * A piece already in the cart would be ordered in the wrong amount, so that stops here. Resolves to the new lines' ids.
 */
async function addBuyNowLines(items: CheckoutItem[], inCart: (variantId: string) => number, signal: AbortSignal) {
  const added: string[] = []
  const blocked = () =>
    new OrdersError('validation', "That piece is already in your cart, so we can't order just this one without mixing up the quantities. Open your cart and check out from there.")
  try {
    for (const item of items) {
      if (inCart(item.variantId) > 0) throw blocked()
      const line = (await addCartItem(item.variantId, item.qty, { signal })).items.find((l) => l.variantId === item.variantId)
      if (!line) throw new OrdersError('server')
      added.push(line.id)
      if (line.quantity !== item.qty) throw blocked()
    }
  } catch (failure) {
    await dropLines(added)
    throw failure
  }
  return added
}

interface FailurePanelProps {
  error: OrdersError
  fromCart: boolean
  /** The checkout address, for signing in again and coming back. */
  next: string
  onRetry: () => void
  onPin: () => void
  onPick: () => void
}

function FailurePanel({ error, fromCart, next, onRetry, onPin, onPick }: FailurePanelProps) {
  const { title, body, again } = describeFailure(error)
  return (
    <div role="alert" className="font-kral-mono flex items-start gap-3 border border-danger px-4 py-3 text-base leading-snug md:text-sm">
      <AlertIcon size={20} className="mt-px shrink-0 text-danger" />
      <div className="min-w-0">
        <strong className="block font-medium text-kral-fg">{title}</strong>
        <span className="text-kral-muted">{body}</span>
        <div className="mt-3 flex flex-wrap gap-3">
          {again && (
            <button type="button" onClick={onRetry} className={KRAL_PRIMARY}>
              Try again
            </button>
          )}
          {error.kind === 'no-coordinates' && (
            <button type="button" onClick={onPin} className={KRAL_PRIMARY}>
              Pin this address
            </button>
          )}
          {error.kind === 'not-found' && (
            <button type="button" onClick={onPick} className={KRAL_PRIMARY}>
              Pick an address
            </button>
          )}
          {error.kind === 'forbidden' && (
            <Link to={`/login?next=${encodeURIComponent(next)}`} className={KRAL_PRIMARY}>
              Sign in
            </Link>
          )}
          {error.kind === 'validation' && fromCart && (
            <Link to="/cart" className={KRAL_PRIMARY}>
              Back to cart
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

interface CheckoutFormProps {
  items: CheckoutItem[]
  user: CurrentUser
  fromCart: boolean
  notices: string[]
}

function CheckoutForm({ items, user, fromCart, notices }: CheckoutFormProps) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const cart = useCart()
  const wishlist = useWishlist()
  const toast = useToast()
  const [payment, setPayment] = useState<Payment>('ewallet')
  const [provider, setProvider] = useState<Provider>('gcash')
  const [values, setValues] = useState<AddressValues>({
    fullName: filterFullName(user.name),
    phone: '',
    street: '',
    city: '',
    postal: '',
  })
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_COUNTRY_CODE)
  const [touched, setTouched] = useState<Partial<Record<AddressField, boolean>>>({})
  const [note, setNote] = useState('')
  const [deliveryNote, setDeliveryNote] = useState('')
  const [pending, setPending] = useState(false)
  // The address editor is a sheet; `focusField` is the invalid field to focus once the sheet has rendered it.
  const [editing, setEditing] = useState(false)
  const focusField = useRef<AddressField | null>(null)
  const [failure, setFailure] = useState<OrdersError | null>(null)
  const noteError = note.trim() && hasProfanity(note) ? PROFANITY_ERROR : null
  const deliveryNoteError = deliveryNote.trim() && hasProfanity(deliveryNote) ? PROFANITY_ERROR : null
  // The sheet shows the saved-address form (with its map pin) instead of the fields; `pinNeeded` says why it opened.
  const [adding, setAdding] = useState(false)
  const [pinNeeded, setPinNeeded] = useState(false)
  // A saved address that has no pin: the sheet edits it (keeping its details) instead of starting a blank new one.
  const [pinTarget, setPinTarget] = useState<Address | null>(null)
  const inFlight = useRef(false)
  // The order card is compact only while it is pinned under the bar. Read from its own top, which compacting does not move.
  const itemsCard = useRef<HTMLElement>(null)
  const [stuck, setStuck] = useState(false)
  const controller = useRef<AbortController | null>(null)
  // The saved address fills only what the shopper has not touched, and never what they typed.
  const edited = useRef<Partial<Record<AddressField, boolean>>>({})
  const [saved, setSaved] = useState<'loading' | 'filled' | 'none' | 'failed'>(user.email ? 'loading' : 'none')
  // Every saved address, and the one the fields were last filled from.
  const [addresses, setAddresses] = useState<Address[]>([])
  const [deliverTo, setDeliverTo] = useState('')
  const deliverToRef = useRef('')
  // A read that is over at once never flashes the note; one that is slow (an API later) does.
  const [slow, setSlow] = useState(false)
  const applyAddress = useRef<(address: Address) => void>(() => {})
  const reload = useRef<() => void>(() => {})

  useEffect(() => () => controller.current?.abort(), [])

  useEffect(() => {
    const card = itemsCard.current
    if (!card) return
    let frame = 0
    const update = () => {
      frame = 0
      const style = getComputedStyle(card)
      setStuck(style.position === 'sticky' && card.getBoundingClientRect().top <= (parseFloat(style.top) || 0) + 0.5)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [])

  useEffect(() => {
    if (!editing || !focusField.current) return
    document.getElementById(fieldId(focusField.current))?.focus()
    focusField.current = null
  }, [editing])

  useEffect(() => {
    if (!user.email) return
    let live = true
    const controller = new AbortController()
    const timer = setTimeout(() => setSlow(true), 150)
    const apply = (address: Address) => {
      const filled = valuesOf(address)
      for (const name of ADDRESS_FIELD_ORDER) {
        if (!edited.current[name]) setValues((current) => ({ ...current, [name]: filled[name] }))
      }
      if (!edited.current.phone) setPhoneCountry(DEFAULT_COUNTRY_CODE)
      deliverToRef.current = address.id
      setDeliverTo(address.id)
      setSaved('filled')
    }
    applyAddress.current = apply
    // The default fills the form, or the one the shopper picked if it is still there. An address saved while this
    // form is open (the tour's last step) fills the same way, still never over typing.
    const load = (force: boolean) =>
      loadAddresses({ signal: controller.signal, force }).then(
        (list) => {
          if (!live) return
          setAddresses(list)
          const target = list.find((a) => a.id === deliverToRef.current) ?? getDefaultAddress(list)
          if (target) apply(target)
          else setSaved('none')
        },
        () => {
          if (live && !controller.signal.aborted) setSaved('failed')
        },
      )
    reload.current = () => {
      setSaved('loading')
      void load(true)
    }
    void load(false)
    const unsubscribe = onAddressesChanged(() => void load(true))
    return () => {
      live = false
      controller.abort()
      clearTimeout(timer)
      unsubscribe()
    }
  }, [user.email])

  const simulated = usesSampleOrders()
  const itemCount = items.reduce((sum, i) => sum + i.qty, 0)
  const totals = computeTotals(items)
  const eta = deliveryEta()
  const picking = saved === 'loading' || addresses.length > 1

  const allErrors: AddressErrors = {}
  for (const name of ADDRESS_FIELD_ORDER) {
    const message = VALIDATORS[name](values[name])
    if (message) allErrors[name] = message
  }
  const usable = ADDRESS_FIELD_ORDER.every((name) => !allErrors[name])
  // An error shows after the field is left, then follows every keystroke.
  const shown = (name: AddressField) => (touched[name] ? allErrors[name] : undefined)

  const failedNote = (
    <div className="flex flex-wrap items-center gap-x-3">
      <p role="status" className={MUTED}>
        We couldn&apos;t load your saved addresses, so type your delivery address below.
      </p>
      <button type="button" onClick={() => reload.current()} className={KRAL_LINK}>
        Try again
      </button>
    </div>
  )
  // Always in the layout of the editor, so the saved address arriving does not move the fields.
  const loadNote = (
    <div className="mt-1 min-h-6">
      {saved === 'loading' && slow && (
        <p role="status" className={MUTED}>
          Filling in your saved address…
        </p>
      )}
      {saved === 'failed' && failedNote}
    </div>
  )

  const field = (name: AddressField) => ({
    id: fieldId(name),
    value: values[name],
    error: shown(name),
    readOnly: pending,
    onChange: (value: string) => {
      edited.current[name] = true
      setValues((current) => ({ ...current, [name]: FILTERS[name](value) }))
    },
    onBlur: () => setTouched((current) => ({ ...current, [name]: true })),
  })

  const dial = findCountry(phoneCountry)?.dial ?? ''
  const phoneField = {
    ...field('phone'),
    // A pasted international number loses its dial code instead of overflowing the national number.
    onChange: (value: string) => {
      edited.current.phone = true
      setValues((current) => ({ ...current, phone: filterPhone(value, dial) }))
    },
  }

  // Marks every field as touched so its error shows; returns the first invalid field, if any.
  function checkAddress() {
    setTouched({ fullName: true, phone: true, street: true, city: true, postal: true })
    return ADDRESS_FIELD_ORDER.find((name) => allErrors[name])
  }

  function saveAddress() {
    const first = checkAddress()
    if (first) {
      document.getElementById(fieldId(first))?.focus()
      return
    }
    setEditing(false)
    toast.show({ kind: 'success', message: 'Delivery address saved.' })
  }

  function openPinSheet() {
    const current = addresses.find((a) => a.id === deliverTo)
    setPinTarget(current && current.latitude == null ? current : null)
    setPinNeeded(true)
    setAdding(true)
    setEditing(true)
  }

  function closeSheet() {
    setEditing(false)
    setAdding(false)
    setPinNeeded(false)
    setPinTarget(null)
  }

  async function submit() {
    if (inFlight.current) return
    if (deliveryNoteError || noteError) {
      document.getElementById(deliveryNoteError ? 'checkout-delivery-note' : 'checkout-note')?.focus()
      return
    }
    // The order API takes a saved address with a map pin, so what is on screen must be one of the saved ones as it is.
    const picked = addresses.find((a) => a.id === deliverTo)
    const filled = picked && valuesOf(picked)
    if (!picked || !filled || phoneCountry !== DEFAULT_COUNTRY_CODE || ADDRESS_FIELD_ORDER.some((name) => values[name] !== filled[name])) {
      if (saved === 'failed') setEditing(true)
      else openPinSheet()
      return
    }

    inFlight.current = true
    const abort = new AbortController()
    controller.current = abort
    setFailure(null)
    setPending(true)
    let temporary: string[] = []
    try {
      let cartItemIds: string[]
      if (fromCart) {
        cartItemIds = items.flatMap((i) => (i.itemId ? [i.itemId] : []))
        if (cartItemIds.length !== items.length) throw new OrdersError('validation')
      } else {
        temporary = await addBuyNowLines(items, cart.qtyOfVariant, abort.signal)
        cartItemIds = temporary
      }
      let order: CustomerOrder
      try {
        order = await createOrder({ addressId: picked.id, cartItemIds, shippingFee: totals.shipping, customerNotes: cleanText(note) }, { signal: abort.signal })
      } catch (problem) {
        // A dropped connection may have come after the order was made: never place a second one blindly.
        const found = problem instanceof OrdersError && problem.kind === 'network' ? await findJustPlaced(totals.total) : null
        if (!found) throw problem
        order = found
      }
      await dropLines(temporary)
      const receipt = adaptOrderToReceipt(order)
      saveLastOrder({
        ...receipt,
        items: receipt.items.map((line) => ({ ...line, arReady: items.some((i) => i.product.name === line.name && i.product.arReady) })),
        quotedTotal: totals.total,
      })
      // Only what was ordered leaves the cart: a line added in another tab meanwhile stays. Buy now never touches it.
      if (fromCart) await cart.removeLines(items.map((i) => i.variantId))
      // Bought pieces are no longer wanted on the wishlist.
      wishlist.remove(items.map((i) => i.product.id))
      // A real order is paid on the provider's hosted page. If that page can't open, the order stays unpaid and the success page still shows it.
      if (!usesSampleOrders()) {
        try {
          window.location.assign(await createCheckoutSession(order.id, { signal: abort.signal }))
          return
        } catch {
          if (abort.signal.aborted) return
        }
      }
      // Replace, so Back from the success page does not return to a filled form.
      navigate(`/checkout/success?order=${encodeURIComponent(order.id)}`, { replace: true })
    } catch (problem) {
      await dropLines(temporary)
      if (abort.signal.aborted) return
      setFailure(problem instanceof OrdersError ? problem : new OrdersError('server'))
      setPending(false)
    } finally {
      inFlight.current = false
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void submit()
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-busy={pending} className="mt-6 grid gap-6 max-lg:pb-24 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="min-w-0 space-y-6">
        {notices.length > 0 && (
          <div role="status" className={SECTION}>
            <h2 className="font-kral-mono text-base font-medium text-kral-fg uppercase">We changed your order</h2>
            <ul className="font-kral-mono mt-2 list-disc space-y-1 pl-5 text-base leading-snug text-kral-muted md:text-sm">
              {notices.map((notice) => (
                <li key={notice}>{notice}</li>
              ))}
            </ul>
            <p className="font-kral-mono mt-2 text-base text-kral-muted md:text-sm">Your cart is unchanged until the order is placed.</p>
          </div>
        )}
        <section ref={itemsCard} aria-labelledby="checkout-items" data-tour="checkout-items" data-stuck={stuck || undefined} className={`${SECTION} transition-[padding] duration-200 ease-out motion-reduce:transition-none lg:sticky lg:top-[calc(4rem+var(--site-header-extra,0px))] lg:z-30 lg:bg-kral-bg ${stuck ? 'lg:p-3' : ''}`}>
          <div className="flex items-center justify-between gap-3">
            <h2 id="checkout-items" className={HEADING}>
              <BagIcon />
              Your order
            </h2>
            {fromCart && <IconEditButton tone="kral" to="/cart" label="Edit cart" className="-mr-2" />}
          </div>
          {/* Capped so a long order scrolls inside the pinned card instead of running off the screen. */}
          <ul className={`mt-4 space-y-4 transition-[max-height] duration-200 ease-out motion-reduce:transition-none lg:overflow-y-auto ${stuck ? 'lg:mt-2 lg:max-h-[min(16rem,calc(100svh-11rem))] lg:space-y-3' : 'lg:max-h-[calc(100svh-14rem)]'}`}>
            {items.map((item) => (
              <ItemRow key={item.variantId} item={item} change={!fromCart && items.length === 1} compact={stuck} />
            ))}
          </ul>
        </section>

        <section aria-labelledby="checkout-address" className={SECTION}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="checkout-address" className={HEADING}>
              <MapPinIcon />
              Delivery address
            </h2>
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={usable ? 'Change delivery address' : undefined}
              className={`${KRAL_SECONDARY} shrink-0`}
            >
              {usable ? 'Change' : 'Add address'}
            </button>
          </div>
          {saved === 'loading' ? (
            <div aria-hidden="true" className="mt-3 animate-pulse">
              <div className="my-[3px] h-4 w-1/3 bg-kral-porcelain dark:bg-kral-graphite" />
              <div className="my-[3px] h-4 w-1/2 bg-kral-porcelain dark:bg-kral-graphite" />
              <div className="my-[3px] h-4 w-4/5 bg-kral-porcelain dark:bg-kral-graphite" />
            </div>
          ) : usable ? (
            <div className={`${MUTED} mt-3 leading-snug break-words`}>
              <p className="font-medium text-kral-fg">{cleanText(values.fullName)}</p>
              <p className="tabular-nums">
                {dial} {values.phone}
              </p>
              <p>
                {cleanText(values.street)}, {cleanText(values.city)} {values.postal}
              </p>
            </div>
          ) : (
            <p className={`${MUTED} mt-3`}>Add where we should deliver your order.</p>
          )}
          {saved === 'failed' && !editing && <div className="mt-1">{failedNote}</div>}
        </section>

        <Modal
          open={editing}
          onClose={closeSheet}
          variant="sheet"
          title="Delivery address"
          icon={<MapPinIcon />}
          tone="kral"
          footer={
            adding ? undefined : (
              <div className="flex flex-wrap justify-end gap-3">
                <button type="button" onClick={closeSheet} className={KRAL_SECONDARY}>
                  Cancel
                </button>
                <button type="button" onClick={saveAddress} className={KRAL_PRIMARY}>
                  <CheckIcon />
                  Save address
                </button>
              </div>
            )
          }
        >
          {adding ? (
            <div className="pt-1">
              {pinNeeded && (
                <p role="alert" className="font-kral-mono flex items-start gap-2 text-base leading-snug text-danger">
                  <AlertIcon className="mt-1 shrink-0" />
                  <span>Pin your address on the map so we can deliver. Save it here, then place your order.</span>
                </p>
              )}
              <AddressForm
                tone="kral"
                initial={pinTarget}
                requirePin={pinTarget !== null}
                existingCount={addresses.length}
                onSaved={(address) => {
                  // The list reloads in the background; until it does, Place order must already know this address.
                  setAddresses((list) => (list.some((a) => a.id === address.id) ? list.map((a) => (a.id === address.id ? address : a)) : [...list, address]))
                  // A saved address replaces whatever was typed: the order goes to a saved, pinned address.
                  edited.current = {}
                  applyAddress.current(address)
                  closeSheet()
                  toast.show({ kind: 'success', message: 'Delivery address saved.' })
                }}
                footer={(save) => (
                  <div className="flex flex-wrap justify-end gap-3">
                    <button type="button" onClick={() => (pinNeeded ? closeSheet() : setAdding(false))} className={KRAL_SECONDARY}>
                      {pinNeeded ? 'Cancel' : 'Back'}
                    </button>
                    {save}
                  </div>
                )}
              />
            </div>
          ) : (
          <div className="pb-5">
            {loadNote}
            {/* Held open while the list loads, so a picker arriving does not push the fields down; it folds away
                when there is nothing to choose between (one address or none). */}
            <div className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${picking ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className={`min-h-0 ${picking ? '' : 'overflow-hidden'}`}>
                {picking && (
                  <div className="pt-3">
                    <p aria-hidden="true" className="font-kral-mono mb-1 text-base text-kral-muted md:text-xs md:tracking-[0.08em] md:uppercase">
                      Deliver to
                    </p>
                    {addresses.length > 1 ? (
                      <Select
                        tone="kral"
                        label="Deliver to"
                        value={deliverTo}
                        options={addresses.map((a) => ({ value: a.id, label: `${a.label || a.streetAddress}${a.isDefault ? ' (Default)' : ''}` }))}
                        onChange={(id) => {
                          const picked = addresses.find((a) => a.id === id)
                          if (!picked) return
                          // An explicit pick replaces what was typed.
                          edited.current = {}
                          applyAddress.current(picked)
                        }}
                      />
                    ) : (
                      <div aria-hidden="true" className="h-11 animate-pulse bg-kral-porcelain dark:bg-kral-graphite" />
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FloatingField
                  tone="kral"
                  {...field('fullName')}
                  label="Full name"
                  autoComplete="name"
                  enterKeyHint="next"
                  counter={{ current: values.fullName.length, max: ADDRESS_LIMITS.name }}
                />
              </div>
              <div className="sm:col-span-2">
                <FloatingField
                  tone="kral"
                  {...phoneField}
                  label="Phone number"
                  type="tel"
                  prefix={
                    <CountrySelect
                      tone="kral"
                      id="checkout-phoneCountry"
                      value={phoneCountry}
                      onChange={setPhoneCountry}
                      disabled={pending}
                    />
                  }
                  autoComplete="tel-national"
                  inputMode="tel"
                  enterKeyHint="next"
                  counter={{ current: values.phone.length, max: LIMITS.phoneMaxDigits }}
                />
              </div>
              <div className="sm:col-span-2">
                <FloatingField
                  tone="kral"
                  {...field('street')}
                  label="Street address"
                  autoComplete="street-address"
                  enterKeyHint="next"
                  counter={{ current: values.street.length, max: ADDRESS_LIMITS.street }}
                />
              </div>
              <FloatingField tone="kral" {...field('city')} label="City" autoComplete="address-level2" enterKeyHint="next" />
              <FloatingField
                tone="kral"
                {...field('postal')}
                label="Postal code"
                autoComplete="postal-code"
                inputMode="tel"
                enterKeyHint="done"
                counter={{ current: values.postal.length, max: ADDRESS_LIMITS.postal }}
              />
            </div>
            <button type="button" onClick={() => setAdding(true)} className={`${KRAL_LINK} mt-2`}>
              Add a new address with a map pin
            </button>
          </div>
          )}
        </Modal>

        <section data-tour="checkout-payment" className={SECTION}>
          <PaymentMethods
            payment={payment}
            provider={provider}
            onChange={(nextPayment, nextProvider) => {
              setPayment(nextPayment)
              setProvider(nextProvider)
            }}
          />
          <p className="font-kral-mono mt-1 text-base text-kral-muted md:text-sm">
            {simulated
              ? 'This is a prototype: no payment is taken.'
              : "You'll pay online after placing your order. Online payment opens soon, so your order is held as Awaiting payment."}
          </p>
        </section>

        <NoteSection id="checkout-delivery-note" title="Delivery notes" icon={<MapPinIcon />} placeholder="Instructions for the rider, like a gate code or where to leave the parcel? (optional)" value={deliveryNote} error={deliveryNoteError} readOnly={pending} onChange={setDeliveryNote} />

        <NoteSection id="checkout-note" title="Note to seller" icon={<NoteIcon />} placeholder="Anything the seller should know? (optional)" value={note} error={noteError} readOnly={pending} onChange={setNote} />
      </div>

      <aside aria-labelledby="checkout-summary" className={`${SECTION} space-y-4 lg:sticky lg:top-[calc(4rem+var(--site-header-extra,0px))]`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="checkout-summary" className={HEADING}>
            <ReceiptIcon />
            Order summary
          </h2>
          {simulated && <SampleDataBadge tone="kral" reason="Placing an order here is a demo for this test account. Nothing is charged or sent to the shop." />}
        </div>
        <p className="font-kral-mono text-base leading-snug text-kral-muted md:text-sm">
          <span className="font-medium text-kral-fg">Delivery</span>
          <br />
          {eta}
        </p>
        <PriceSummary tone="kral" totals={totals} itemCount={itemCount} />

        {failure && <FailurePanel error={failure} fromCart={fromCart} next={pathname + search} onRetry={() => void submit()} onPin={openPinSheet} onPick={() => setEditing(true)} />}

        <div className="space-y-4">
          {/* Below lg the button is pinned to the bottom of the screen so it is always in reach; from lg the summary card is sticky instead. */}
          <div className="max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:mb-0 max-lg:z-40 max-lg:border-t max-lg:border-kral-rule max-lg:bg-kral-bg max-lg:px-4 max-lg:pt-3 max-lg:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <button type="submit" data-tour="checkout-place" disabled={pending} className={`${KRAL_PRIMARY} w-full`}>
              {pending ? (
                <>
                  <SpinnerIcon />
                  Placing order…
                </>
              ) : (
                <>
                  <BagIcon />
                  Place order
                </>
              )}
            </button>
          </div>
          <p className="font-kral-mono text-left text-base leading-snug text-kral-muted md:text-sm">
            By placing an order, you agree to the SilhouFit{' '}
            <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="tap kral-focus relative underline underline-offset-2 after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] hover:text-kral-fg">
              Terms of Service
            </a>{' '}
            and sale, and acknowledge that you have read the{' '}
            <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="tap kral-focus relative underline underline-offset-2 after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] hover:text-kral-fg">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </aside>
    </form>
  )
}

/** A free-text box with its own heading, profanity message and character count. */
function NoteSection({ id, title, icon, placeholder, value, error, readOnly, onChange }: { id: string; title: string; icon: ReactNode; placeholder: string; value: string; error: string | null; readOnly: boolean; onChange: (value: string) => void }) {
  return (
    <section aria-labelledby={`${id}-label`} className={SECTION}>
      <label id={`${id}-label`} htmlFor={id} className={`${HEADING} mb-2`}>
        {icon}
        {title}
      </label>
      <textarea
        id={id}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(filterNote(event.target.value))}
        placeholder={placeholder}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${KRAL_INPUT} h-24 resize-none py-3 ${error ? 'border-danger!' : ''}`}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="font-kral-mono mt-1 text-base leading-snug text-danger md:text-sm">
          {error}
        </p>
      )}
      <p className="font-kral-mono mt-1 text-right text-xs text-kral-muted tabular-nums" aria-hidden="true">
        {value.length}/{ADDRESS_LIMITS.note}
      </p>
    </section>
  )
}

export function CheckoutPage() {
  useDocumentTitle('Checkout — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  const user = useCurrentUser()
  const cart = useCart()
  const { pathname, search } = useLocation()
  const [params] = useSearchParams()
  const fromCart = params.get('source') === 'cart'

  // `line` keys narrow the cart to the ticked lines; without them the whole cart is ordered.
  const only = params.getAll('line')
  const cartLines = only.length > 0 ? cart.lines.filter((line) => only.includes(lineKey(line))) : cart.lines
  const waitingForCart = fromCart && cart.status !== 'ready'
  // The pieces to load in full are fixed once per URL: after the order the cart is emptied, and they must not load again.
  const [wanted, setWanted] = useState<{ search: string; ids: string[] } | null>(null)
  if (!waitingForCart && wanted?.search !== search) {
    setWanted({ search, ids: [...new Set(fromCart ? cartLines.map((line) => line.productId) : params.getAll('item'))] })
  }
  const products = useProductsByIds(wanted?.search === search ? wanted.ids : [])
  const status = waitingForCart ? (cart.status === 'error' ? 'error' : 'loading') : wanted?.search !== search ? 'loading' : products.status
  const retry = waitingForCart ? cart.retry : products.retry

  // Resolved once per URL: after the order the cart is emptied, and the page must not flash "nothing to check out".
  const [snapshot, setSnapshot] = useState<{ search: string; items: CheckoutItem[]; notices: string[] } | null>(null)
  if (status === 'success' && products.status === 'success' && snapshot?.search !== search) {
    const resolved = fromCart
      ? resolveCartItems(cartLines, products.products)
      : { items: parseCheckoutItems(params, products.products), notices: [] }
    setSnapshot({ search, ...resolved })
  }

  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />

  const items = snapshot?.search === search ? snapshot.items : []

  return (
    <div className="mx-auto max-w-6xl px-6 pt-18 pb-24 2xl:max-w-[88rem]">
      {/* Stays under the top bar (61px) while the order scrolls; the summary sticks below it. */}
      <div className="lg:pt-2 lg:pb-[25px]">
        <Breadcrumb />
        <h1 className="font-kral-display mt-1 text-2xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-4xl lg:text-5xl">Checkout</h1>
      </div>

      {status === 'loading' && <CheckoutSkeleton />}

      {status === 'error' && (
        <div role="alert" className="mt-6 border border-kral-rule p-6 sm:p-8">
          <h2 className="font-kral-display text-xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-2xl">We couldn&apos;t load your order</h2>
          <p className="font-kral-mono mt-3 max-w-xl text-base leading-relaxed text-kral-muted">
            The request for the catalogue failed, most likely because the connection dropped. Your choices are kept in
            the address. Check your connection, then try again.
          </p>
          <button type="button" onClick={retry} className={`${KRAL_PRIMARY} mt-6 w-fit`}>
            Try again
          </button>
        </div>
      )}

      {status === 'success' && items.length === 0 && (
        <>
          {snapshot && snapshot.notices.length > 0 && (
            <div role="status" className={`${SECTION} mt-6`}>
              <ul className="font-kral-mono list-disc space-y-1 pl-5 text-base leading-snug text-kral-muted md:text-sm">
                {snapshot.notices.map((notice) => (
                  <li key={notice}>{notice}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-6 border border-kral-rule p-6 sm:p-8">
            <h2 className="font-kral-display text-xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-2xl">Nothing to check out</h2>
            <p className="font-kral-mono mt-3 max-w-xl text-base leading-relaxed text-kral-muted">
              {fromCart
                ? 'Your cart has nothing that can be bought right now. Add pieces from the shop, then open your cart and choose Checkout.'
                : 'This link does not point to a piece in the catalogue, or its size, colour or quantity is not available. Pick a piece in the shop and choose Buy now.'}
            </p>
            <Link to="/shop" className={`${KRAL_PRIMARY} mt-6 w-fit`}>
              <StoreIcon />
              Back to shop
            </Link>
          </div>
        </>
      )}

      {status === 'success' && items.length > 0 && (
        <CheckoutForm key={search} items={items} user={user} fromCart={fromCart} notices={snapshot?.notices ?? []} />
      )}
    </div>
  )
}
