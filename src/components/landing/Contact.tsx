export function Contact() {
  return (
    <section
      id="contact"
      className="measure-field scroll-mt-20 bg-bone dark:bg-ink"
    >
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="glass rounded-2xl px-8 py-12 sm:px-12">
          <div className="max-w-xl">
            <h2 className="font-display text-3xl font-semibold text-ink dark:text-bone">
              Reach out
            </h2>
            <p className="mt-6 text-base leading-relaxed text-ink/70 dark:text-bone/75">
              This project is being built as a capstone for a Bachelor of
              Science in Information Technology program at Quezon City
              University. If you run a local apparel boutique and want to
              see a walkthrough, or you have feedback on the AR fitting
              flow, send a message.
            </p>
            <a
              href="mailto:team@silhoufit.dev"
              className="mt-8 inline-block rounded-sm border-2 border-ink bg-ink px-6 py-3 text-sm font-semibold text-bone hover:border-garnet hover:bg-garnet dark:border-bone dark:bg-bone dark:text-ink dark:hover:border-garnet-light dark:hover:bg-garnet-light"
            >
              Email the team
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
