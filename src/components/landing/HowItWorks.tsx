import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useScrollSpy } from '../../hooks/useScrollSpy'
import { Reveal } from '../../motion/Reveal'
import { DURATION, EASE_OUT } from '../../motion/tokens'

const STEPS = [
  {
    title: 'Browse the catalog',
    detail:
      'Product pages show what is in stock at the connected boutique, pulled from the same inventory the register uses.',
    tag: 'Storefront',
  },
  {
    title: 'Preview the fit',
    detail:
      'Turn on the camera to see the garment scaled to your body before adding it to the cart.',
    tag: 'AR fitting',
  },
  {
    title: 'Choose how to receive it',
    detail:
      'Check out for delivery, or reserve online and pick up in the store the same day.',
    tag: 'Delivery or BOPIS',
  },
  {
    title: 'Store and site stay in sync',
    detail:
      'The sale updates inventory across channels immediately, so the next shopper sees accurate stock.',
    tag: 'Inventory',
  },
]

function AccordionBody({
  isOpen,
  children,
}: {
  isOpen: boolean
  children: React.ReactNode
}) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [maxHeight, setMaxHeight] = useState(0)

  useEffect(() => {
    function measure() {
      if (isOpen && innerRef.current) {
        setMaxHeight(innerRef.current.scrollHeight)
      } else {
        setMaxHeight(0)
      }
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [isOpen])

  return (
    <div
      style={{ maxHeight }}
      className="overflow-hidden transition-[max-height] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
    >
      <div ref={innerRef} className="pt-3 pl-[calc(3rem+1.5rem)]">
        {children}
      </div>
    </div>
  )
}

export function HowItWorks() {
  const { activeIndex, setItemRef } = useScrollSpy(STEPS.length)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const effectiveIndex = hoverIndex ?? activeIndex

  function focusStep(index: number) {
    setHoverIndex(index)
    document
      .getElementById(`step-${index}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <section id="how-it-works" className="relative scroll-mt-28">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <h2 className="display max-w-2xl text-[clamp(2rem,4.5vw,3.75rem)] text-fg drop-shadow-sm">
            From browsing to pickup
          </h2>
        </Reveal>

        {/* No per-row entrance here. This section's motion is the scroll
            position itself choosing a step, and a fifth copy of the page's
            reveal would bury that. */}
        <ol className="mt-14 border-t border-line">
          {STEPS.map((step, index) => {
            const isActive = index === effectiveIndex

            return (
              <li
                key={step.title}
                id={`step-${index}`}
                ref={setItemRef(index)}
                onMouseEnter={() => setHoverIndex(index)}
                onMouseLeave={() => setHoverIndex(null)}
                className="relative border-b border-line py-8"
              >
                {/* The step's own rule extends across as it takes focus: the
                    same travelling measure-edge the headings use, borrowed by
                    a line that was already in the layout. */}
                <motion.span
                  aria-hidden="true"
                  initial={false}
                  animate={{ scaleX: isActive ? 1 : 0 }}
                  transition={{ duration: DURATION.shift, ease: EASE_OUT }}
                  className="chrome-fill absolute -bottom-px left-0 h-px w-full origin-left"
                />
                <h3 className="contents">
                  <button
                    type="button"
                    onClick={() => focusStep(index)}
                    onFocus={() => setHoverIndex(index)}
                    onBlur={() => setHoverIndex(null)}
                    aria-expanded={isActive}
                    className="grid w-full grid-cols-[3rem_1fr] items-baseline gap-x-6 gap-y-1 text-left sm:grid-cols-[3rem_1fr_auto]"
                  >
                    <span
                      className={`font-mono text-sm tabular-nums transition-colors duration-500 ${
                        isActive
                          ? 'text-chrome-strong'
                          : 'text-fg/35'
                      }`}
                      aria-hidden="true"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span
                      className={`display text-[clamp(1.5rem,3vw,2.25rem)] transition-colors duration-500 ${
                        isActive
                          ? 'text-fg'
                          : 'text-fg/40'
                      }`}
                    >
                      {step.title}
                    </span>
                    <span className="font-ui col-start-2 text-sm text-fg-muted sm:col-start-3 sm:row-start-1 sm:justify-self-end">
                      {step.tag}
                    </span>
                  </button>
                </h3>
                <AccordionBody isOpen={isActive}>
                  <p className="max-w-2xl text-base leading-relaxed text-fg-muted">
                    {step.detail}
                  </p>
                </AccordionBody>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
