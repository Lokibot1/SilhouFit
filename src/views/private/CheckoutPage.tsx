import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckoutSkeleton } from '../../components/checkout/CheckoutSkeleton'
import { OptionCards } from '../../components/checkout/OptionCards'
import { PriceSummary } from '../../components/checkout/PriceSummary'
import { CountrySelect } from '../../components/form/CountrySelect'
import { FloatingField } from '../../components/form/FloatingField'
import { AlertIcon, SpinnerIcon } from '../../components/form/icons'
import { SHOP_PRIMARY } from '../../components/shop/shopControls'
import { PRIMARY_BUTTON } from '../../components/ui/buttonStyles'
import { DEFAULT_COUNTRY_CODE, findCountry } from '../../data/countries'
import { lineKey, useCart } from '../../hooks/useCart'
import { useCurrentUser, type CurrentUser } from '../../hooks/useCurrentUser'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useProducts } from '../../hooks/useProducts'
import { useWishlist } from '../../hooks/useWishlist'
import { getAddress, onAddressSaved, type SavedAddress } from '../../service/address'
import { placeOrder } from '../../service/placeOrder'
import {
  computeTotals,
  defaultFulfilment,
  deliveryEta,
  fulfilmentAvailability,
  orderBlock,
  paymentLabel,
  parseCheckoutItems,
  resolveCartItems,
  pickupEta,
  PROVIDERS,
  saveLastOrder,
  SHIPPING_FEE,
  type CheckoutItem,
  type Fulfilment,
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
  validateCity,
  validateFullName,
  validatePostal,
  validateStreet,
  type AddressErrors,
  type AddressField,
  type AddressValues,
} from '../../utils/checkoutValidation'
import { formatPeso } from '../../utils/format'
import { LIMITS, normalizePhone, sanitizePhoneDigits, validatePhone } from '../../utils/signUpValidation'

const META_DESCRIPTION =
  'Review your SilhouFit order, choose delivery or pick-up in store, pay with GCash, Maya or cash, and add a note for the seller before you place the order.'

const SECTION = 'glass-card rounded-2xl p-5'
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
      <ol className="font-ui flex items-center gap-2 text-sm text-fg-muted">
        <li>
          <Link to="/" className="tap hover:text-fg">
            Home
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <Link to="/shop" className="tap hover:text-fg">
            Shop
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page">Checkout</li>
      </ol>
    </nav>
  )
}

function ItemRow({ item, change }: { item: CheckoutItem; change: boolean }) {
  const { product, size, color, qty } = item
  const unit = product.salePrice ?? product.price
  return (
    <li className="flex min-w-0 gap-4">
      <img
        src={product.image}
        alt={product.alt}
        className="photo-mono h-24 w-18 shrink-0 rounded-xl border border-line object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="font-ui truncate text-[11px] tracking-[0.16em] text-fg-muted uppercase">
          {product.category} · {product.boutique}
        </p>
        <h3 className="mt-1 text-base leading-snug font-semibold break-words text-fg">{product.name}</h3>
        <p className="mt-1 text-sm text-fg-muted">
          Size {size} · {color}
        </p>
        {/* Wraps instead of overflowing: a sale piece shows two prices, and quantities make them long. */}
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {change ? (
            <Link
              to={`/shop?item=${product.id}&action=buy`}
              aria-label={`Change options for ${product.name}`}
              className="tap text-sm font-medium text-fg underline underline-offset-2 hover:text-chrome-strong"
            >
              Change
            </Link>
          ) : (
            <span />
          )}
          <div className="ml-auto min-w-0 text-right tabular-nums">
            <p className="text-sm text-fg-muted">
              {formatPeso(unit)} × {qty}
            </p>
            <p className="flex flex-wrap justify-end gap-x-2 text-base font-semibold text-fg">
              {product.salePrice !== undefined && (
                <>
                  <span className="sr-only">Original price </span>
                  <s className="font-normal text-fg-muted">{formatPeso(product.price * qty)}</s>
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

interface CheckoutFormProps {
  items: CheckoutItem[]
  user: CurrentUser
  fromCart: boolean
  notices: string[]
}

function CheckoutForm({ items, user, fromCart, notices }: CheckoutFormProps) {
  const navigate = useNavigate()
  const cart = useCart()
  const wishlist = useWishlist()
  const [fulfilment, setFulfilment] = useState<Fulfilment>(() => defaultFulfilment(items))
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
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const inFlight = useRef(false)
  const controller = useRef<AbortController | null>(null)
  // The saved address fills only what the shopper has not touched, and never what they typed.
  const edited = useRef<Partial<Record<AddressField, boolean>>>({})
  const [saved, setSaved] = useState<'loading' | 'filled' | 'none' | 'failed'>(user.email ? 'loading' : 'none')
  // A read that is over at once never flashes the note; one that is slow (an API later) does.
  const [slow, setSlow] = useState(false)

  useEffect(() => () => controller.current?.abort(), [])

  useEffect(() => {
    if (!user.email) return
    let live = true
    const timer = setTimeout(() => setSlow(true), 150)
    const apply = (address: SavedAddress) => {
      const barangay = cleanPlaceName(address.barangay)
      const area = /^(barangay|brgy)\b/i.test(barangay) ? barangay : `Barangay ${barangay}`
      const fill = (name: AddressField, value: string) => (edited.current[name] ? undefined : FILTERS[name](value))
      setValues((current) => ({
        ...current,
        street: current.street || fill('street', barangay ? `${address.street}, ${area}` : address.street) || '',
        city: current.city || fill('city', cleanPlaceName(address.city)) || '',
        postal: current.postal || fill('postal', address.postal) || '',
      }))
      setSaved('filled')
    }
    // An address saved while this form is open (the tour's last step) fills the same way, still never over typing.
    const unsubscribe = onAddressSaved(user.email, apply)
    getAddress(user.email).then(
      (address) => {
        if (!live) return
        if (!address) return setSaved('none')
        apply(address)
      },
      () => {
        if (live) setSaved('failed')
      },
    )
    return () => {
      live = false
      clearTimeout(timer)
      unsubscribe()
    }
  }, [user.email])

  const availability = fulfilmentAvailability(items)
  const blocked = orderBlock(items)
  const itemCount = items.reduce((sum, i) => sum + i.qty, 0)
  const totals = computeTotals(items, fulfilment)
  const eta = fulfilment === 'delivery' ? deliveryEta() : pickupEta(items)
  const delivery = fulfilment === 'delivery'

  const allErrors: AddressErrors = {}
  for (const name of ADDRESS_FIELD_ORDER) {
    const message = VALIDATORS[name](values[name])
    if (message) allErrors[name] = message
  }
  // An error shows after the field is left, then follows every keystroke.
  const shown = (name: AddressField) => (touched[name] ? allErrors[name] : undefined)

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

  async function submit() {
    if (inFlight.current || blocked) return
    if (delivery) {
      setTouched({ fullName: true, phone: true, street: true, city: true, postal: true })
      const first = ADDRESS_FIELD_ORDER.find((name) => allErrors[name])
      if (first) {
        document.getElementById(fieldId(first))?.focus()
        return
      }
    }

    inFlight.current = true
    const abort = new AbortController()
    controller.current = abort
    setFailed(false)
    setPending(true)
    const label = paymentLabel(payment, fulfilment, provider)
    try {
      const { orderId } = await placeOrder(
        {
          items: items.map((i) => ({ id: i.product.id, size: i.size, color: i.color, qty: i.qty })),
          fulfilment,
          payment: label,
          address: delivery
            ? {
                fullName: cleanText(values.fullName),
                phone: normalizePhone(values.phone, dial),
                street: cleanText(values.street),
                city: cleanText(values.city),
                postal: values.postal,
              }
            : undefined,
          note: cleanText(note),
          total: totals.total,
        },
        { signal: abort.signal },
      )
      saveLastOrder({
        orderId,
        items: items.map((i) => ({
          name: i.product.name,
          size: i.size,
          color: i.color,
          qty: i.qty,
          price: i.product.salePrice ?? i.product.price,
          arReady: i.product.arReady,
        })),
        total: totals.total,
        shipping: totals.shipping,
        payment: label,
        fulfilment: delivery ? 'Delivery' : 'Pick up in store',
        eta,
        pickupAt: delivery ? undefined : [...new Set(items.map((i) => i.product.boutique))].join(', '),
        recipient: delivery ? cleanText(values.fullName) : undefined,
        address: delivery ? `${cleanText(values.street)}, ${cleanText(values.city)} ${values.postal}` : undefined,
        phone: delivery ? normalizePhone(values.phone, dial) : undefined,
        note: cleanText(note) || undefined,
      })
      // Only what was ordered leaves the cart: a line added in another tab meanwhile stays. Buy now never touches it.
      if (fromCart) cart.removeLines(items.map((i) => lineKey({ id: i.product.id, size: i.size, color: i.color })))
      // Bought pieces are no longer wanted on the wishlist.
      wishlist.remove(items.map((i) => i.product.id))
      // Replace, so Back from the success page does not return to a filled form.
      navigate('/checkout/success', { replace: true })
    } catch {
      if (abort.signal.aborted) return
      setFailed(true)
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
    <form noValidate onSubmit={onSubmit} aria-busy={pending} className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="min-w-0 space-y-6">
        {notices.length > 0 && (
          <div role="status" className="glass-card rounded-2xl p-5">
            <h2 className="text-base font-semibold text-fg">We changed your order</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-snug text-fg-muted">
              {notices.map((notice) => (
                <li key={notice}>{notice}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-fg-muted">Your cart is unchanged until the order is placed.</p>
          </div>
        )}
        <section aria-labelledby="checkout-items" data-tour="checkout-items" className={SECTION}>
          <h2 id="checkout-items" className="display text-xl text-fg">
            Your order
          </h2>
          <ul className="mt-4 space-y-4">
            {items.map((item) => (
              <ItemRow key={`${item.product.id}|${item.size}|${item.color}`} item={item} change={!fromCart && items.length === 1} />
            ))}
          </ul>
          {fromCart && (
            <Link to="/cart" className="tap mt-3 text-sm font-medium text-fg underline underline-offset-2 hover:text-chrome-strong">
              Edit cart
            </Link>
          )}
        </section>

        <section data-tour="checkout-fulfilment" className={SECTION}>
          <OptionCards
            legend="How do you want to get it?"
            name="fulfilment"
            value={fulfilment}
            onChange={setFulfilment}
            options={[
              {
                value: 'delivery',
                title: 'Delivery',
                description: `${formatPeso(SHIPPING_FEE)} · ${deliveryEta()}`,
                disabledReason: availability.delivery,
              },
              {
                value: 'pickup',
                title: 'Pick up in store',
                description: `Free · ${pickupEta(items)}`,
                disabledReason: availability.pickup,
              },
            ]}
          />
        </section>

        {delivery && (
          <section aria-labelledby="checkout-address" className={SECTION}>
            <h2 id="checkout-address" className="display text-xl text-fg">
              Delivery address
            </h2>
            {/* Always in the layout, so the saved address arriving does not move the fields. */}
            <div className="mt-1 min-h-6">
              {saved === 'loading' && slow && (
                <p role="status" className="text-base text-fg-muted">
                  Filling in your saved address…
                </p>
              )}
              {saved === 'failed' && (
                <p role="status" className="text-base text-fg-muted">
                  We couldn&apos;t read your saved address on this device, so type it below.
                </p>
              )}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FloatingField
                  {...field('fullName')}
                  label="Full name"
                  autoComplete="name"
                  enterKeyHint="next"
                  counter={{ current: values.fullName.length, max: ADDRESS_LIMITS.name }}
                />
              </div>
              <div className="sm:col-span-2">
                <FloatingField
                  {...phoneField}
                  label="Phone number"
                  type="tel"
                  prefix={
                    <CountrySelect
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
                  {...field('street')}
                  label="Street address"
                  autoComplete="street-address"
                  enterKeyHint="next"
                  counter={{ current: values.street.length, max: ADDRESS_LIMITS.street }}
                />
              </div>
              <FloatingField {...field('city')} label="City" autoComplete="address-level2" enterKeyHint="next" />
              <FloatingField
                {...field('postal')}
                label="Postal code"
                autoComplete="postal-code"
                inputMode="tel"
                enterKeyHint="done"
                counter={{ current: values.postal.length, max: ADDRESS_LIMITS.postal }}
              />
            </div>
          </section>
        )}

        <section data-tour="checkout-payment" className={SECTION}>
          <OptionCards
            legend="How do you want to pay?"
            name="payment"
            value={payment}
            onChange={setPayment}
            options={[
              {
                value: 'ewallet',
                title: 'E-Wallet',
                description: 'Pay with GCash or Maya.',
                extra: (
                  <fieldset className="mt-2 px-1">
                    <legend className="font-ui text-sm text-fg-muted">E-wallet provider</legend>
                    <div className="mt-1 flex gap-4">
                      {PROVIDERS.map((p) => (
                        <label key={p.value} className="flex min-h-9 pointer-coarse:min-h-11 cursor-pointer items-center gap-2 text-base text-fg">
                          <input
                            type="radio"
                            name="provider"
                            value={p.value}
                            checked={provider === p.value}
                            onChange={() => setProvider(p.value)}
                            className="size-5 accent-fg"
                          />
                          {p.label}
                        </label>
                      ))}
                    </div>
                    <p className="mt-1 text-sm text-fg-muted">This is a prototype: no payment is taken.</p>
                  </fieldset>
                ),
              },
              {
                value: 'cash',
                title: delivery ? 'Cash on delivery' : 'Pay at pickup',
                description: delivery ? 'Pay the rider when it arrives.' : 'Pay at the store when you collect it.',
              },
            ]}
          />
        </section>

        <section aria-labelledby="checkout-note-label" className={SECTION}>
          <label id="checkout-note-label" htmlFor="checkout-note" className="display block text-xl text-fg">
            Note to seller
          </label>
          <textarea
            id="checkout-note"
            value={note}
            readOnly={pending}
            onChange={(event) => setNote(filterNote(event.target.value))}
            placeholder="Anything the seller should know? (optional)"
            rows={3}
            className="mt-3 min-h-24 w-full rounded-xl border border-line-strong bg-canvas p-3 text-base text-fg placeholder:text-fg-muted"
          />
          <p className="font-ui mt-1 text-right text-xs text-fg-muted tabular-nums" aria-hidden="true">
            {note.length}/{ADDRESS_LIMITS.note}
          </p>
        </section>
      </div>

      <aside aria-labelledby="checkout-summary" className={`${SECTION} space-y-4 lg:sticky lg:top-24`}>
        <h2 id="checkout-summary" className="display text-xl text-fg">
          Order summary
        </h2>
        <p className="text-sm leading-snug text-fg-muted">
          <span className="font-semibold text-fg">{delivery ? 'Delivery' : 'Pick up in store'}</span>
          <br />
          {eta}
        </p>
        <PriceSummary totals={totals} itemCount={itemCount} />

        {blocked && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm leading-snug">
            <AlertIcon size={20} className="mt-px shrink-0 text-danger" />
            <p className="min-w-0 text-fg">{blocked}</p>
          </div>
        )}

        {failed && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm leading-snug">
            <AlertIcon size={20} className="mt-px shrink-0 text-danger" />
            <div className="min-w-0">
              <strong className="block font-semibold text-fg">We couldn&apos;t place your order.</strong>
              <span className="text-fg-muted">
                The connection to our order service dropped before it replied, so no order was made. Your details are
                kept: check your connection, then try again.
              </span>
              <button
                type="button"
                onClick={() => void submit()}
                className={`${SHOP_PRIMARY} mt-3`}
              >
                Try again
              </button>
            </div>
          </div>
        )}

        <button type="submit" data-tour="checkout-place" disabled={pending || Boolean(blocked)} className={`${PRIMARY_BUTTON} w-full`}>
          {pending ? (
            <>
              <SpinnerIcon />
              Placing order…
            </>
          ) : (
            'Place order'
          )}
        </button>
      </aside>
    </form>
  )
}

export function CheckoutPage() {
  useDocumentTitle('Checkout — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  const user = useCurrentUser()
  const cart = useCart()
  const { pathname, search } = useLocation()
  const [params] = useSearchParams()
  const products = useProducts()
  const fromCart = params.get('source') === 'cart'

  // Resolved once per URL: after the order the cart is emptied, and the page must not flash "nothing to check out".
  const [snapshot, setSnapshot] = useState<{ search: string; items: CheckoutItem[]; notices: string[] } | null>(null)
  if (products.status === 'success' && snapshot?.search !== search) {
    // `line` keys narrow the cart to the ticked lines; without them the whole cart is ordered.
    const only = params.getAll('line')
    const lines = only.length > 0 ? cart.lines.filter((line) => only.includes(lineKey(line))) : cart.lines
    const resolved = fromCart
      ? resolveCartItems(lines, products.data.products)
      : { items: parseCheckoutItems(params, products.data.products), notices: [] }
    setSnapshot({ search, ...resolved })
  }

  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />

  const items = snapshot?.search === search ? snapshot.items : []

  return (
    <div className="mx-auto max-w-6xl px-6 pt-20 pb-24">
      <Breadcrumb />
      <h1 className="display mt-1 text-3xl text-fg sm:text-4xl">Checkout</h1>

      {products.status === 'loading' && <CheckoutSkeleton />}

      {products.status === 'error' && (
        <div role="alert" className="glass-card mt-6 rounded-2xl p-6 sm:p-8">
          <h2 className="display text-2xl text-fg">We couldn&apos;t load your order</h2>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-fg-muted">
            The request for the catalogue failed, most likely because the connection dropped. Your choices are kept in
            the address. Check your connection, then try again.
          </p>
          <button type="button" onClick={products.retry} className={`${PRIMARY_BUTTON} mt-6`}>
            Try again
          </button>
        </div>
      )}

      {products.status === 'success' && items.length === 0 && (
        <>
          {snapshot && snapshot.notices.length > 0 && (
            <div role="status" className="glass-card mt-6 rounded-2xl p-5">
              <ul className="list-disc space-y-1 pl-5 text-sm leading-snug text-fg-muted">
                {snapshot.notices.map((notice) => (
                  <li key={notice}>{notice}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="glass-card mt-6 rounded-2xl p-6 sm:p-8">
            <h2 className="display text-2xl text-fg">Nothing to check out</h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-fg-muted">
              {fromCart
                ? 'Your cart has nothing that can be bought right now. Add pieces from the shop, then open your cart and choose Checkout.'
                : 'This link does not point to a piece in the catalogue, or its size, colour or quantity is not available. Pick a piece in the shop and choose Buy now.'}
            </p>
            <Link to="/shop" className={`${PRIMARY_BUTTON} mt-6 inline-flex`}>
              Back to shop
            </Link>
          </div>
        </>
      )}

      {products.status === 'success' && items.length > 0 && (
        <CheckoutForm key={search} items={items} user={user} fromCart={fromCart} notices={snapshot?.notices ?? []} />
      )}
    </div>
  )
}
