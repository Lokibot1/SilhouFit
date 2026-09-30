import { Reveal } from '../../motion/Reveal'

/**
 * The stillest section on the page, on purpose. After a pinned track and a
 * scrubbed acquisition sequence, the place where the visitor is asked to act
 * holds steady -- the contrast is what makes the rest read as deliberate.
 */
export function Contact() {
  return (
    <section id="contact" className="relative scroll-mt-28">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="glass-solid rounded-2xl px-8 py-12 sm:px-12">
          <div className="max-w-xl">
            <Reveal>
              <h2 className="display text-[clamp(2rem,4.5vw,3.75rem)] text-fg">
                Reach out
              </h2>
            </Reveal>
            <p className="mt-6 text-base leading-relaxed text-fg-muted">
              This project is being built as a capstone for a Bachelor of
              Science in Information Technology program at Quezon City
              University. If you run a local apparel boutique and want to
              see a walkthrough, or you have feedback on the AR fitting
              flow, send a message.
            </p>
            <a
              href="mailto:team@silhoufit.dev"
              className="btn-lift font-ui mt-8 inline-block rounded-full border-2 border-fg bg-fg px-6 py-3 text-sm font-semibold text-canvas hover:border-chrome-strong hover:bg-chrome-strong"
            >
              Email the team
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
