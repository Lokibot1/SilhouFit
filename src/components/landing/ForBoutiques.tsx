import { DashboardMock } from './DashboardMock'
import { ParallaxSection } from './ParallaxSection'

export function ForBoutiques() {
  return (
    <ParallaxSection id="boutiques" image="/images/boutique-rack.jpg" speed={0.1}>
      <div className="mx-auto grid max-w-6xl items-center gap-16 px-6 py-24 lg:grid-cols-2">
        <div className="glass-solid max-w-xl rounded-2xl p-8">
          <h2 className="display text-[clamp(1.75rem,4vw,3rem)] text-ink dark:text-bone">
            A dashboard for the owner, not just the shopper
          </h2>
          <p className="mt-6 text-base leading-relaxed text-ink/70 dark:text-bone/75">
            The admin side surfaces sales performance, inventory turnover,
            and revenue trends pulled from both channels. It also tracks how
            often a virtual fitting session leads to a purchase, so a store
            can see whether the AR module is doing its job.
          </p>
          <p className="mt-4 text-base leading-relaxed text-ink/70 dark:text-bone/75">
            The system is being evaluated against the ISO 25010 quality
            model with boutique managers and shoppers, covering
            functionality, usability, and reliability.
          </p>
        </div>

        <div className="glass mx-auto w-full max-w-sm rounded-2xl p-8">
          <DashboardMock />
        </div>
      </div>
    </ParallaxSection>
  )
}
