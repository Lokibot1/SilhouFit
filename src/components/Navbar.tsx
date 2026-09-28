import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
} from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMagnetic } from '../hooks/useMagnetic'
import { DURATION, EASE_OUT } from '../motion/tokens'
import { SilhouetteMark } from './landing/SilhouetteMark'
import { ThemeToggle } from './ThemeToggle'

const NAV_LINKS = [
  { label: 'Capabilities', href: '/#capabilities' },
  { label: 'AR fitting', href: '/#ar-fitting' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'For boutiques', href: '/#boutiques' },
]

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [solid, setSolid] = useState(false)
  const [activeHref, setActiveHref] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const magnetic = useMagnetic<HTMLAnchorElement>()

  const { scrollY, scrollYProgress } = useScroll()
  useMotionValueEvent(scrollY, 'change', (value) => setSolid(value > 24))

  useEffect(() => {
    const sections = NAV_LINKS.map((link) =>
      document.getElementById(link.href.split('#')[1]),
    ).filter((el): el is HTMLElement => el !== null)
    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveHref(`/#${entry.target.id}`)
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!menuOpen) return

    const panel = menuRef.current
    const focusable = panel?.querySelectorAll<HTMLElement>(
      'a, button:not([disabled])',
    )
    focusable?.[0]?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
        return
      }

      if (event.key !== 'Tab' || !focusable || focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        solid
          ? 'border-b border-ink/10 bg-bone/85 backdrop-blur-md dark:border-white/10 dark:bg-ink/85'
          : 'border-b border-transparent'
      }`}
    >
      <nav
        aria-label="Primary"
        className={`mx-auto flex max-w-6xl items-center justify-between px-6 transition-[padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          solid ? 'py-3' : 'py-5'
        }`}
      >
        <Link
          to="/"
          className="group flex items-center gap-3"
          onClick={() => setMenuOpen(false)}
        >
          <SilhouetteMark className="h-8 w-6 text-ink dark:text-bone" />
          <span className="leading-none">
            <span className="font-display block text-[17px] font-bold tracking-[-0.02em] text-ink dark:text-bone">
              SilhouFit
            </span>
            <span className="font-ui block text-[9px] tracking-[0.22em] text-ink/50 uppercase transition-colors group-hover:text-bronze dark:text-bone/50 dark:group-hover:text-bronze-light">
              Omnichannel apparel
            </span>
          </span>
        </Link>

        <div className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => {
            const isActive = activeHref === link.href
            return (
              <a
                key={link.href}
                href={link.href}
                aria-current={isActive ? 'true' : undefined}
                className={`font-ui relative text-[11px] tracking-[0.16em] uppercase transition-colors ${
                  isActive
                    ? 'text-ink dark:text-bone'
                    : 'text-ink/55 hover:text-ink dark:text-bone/55 dark:hover:text-bone'
                }`}
              >
                {link.label}
                <span
                  className={`absolute -bottom-2 left-0 h-px bg-bronze transition-[width,opacity] duration-500 ease-out dark:bg-bronze-light ${
                    isActive ? 'w-full opacity-100' : 'w-0 opacity-0'
                  }`}
                />
              </a>
            )
          })}

          <ThemeToggle />

          <a
            ref={magnetic.ref}
            href="/#contact"
            onPointerMove={magnetic.handlePointerMove}
            onPointerLeave={magnetic.handlePointerLeave}
            className="pill bg-ink font-medium text-bone hover:bg-bronze dark:bg-bone dark:text-ink dark:hover:bg-bronze-light"
          >
            Talk to us
          </a>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggle />
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="pill glass-btn glass text-ink dark:text-bone"
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </nav>

      <motion.div
        aria-hidden="true"
        style={{ scaleX: scrollYProgress }}
        className="absolute inset-x-0 bottom-0 h-px origin-left bg-bronze dark:bg-bronze-light"
      />

      <AnimatePresence initial={false}>
        {menuOpen && (
          <motion.div
            id="mobile-menu"
            ref={menuRef}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DURATION.state, ease: EASE_OUT }}
            className="overflow-hidden border-t border-ink/10 bg-bone lg:hidden dark:border-white/10 dark:bg-ink"
          >
            <div className="px-6 pt-4 pb-8">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="font-display block border-b border-ink/10 py-4 text-2xl font-semibold tracking-[-0.02em] text-ink dark:border-white/10 dark:text-bone"
                >
                  {link.label}
                </a>
              ))}
              <a
                href="/#contact"
                onClick={() => setMenuOpen(false)}
                className="pill mt-6 bg-ink font-medium text-bone dark:bg-bone dark:text-ink"
              >
                Talk to us
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
