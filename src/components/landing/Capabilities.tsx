import { ParallaxSection } from './ParallaxSection'

const CAPABILITIES = [
  {
    term: 'Inventory that matches in real time',
    detail:
      'Stock changes at the register update the storefront immediately, and the reverse. One inventory count, not two ledgers to reconcile by hand.',
    span: 'lg:col-span-2',
  },
  {
    term: 'A profile that remembers sizing',
    detail:
      'Purchase history, wishlist items, and sizing preferences are stored once and used everywhere the shopper appears.',
    span: 'lg:col-span-1',
    image: '/images/measuring-tape.jpg',
  },
  {
    term: 'One cart, either channel',
    detail:
      'Add items online or in the store and check out with Buy Online, Pick Up In-Store. The cart follows the shopper across channels.',
    span: 'lg:col-span-1',
  },
  {
    term: 'Garment models managed by staff',
    detail:
      'Boutique staff upload and scale 3D garment models from the admin dashboard and link them to the matching product listing, no separate 3D pipeline needed.',
    span: 'lg:col-span-2',
  },
]

export function Capabilities() {
  return (
    <ParallaxSection
      id="capabilities"
      image="/images/boutique-rack.jpg"
      scrimClassName="bg-bone/65 dark:bg-ink/65"
    >
      <div className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="display max-w-2xl text-[clamp(2rem,4.5vw,3.75rem)] text-ink drop-shadow-sm dark:text-bone">
          What the store side handles
        </h2>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((item) => (
            <div
              key={item.term}
              className={`btn-lift glass flex flex-col overflow-hidden rounded-2xl ${item.span ?? ''}`}
            >
              {item.image && (
                <img
                  src={item.image}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="h-36 w-full object-cover"
                />
              )}
              <div className="flex flex-1 flex-col p-7">
                <h3 className="display text-2xl text-ink sm:text-[1.75rem] dark:text-bone">
                  {item.term}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-ink/70 dark:text-bone/75">
                  {item.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ParallaxSection>
  )
}
