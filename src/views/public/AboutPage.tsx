import { Capabilities } from '../../components/landing/Capabilities'
import { ForBoutiques } from '../../components/landing/ForBoutiques'
import { HowItWorks } from '../../components/landing/HowItWorks'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Reveal } from '../../motion/Reveal'

export function AboutPage() {
  useDocumentTitle('About SilhouFit — How the platform works for boutiques')

  return (
    <>
      <header className="mx-auto max-w-6xl px-6 pt-40 pb-16">
        <Reveal>
          <h1 className="display text-[clamp(2.75rem,6.5vw,5.5rem)] text-fg">
            About SilhouFit
          </h1>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-fg-muted">
            An omnichannel commerce platform for local apparel boutiques:
            one inventory across the store and the storefront, browser-based
            AR fitting, and the numbers owners need to decide what to stock.
          </p>
        </Reveal>
      </header>
      <Capabilities />
      <HowItWorks />
      <ForBoutiques />
    </>
  )
}
