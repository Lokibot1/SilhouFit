import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { PULL_HOLD, PULL_SLOP, pullArmed, pullOffset, pullProgress } from '../../utils/pullToRefresh'
import { SpinnerIcon } from '../form/icons'

const SPRING = 'transform 600ms cubic-bezier(0.34, 1.56, 0.64, 1)'
const MIN_SPIN_MS = 700
// Touches that start here keep their own gesture.
const OWN_GESTURE = 'input, textarea, select, canvas, [contenteditable="true"], [data-no-pull]'

const scrollsX = (el: Element) => el.scrollWidth > el.clientWidth && /auto|scroll/.test(getComputedStyle(el).overflowX)
const scrollsY = (el: Element) => el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)

/**
 * Pull down on a phone to run `onRefresh` (the page's own retry/reload). Small touch screens only; the page keeps its
 * Try again buttons, since a gesture is not available to everyone. Wrap the data part of a page, not forms or canvases.
 */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => unknown; children: ReactNode }) {
  const small = useMediaQuery('(max-width: 767px)')
  const touch = useMediaQuery('(pointer: coarse)')
  const enabled = small && touch
  const body = useRef<HTMLDivElement>(null)
  const dial = useRef<HTMLDivElement>(null)
  const refresh = useRef(onRefresh)
  const [status, setStatus] = useState('')

  useEffect(() => {
    refresh.current = onRefresh
  })

  useEffect(() => {
    const content = body.current
    const spinner = dial.current
    const wrap = content?.parentElement
    if (!enabled || !wrap || !content || !spinner) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // The page scrolls in the window, so the native pull-to-refresh and bounce are stopped on the root.
    document.documentElement.style.overscrollBehaviorY = 'contain'

    let start: { x: number; y: number } | null = null
    let pulling = false
    let busy = false
    let armed = false
    let settle = 0
    // The fixed or sticky bar that covers the top of the page: the spinner sits below it, in the gap the pull opens.
    let inset = 0

    // transform and opacity only, so the pull stays on the compositor. Reduced motion: the spinner moves, the page does not.
    function paint(offset: number, spin: boolean) {
      const p = pullProgress(offset)
      content!.style.transform = reduce ? '' : `translateY(${offset}px)`
      spinner!.style.opacity = String(spin ? 1 : p)
      spinner!.style.transform = `translateY(${inset + (reduce ? 12 : offset / 2 - 16)}px) scale(${0.6 + 0.4 * p}) rotate(${spin ? 0 : p * 270}deg)`
    }

    function rest() {
      window.clearTimeout(settle)
      content!.style.transition = reduce ? 'none' : SPRING
      paint(0, false)
      // Once the overshoot has settled the transform goes, so fixed children are unaffected at rest.
      settle = window.setTimeout(
        () => {
          content!.style.transition = ''
          content!.style.transform = ''
          content!.style.willChange = ''
        },
        reduce ? 0 : 650,
      )
    }

    function blocked(target: Element) {
      if (target.closest(OWN_GESTURE) || document.querySelector('[aria-modal="true"], dialog[open]')) return true
      if (window.scrollY > 0) return true
      for (let el: Element | null = target; el && el !== wrap!.parentElement; el = el.parentElement) {
        if (scrollsX(el) || (scrollsY(el) && el.scrollTop > 0)) return true
      }
      return false
    }

    function end(release: boolean) {
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onCancel)
      const run = release && pulling && armed
      const wasPulling = pulling
      start = null
      pulling = false
      armed = false
      spinner!.style.willChange = ''
      if (!wasPulling) return
      if (!run) return rest()
      busy = true
      setStatus('Refreshing')
      content!.style.transition = reduce ? 'none' : SPRING
      paint(PULL_HOLD, true)
      spinner!.dataset.spin = 'true'
      const spin = new Promise((done) => window.setTimeout(done, MIN_SPIN_MS))
      void Promise.all([Promise.resolve(refresh.current()).catch(() => undefined), spin]).then(() => {
        busy = false
        delete spinner!.dataset.spin
        setStatus('Updated')
        rest()
      })
    }
    const onEnd = () => end(true)
    const onCancel = () => end(false)

    function move(e: TouchEvent) {
      if (!start) return
      const dy = e.touches[0].clientY - start.y
      const dx = e.touches[0].clientX - start.x
      if (!pulling) {
        // Upward, sideways or a diagonal drag is a scroll or a swipe: leave it alone.
        if (Math.max(Math.abs(dy), Math.abs(dx)) < PULL_SLOP) return
        if (dy <= 0 || dy < Math.abs(dx) * 1.5) return end(false)
        pulling = true
        let bar = document.elementFromPoint(window.innerWidth / 2, 1)
        while (bar && !/fixed|sticky/.test(getComputedStyle(bar).position)) bar = bar.parentElement
        inset = bar ? Math.max(0, bar.getBoundingClientRect().bottom - wrap!.getBoundingClientRect().top) : 0
        window.clearTimeout(settle)
        content!.style.transition = 'none'
        content!.style.willChange = 'transform'
        spinner!.style.willChange = 'transform, opacity'
      }
      if (e.cancelable) e.preventDefault()
      const offset = pullOffset(dy - PULL_SLOP)
      armed = pullArmed(offset)
      spinner!.dataset.armed = String(armed)
      paint(offset, false)
    }

    function onStart(e: TouchEvent) {
      if (busy || e.touches.length !== 1 || !(e.target instanceof Element) || blocked(e.target)) return
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      setStatus('')
      // Non-passive only while a pull may start, so ordinary scrolling is never held up.
      window.addEventListener('touchmove', move, { passive: false })
      window.addEventListener('touchend', onEnd)
      window.addEventListener('touchcancel', onCancel)
    }

    wrap.addEventListener('touchstart', onStart, { passive: true })
    return () => {
      window.clearTimeout(settle)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onCancel)
      wrap.removeEventListener('touchstart', onStart)
      document.documentElement.style.overscrollBehaviorY = ''
      content.style.transform = ''
      content.style.transition = ''
    }
  }, [enabled])

  return (
    <div className="relative">
      {enabled && (
        <div
          ref={dial}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-1/2 z-10 -ml-4 flex size-8 items-center justify-center text-kral-muted opacity-0 data-[armed=true]:text-kral-fg [&_svg]:animate-none data-[spin=true]:[&_svg]:animate-spin"
        >
          <SpinnerIcon size={20} />
        </div>
      )}
      <div ref={body}>{children}</div>
      {enabled && (
        <p role="status" aria-live="polite" className="sr-only">
          {status}
        </p>
      )}
    </div>
  )
}
