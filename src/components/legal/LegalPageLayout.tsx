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
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { LegalBackToTop, LegalParallaxSky } from './LegalScrollLayers'
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
    <div className="relative px-4 pt-24 pb-12 sm:px-6 sm:pt-32 sm:pb-16">
      <LegalParallaxSky />
      <div className="mx-auto grid max-w-2xl xl:max-w-[62rem] xl:grid-cols-[14rem_minmax(0,42rem)] xl:justify-center xl:gap-10">
        <LegalToc headings={headings} />
        <article className="glass-card glass-elevated glass-dense w-full rounded-2xl px-5 py-10 wrap-break-word sm:px-12 sm:py-14">
          <h1 className="display text-[clamp(2rem,4vw,3rem)] text-fg">
            {title}
          </h1>
          <p className="font-ui mt-2 text-sm text-fg-muted">
            Last updated {lastUpdated}
          </p>

          <div className="mt-6 border-l-2 border-chrome/40 pl-4 text-sm leading-relaxed text-fg-muted sm:mt-8">
            {scopeNote}
          </div>

          <div className="mt-8 space-y-8 text-base leading-relaxed text-fg-muted sm:mt-10 [&_a]:transition-colors [&_a]:duration-200 [&_a:hover]:text-chrome-strong">
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
      <motion.h2
        style={{ y: reduced ? 0 : headingY }}
        className="display text-xl text-fg sm:text-2xl"
      >
        {heading}
      </motion.h2>
      <motion.span
        aria-hidden="true"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: inView ? 1 : 0 }}
        transition={{ duration: DURATION.entrance, ease: EASE_OUT, delay: 0.15 }}
        className="chrome-fill mt-2 block h-px w-14 origin-left"
      />
      <div className="mt-3 space-y-3">{children}</div>
    </motion.section>
  )
}
