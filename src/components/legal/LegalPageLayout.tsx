import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'motion/react'
import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { LegalBackToTop } from './LegalScrollLayers'
import { headingId } from '../../utils/headingId'
import { LegalToc } from './LegalToc'

interface LegalPageLayoutProps {
  title: string
  lastUpdated: string
  scopeNote: string
  children: ReactNode
}

export function LegalPageLayout({
  title,
  lastUpdated,
  scopeNote,
  children,
}: LegalPageLayoutProps) {
  useDocumentTitle(`${title} — SilhouFit`)
  useMetaDescription(
    `Read the SilhouFit ${title.toLowerCase()}, last updated ${lastUpdated}. It explains in plain terms what applies to you as a shopper or boutique on the platform.`,
  )

  const headings = useMemo(
    () =>
      Children.toArray(children).flatMap((child) =>
        isValidElement<{ heading?: string }>(child) && child.props.heading
          ? [child.props.heading]
          : [],
      ),
    [children],
  )

  return (
    <div className="kral-counter relative bg-kral-bg px-4 pt-24 pb-12 font-kral-mono text-kral-fg tabular-nums sm:px-6 sm:pt-32 sm:pb-16">
      <div className="mx-auto grid max-w-2xl xl:max-w-[62rem] xl:grid-cols-[14rem_minmax(0,42rem)] xl:justify-center xl:gap-10">
        <LegalToc headings={headings} />
        <article className="w-full min-w-0 wrap-break-word">
          <span aria-hidden="true" className="mb-6 block h-0.5 w-14 bg-kral-red" />
          <h1 className="font-kral-display text-[clamp(1.75rem,5vw,3rem)] leading-[1.05] font-extrabold uppercase">
            {title}
          </h1>
          <p className="mt-4 text-sm font-medium tracking-[0.08em] text-kral-muted uppercase">
            Last updated // {lastUpdated}
          </p>

          <div className="mt-6 border-l-2 border-kral-red pl-4 text-sm leading-relaxed text-kral-muted sm:mt-8">
            {scopeNote}
          </div>

          <div className="mt-10 space-y-10 text-base leading-relaxed text-kral-muted sm:mt-12 [&_a]:underline [&_a]:decoration-kral-red [&_a]:decoration-2 [&_a]:underline-offset-4 [&_a]:transition-colors [&_a]:duration-200 [&_a]:ease-out motion-reduce:[&_a]:transition-none [&_a:hover]:text-kral-fg">
            {children}
          </div>
        </article>
      </div>
      <LegalBackToTop />
    </div>
  )
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string
  children: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  // "Arrived" means in view or scrolled past; an IntersectionObserver misses sections a jump skipped, so check on scroll.
  const [inView, setInView] = useState(false)
  useEffect(() => {
    function check() {
      const el = ref.current
      if (!el || el.getBoundingClientRect().top > window.innerHeight * 0.9) return
      setInView(true)
      window.removeEventListener('scroll', check)
    }
    check()
    window.addEventListener('scroll', check, { passive: true })
    return () => window.removeEventListener('scroll', check)
  }, [])

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })
  const headingY = useTransform(scrollYProgress, [0, 1], [6, -6])

  return (
    <motion.section
      ref={ref}
      id={headingId(heading)}
      data-heading={heading}
      className="scroll-mt-28"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={
        inView
          ? { opacity: 1, y: 0 }
          : reduced
            ? { opacity: 0 }
            : { opacity: 0, y: 16 }
      }
      transition={{ duration: DURATION.entrance, ease: EASE_OUT }}
    >
      <motion.span
        aria-hidden="true"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: inView ? 1 : 0 }}
        transition={{ duration: DURATION.entrance, ease: EASE_OUT, delay: 0.15 }}
        className="block h-px w-full origin-left bg-kral-rule"
      />
      <span
        aria-hidden="true"
        className="kral-index mt-3 block text-sm font-medium tracking-[0.08em] text-kral-red-ink"
      />
      <motion.h2
        style={{ y: reduced ? 0 : headingY }}
        className="mt-2 font-kral-display text-xl leading-tight font-extrabold text-kral-fg uppercase sm:text-2xl"
      >
        {heading}
      </motion.h2>
      <div className="mt-4 space-y-3">{children}</div>
    </motion.section>
  )
}
