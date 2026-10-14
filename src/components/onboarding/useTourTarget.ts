import { useEffect, useRef, useState } from 'react'

export interface Box {
  top: number
  left: number
  width: number
  height: number
}

export type TourTarget = { status: 'searching' } | { status: 'missing' } | { status: 'found'; box: Box; key: string }

const SEARCHING: TourTarget = { status: 'searching' }
const MISSING: TourTarget = { status: 'missing' }
/** How long to wait for a target that renders late (a page still loading) before giving up on it. */
const WAIT_MS = 3000
/** Layout and scrolling settle for a moment after a stop opens, so the box is re-measured every frame for this long. */
const SETTLE_MS = 700

/** Room the spotlight keeps around its target. */
export const PAD = 8
/** The top bar's height, and the gap the card keeps from the screen edge and from the free area. */
const HEADER = 72
const EDGE = 12

/** The card sits above a target in the lower half of the screen and below one in the upper half. */
export const dockFor = (center: number, viewport: number): 'top' | 'bottom' => (center > viewport / 2 ? 'top' : 'bottom')

/** The vertical band the card leaves free for the target when it is docked on `dock`. */
export function freeArea(dock: 'top' | 'bottom', cardHeight: number, viewport: number) {
  return dock === 'top'
    ? { top: HEADER + cardHeight + EDGE, bottom: viewport - EDGE }
    : { top: HEADER, bottom: viewport - EDGE - cardHeight - EDGE }
}

function isVisible(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden'
}

/** The first key that has a visible match wins; all its matches are spotlit together. */
function find(keys: string[]) {
  for (const key of keys) {
    const els = [...document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`)].filter(isVisible)
    if (els.length > 0) return { key, els }
  }
  return null
}

function union(els: HTMLElement[]): Box {
  const rects = els.map((el) => el.getBoundingClientRect())
  const top = Math.min(...rects.map((r) => r.top))
  const left = Math.min(...rects.map((r) => r.left))
  return {
    top,
    left,
    width: Math.max(...rects.map((r) => r.right)) - left,
    height: Math.max(...rects.map((r) => r.bottom)) - top,
  }
}

const sameBox = (a: Box, b: Box) =>
  Math.abs(a.top - b.top) < 0.5 &&
  Math.abs(a.left - b.left) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 &&
  Math.abs(a.height - b.height) < 0.5

/**
 * Finds the element a stop points at (by `data-tour`), scrolls it to the middle of the space the card leaves free
 * (`cardHeight` is the card's height) or, when it is taller than that, to the top of it, and follows it as the page
 * scrolls, resizes or re-renders. Waits a few seconds for it to appear, then reports it missing.
 */
export function useTourTarget(keys: string[], enabled: boolean, cardHeight = 0): TourTarget {
  const keyList = keys.join('|')
  const cardRef = useRef(cardHeight)
  const revealRef = useRef(() => {})
  // The card's height is known after it renders (and changes with its copy), so the target is placed again then.
  useEffect(() => {
    cardRef.current = cardHeight
    revealRef.current()
  }, [cardHeight])
  // The answer belongs to the keys it was found for; new keys start from "searching" without a reset in the effect.
  const id = `${enabled}:${keyList}`
  const [found, setFound] = useState<{ id: string; target: TourTarget }>({ id, target: SEARCHING })
  const target = found.id === id ? found.target : SEARCHING

  useEffect(() => {
    const setTarget = (update: TourTarget | ((current: TourTarget) => TourTarget)) =>
      setFound((current) => ({
        id,
        target: typeof update === 'function' ? update(current.id === id ? current.target : SEARCHING) : update,
      }))
    if (!enabled) return
    const wanted = keyList.split('|')
    let els: HTMLElement[] = []
    let key = ''
    let marked: HTMLElement | null = null
    let frame = 0
    let settleUntil = performance.now() + SETTLE_MS
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const resizes = new ResizeObserver(() => schedule())

    function measure() {
      frame = 0
      if (els.length === 0) return
      if (els.some((el) => !el.isConnected)) {
        search()
        return
      }
      const box = union(els)
      setTarget((current) =>
        current.status === 'found' && current.key === key && sameBox(current.box, box) ? current : { status: 'found', box, key },
      )
      if (performance.now() < settleUntil) schedule()
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure)
    }

    function reveal() {
      if (els.length === 0) return
      const el = els[0]
      const { top, height } = el.getBoundingClientRect()
      const viewport = window.innerHeight
      const free = freeArea(dockFor(top + height / 2, viewport), cardRef.current, viewport)
      el.style.scrollMarginTop = `${free.top + PAD}px`
      el.style.scrollMarginBottom = `${viewport - free.bottom + PAD}px`
      marked = el
      const fits = height + PAD * 2 <= free.bottom - free.top
      el.scrollIntoView({ block: fits ? 'center' : 'start', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
      settleUntil = performance.now() + SETTLE_MS
      schedule()
    }

    function unmark() {
      if (!marked) return
      marked.style.scrollMarginTop = ''
      marked.style.scrollMarginBottom = ''
      marked = null
    }

    function search() {
      const hit = find(wanted)
      if (!hit) {
        if (els.length > 0) {
          els = []
          key = ''
          resizes.disconnect()
          setTarget(SEARCHING)
        }
        return
      }
      const moved = hit.els[0] !== els[0] || hit.key !== key
      els = hit.els
      key = hit.key
      if (moved) {
        unmark()
        resizes.disconnect()
        els.forEach((el) => resizes.observe(el))
        reveal()
      }
      schedule()
    }

    const mutations = new MutationObserver(() => search())
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] })
    const onMove = () => schedule()
    // Capture phase: scrolling inside any container moves the target too.
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    const giveUp = window.setTimeout(() => {
      if (els.length === 0) setTarget(MISSING)
    }, WAIT_MS)
    revealRef.current = reveal
    search()

    return () => {
      revealRef.current = () => {}
      unmark()
      cancelAnimationFrame(frame)
      window.clearTimeout(giveUp)
      mutations.disconnect()
      resizes.disconnect()
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [keyList, enabled, id])

  return target
}

