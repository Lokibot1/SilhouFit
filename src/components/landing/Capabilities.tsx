const CAPABILITIES = [
  {
    term: 'Inventory that matches in real time',
    detail:
      'Stock changes at the register update the storefront immediately, and the reverse. One inventory count, not two ledgers to reconcile by hand.',
  },
  {
    term: 'One cart, either channel',
    detail:
      'Add items online or in the store and check out with Buy Online, Pick Up In-Store. The cart follows the shopper across channels.',
  },
  {
    term: 'A profile that remembers sizing',
    detail:
      'Purchase history, wishlist items, and sizing preferences are stored once and used everywhere the shopper appears, in the store or on the site.',
  },
  {
    term: 'Garment models managed by staff',
    detail:
      'Boutique staff upload and scale 3D garment models from the admin dashboard and link them to the matching product listing, no separate 3D pipeline needed.',
  },
]

export function Capabilities() {
  return (
    <section
      id="capabilities"
      className="measure-field scroll-mt-20 bg-bone dark:bg-ink"
    >
      <div className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="font-display max-w-md text-3xl font-semibold text-ink dark:text-bone">
          What the store side handles
        </h2>
        <dl className="mt-12 border-t border-ink/15 dark:border-white/15">
          {CAPABILITIES.map((item) => (
            <div
              key={item.term}
              className="grid gap-3 border-b border-ink/15 py-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-10 dark:border-white/15"
            >
              <dt className="text-lg font-semibold text-ink dark:text-bone">
                {item.term}
              </dt>
              <dd className="text-base leading-relaxed text-ink/70 dark:text-bone/75">
                {item.detail}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
