const STEPS = [
  {
    title: 'Browse the catalog',
    detail:
      'Product pages show what is in stock at the connected boutique, pulled from the same inventory the register uses.',
  },
  {
    title: 'Preview the fit',
    detail:
      'Turn on the camera to see the garment scaled to your body before adding it to the cart.',
  },
  {
    title: 'Choose how to receive it',
    detail:
      'Check out for delivery, or reserve online and pick up in the store the same day.',
  },
  {
    title: 'Store and site stay in sync',
    detail:
      'The sale updates inventory across channels immediately, so the next shopper sees accurate stock.',
  },
]

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="measure-field scroll-mt-20 bg-bone dark:bg-ink"
    >
      <div className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="font-display max-w-md text-3xl font-semibold text-ink dark:text-bone">
          From browsing to pickup
        </h2>
        <ol className="mt-12 border-t border-ink/15 dark:border-white/15">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="grid grid-cols-[3rem_1fr] gap-6 border-b border-ink/15 py-8 sm:grid-cols-[4rem_minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-10 dark:border-white/15"
            >
              <span
                className="font-mono text-2xl tabular-nums text-ink/40 dark:text-bone/40"
                aria-hidden="true"
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="text-lg font-semibold text-ink sm:col-start-2 dark:text-bone">
                {step.title}
              </h3>
              <p className="col-span-2 text-base leading-relaxed text-ink/70 sm:col-span-1 sm:col-start-3 dark:text-bone/75">
                {step.detail}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
