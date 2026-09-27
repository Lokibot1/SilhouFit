import { SilhouetteMark } from './SilhouetteMark'

export function Hero() {
  return (
    <section className="measure-field relative overflow-hidden bg-bone dark:bg-ink">
      <div className="mx-auto grid max-w-6xl items-center gap-16 px-6 py-24 md:py-32 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="max-w-xl">
          <h1 className="font-display text-4xl font-semibold leading-[1.1] text-ink sm:text-5xl dark:text-bone">
            Try the fit before the garment ships.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-ink/70 dark:text-bone/75">
            SilhouFit is an omnichannel store platform for local apparel
            boutiques. Shoppers preview how a garment sits on their own body
            using a laptop, desktop, or a screen with a webcam attached, no
            headset or kiosk required. Behind it, in-store and online
            inventory stay in sync, and owners get a dashboard built on their
            own sales data.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <a
              href="/#ar-fitting"
              className="rounded-sm border-2 border-ink bg-ink px-6 py-3 text-sm font-semibold text-bone hover:border-garnet hover:bg-garnet dark:border-bone dark:bg-bone dark:text-ink dark:hover:border-garnet-light dark:hover:bg-garnet-light"
            >
              See the AR fitting flow
            </a>
            <a
              href="/#boutiques"
              className="rounded-sm border-2 border-ink px-6 py-3 text-sm font-semibold text-ink hover:border-garnet hover:text-garnet dark:border-bone dark:text-bone dark:hover:border-garnet-light dark:hover:text-garnet-light"
            >
              For boutique owners
            </a>
          </div>
          <p className="mt-8 text-sm text-ink/55 dark:text-bone/55">
            Built as a Bachelor of Science in Information Technology capstone
            project. Currently a working prototype, not a live storefront.
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-sm justify-self-center lg:justify-self-end">
          <div className="glass rounded-2xl p-6 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between border-b border-ink/10 pb-4 dark:border-white/10">
              <span className="text-sm font-semibold text-ink dark:text-bone">
                Fitting preview
              </span>
              <span className="rounded-sm border border-ink/20 px-2 py-1 text-xs font-medium text-ink/70 dark:border-white/20 dark:text-bone/70">
                Camera on
              </span>
            </div>
            <SilhouetteMark className="mx-auto mt-4 h-56 w-44 text-ink/70 dark:text-bone/70" />
            <div className="mt-4 flex gap-3">
              <span className="rounded-sm border border-ink/15 px-3 py-1.5 text-sm font-medium text-ink/80 dark:border-white/15 dark:text-bone/80">
                Size M
              </span>
              <span className="rounded-sm border border-ink/15 px-3 py-1.5 text-sm font-medium text-ink/80 dark:border-white/15 dark:text-bone/80">
                Regular fit
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
