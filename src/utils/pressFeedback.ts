// Standard press feedback: sink to 0.95 fast and linear, spring back with a small overshoot.
// Uses Web Animations on the individual `scale` property so it composes with each element's own
// transform hover-lift and never replaces its CSS transition list (Tailwind transition-* utilities).
const TAPPABLE = 'button, a, summary, [role="button"], [role="tab"], [role="menuitem"], [role="option"], .press'
const OPT_OUT = ':disabled, [aria-disabled="true"], [role="slider"], [data-no-press]'
const SINK_MS = 80
const SPRING_MS = 700
// A damped spring sampled as keyframes: one overshoot to 1.04, a small undershoot, settled by the end. A single
// cubic-bezier (0.34, 1.56, 0.64, 1) only overshoots about 1.005 from 0.95, too little to see.
const SPRING = [
  { scale: 0.95, offset: 0 },
  { scale: 1.04, offset: 0.3 },
  { scale: 0.99, offset: 0.58 },
  { scale: 1.008, offset: 0.8 },
  { scale: 1, offset: 1 },
]

export function installPressFeedback() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
  let held: { el: HTMLElement; sink: Animation } | null = null

  const release = () => {
    if (!held) return
    const { el, sink } = held
    held = null
    sink.cancel()
    el.animate(
      reduce.matches ? [{ opacity: 0.85 }, { opacity: 1 }] : SPRING,
      { duration: reduce.matches ? 150 : SPRING_MS, easing: 'ease-in-out' },
    )
  }

  document.addEventListener(
    'pointerdown',
    (e) => {
      release()
      if (e.button > 0 || !(e.target instanceof Element)) return
      const el = e.target.closest<HTMLElement>(TAPPABLE)
      if (!el || el.matches(OPT_OUT) || el.closest('canvas, fieldset:disabled')) return
      if (getComputedStyle(el).scale !== 'none') return // owns its own scale
      const r = el.getBoundingClientRect()
      // Full-screen backdrops and dismiss layers stay put.
      if (r.width > innerWidth * 0.6 && r.height > innerHeight * 0.6) return
      const frames = reduce.matches ? [{ opacity: 0.85 }] : [{ scale: 0.95 }]
      held = { el, sink: el.animate(frames, { duration: SINK_MS, easing: 'linear', fill: 'forwards' }) }
    },
    true,
  )
  for (const type of ['pointerup', 'pointercancel', 'dragstart']) document.addEventListener(type, release, true)
}
