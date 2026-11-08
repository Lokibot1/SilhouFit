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
    <div className="sticky top-28 hidden self-start xl:block">
    <nav
      aria-label="On this page"
      className="max-h-[calc(100svh-9rem)] overflow-y-auto border border-kral-rule p-3"
    >
      <span className="block px-3 pt-2 pb-3 text-xs font-medium tracking-[0.08em] text-kral-fg uppercase">
        (On this page)
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
                  className="absolute top-1.5 bottom-1.5 left-0 w-0.5 bg-kral-red"
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
                className={`flex min-h-11 items-center px-3 py-2 text-sm leading-snug transition-colors duration-200 ease-out motion-reduce:transition-none kral-focus ${
                  isActive ? 'font-medium text-kral-fg' : 'text-kral-muted hover:text-kral-fg'
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
