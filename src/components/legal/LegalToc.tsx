import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { headingId } from '../../utils/headingId'

export function LegalToc({ headings }: { headings: string[] }) {
  const [active, setActive] = useState(headings[0] ?? '')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.getAttribute('data-heading') ?? '')
        }
      },
      { rootMargin: '-25% 0px -65% 0px' },
    )
    headings.forEach((heading) => {
      const el = document.getElementById(headingId(heading))
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [headings])

  return (
    // Sticky on a plain wrapper: .glass-card sets its own position.
    <div className="sticky top-28 hidden self-start xl:block">
    <nav
      aria-label="On this page"
      className="glass-card max-h-[calc(100svh-9rem)] overflow-y-auto rounded-2xl p-3"
    >
      <span className="font-ui block px-3 pt-2 pb-3 text-[11px] font-semibold tracking-[0.14em] text-fg uppercase">
        On this page
      </span>
      <ul>
        {headings.map((heading) => {
          const isActive = active === heading
          return (
            <li key={heading} className="relative">
              {isActive && (
                <motion.span
                  layoutId="legal-toc-active"
                  aria-hidden="true"
                  transition={{ duration: DURATION.shift, ease: EASE_OUT }}
                  className="chrome-fill absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full"
                />
              )}
              <a
                href={`#${headingId(heading)}`}
                aria-current={isActive ? 'location' : undefined}
                onClick={(event) => {
                  event.preventDefault()
                  document
                    .getElementById(headingId(heading))
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className={`font-ui block rounded-lg px-3 py-1.5 text-[13px] leading-snug transition-colors duration-200 ${
                  isActive ? 'text-fg' : 'text-fg-muted hover:text-chrome-strong'
                }`}
              >
                {heading}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
    </div>
  )
}
