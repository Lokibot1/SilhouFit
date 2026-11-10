import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { productImages, type Product } from '../../data/products'
import { ChevronLeftIcon, ChevronRightIcon, HeartIcon } from '../form/icons'
import { SilhouetteMark } from '../landing/SilhouetteMark'

// Same hover reveal as the KRAL shop cards: controls fade in on hover or keyboard focus, and stay visible on touch.
const REVEAL =
  'opacity-0 transition-opacity duration-200 ease-out group-hover/img:opacity-100 group-has-focus-visible/img:opacity-100 pointer-coarse:opacity-100 motion-reduce:transition-none'
// Below lg the chevrons give way to swiping: hidden and untappable, but still there for keyboard focus.
const SWIPED = 'max-lg:pointer-events-none max-lg:opacity-0! max-lg:focus-visible:pointer-events-auto max-lg:focus-visible:opacity-100!'

// Magnifier scale, how long a touch must hold to zoom, and how far it may drift (px) before it counts as a swipe.
const ZOOM = 2.5
const HOLD_MS = 450
const MOVE_TOLERANCE = 8

interface ProductGalleryProps {
  product: Product
  saved: boolean
  onToggleSaved: (product: Product) => void
}

/** The main photo with a thumbnail strip beneath it and the wishlist heart on the photo. */
export function ProductGallery({ product, saved, onToggleSaved }: ProductGalleryProps) {
  const { name } = product
  const images = productImages(product)
  const [current, setCurrent] = useState(0)
  const [failed, setFailed] = useState<string[]>([])
  const multi = images.length > 1
  // Wraps around at both ends.
  const step = (by: number) => () => setCurrent((c) => (c + by + images.length) % images.length)

  // Below lg the photo is swiped instead: it follows the finger, then snaps on a quarter of its width or a quick flick.
  // The ends do not wrap and resist the drag.
  const swipe = useRef<{ id: number; x: number; at: number; locked: boolean } | null>(null)
  const [dragX, setDragX] = useState<number | null>(null)
  const offset = (e: PointerEvent<HTMLDivElement>) => {
    const raw = e.clientX - (swipe.current?.x ?? e.clientX)
    return (current === 0 && raw > 0) || (current === images.length - 1 && raw < 0) ? raw * 0.3 : raw
  }
  // Zoom: a mouse hover follows the pointer; on touch a long press zooms in, dragging pans, letting go zooms out.
  // Zoom stays at its last origin when it turns off so the image shrinks back towards where it was.
  const [zoom, setZoom] = useState({ x: 50, y: 50, active: false })
  const photo = useRef<HTMLDivElement>(null)
  const press = useRef<{ id: number; x: number; y: number; timer: number; active: boolean } | null>(null)
  const spot = (el: HTMLElement, e: PointerEvent) => {
    const r = el.getBoundingClientRect()
    // Clamped, so a finger dragged past the photo's edge never slides the image off its box.
    const pct = (value: number) => Math.min(100, Math.max(0, value * 100))
    return { x: pct((e.clientX - r.left) / r.width), y: pct((e.clientY - r.top) / r.height), active: true }
  }
  const releasePress = () => {
    if (!press.current) return
    window.clearTimeout(press.current.timer)
    press.current = null
    setZoom((z) => ({ ...z, active: false }))
  }
  // Once the long press has fired, stop the browser scrolling the page under the panning finger.
  useEffect(() => {
    const el = photo.current
    const block = (e: TouchEvent) => {
      if (press.current?.active) e.preventDefault()
    }
    el?.addEventListener('touchmove', block, { passive: false })
    return () => {
      el?.removeEventListener('touchmove', block)
      window.clearTimeout(press.current?.timer)
    }
  }, [])

  function swipeStart(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse' && !(e.target as HTMLElement).closest('button')) {
      const el = e.currentTarget
      const { clientX: x, clientY: y, pointerId: id } = e
      const origin = spot(el, e)
      window.clearTimeout(press.current?.timer)
      press.current = {
        id,
        x,
        y,
        active: false,
        timer: window.setTimeout(() => {
          if (!press.current) return
          press.current.active = true
          setZoom(origin)
        }, HOLD_MS),
      }
    }
    if (!multi || window.matchMedia('(min-width: 64rem)').matches || (e.pointerType === 'mouse' && e.button !== 0)) return
    swipe.current = { id: e.pointerId, x: e.clientX, at: Date.now(), locked: false }
  }
  function swipeMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse') {
      if (swipe.current?.locked || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
      if ((e.target as HTMLElement).closest('button')) setZoom((z) => ({ ...z, active: false }))
      else setZoom(spot(e.currentTarget, e))
    }
    const p = press.current
    if (p && p.id === e.pointerId) {
      if (p.active) return setZoom(spot(e.currentTarget, e))
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) >= MOVE_TOLERANCE) releasePress()
    }
    const s = swipe.current
    if (!s || s.id !== e.pointerId) return
    if (!s.locked) {
      if (Math.abs(e.clientX - s.x) < 8) return
      s.locked = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    setDragX(offset(e))
  }
  function swipeEnd(e: PointerEvent<HTMLDivElement>) {
    if (press.current?.id === e.pointerId) releasePress()
    const s = swipe.current
    if (!s || s.id !== e.pointerId) return
    swipe.current = null
    setDragX(null)
    if (!s.locked || e.type === 'pointercancel') return
    const moved = e.clientX - s.x
    const far = Math.abs(moved) > e.currentTarget.offsetWidth * 0.25
    const flick = Math.abs(moved) > 30 && Date.now() - s.at < 300
    if (far || flick) setCurrent((c) => Math.min(images.length - 1, Math.max(0, c + (moved < 0 ? 1 : -1))))
  }

  return (
    // The photo takes the height left over by the thumbnails; its width follows from the 4:5 ratio.
    // Below lg the photo is full width (capped on tablets) at 4:5, with the thumbnails wrapped beneath it.
    <div className="mx-auto flex min-h-0 w-full flex-1 items-center gap-2 max-lg:flex-none max-lg:flex-col lg:h-full lg:flex-none lg:flex-col lg:gap-0">
      <div className="flex w-full justify-center max-lg:max-w-md lg:min-h-0 lg:flex-1">
      <div
        onPointerDown={swipeStart}
        onPointerMove={swipeMove}
        onPointerUp={swipeEnd}
        onPointerCancel={swipeEnd}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setZoom((z) => ({ ...z, active: false }))}
        onContextMenu={(e) => press.current && e.preventDefault()}
        ref={photo}
        className="group/img relative aspect-4/5 h-full w-auto max-w-full touch-pan-y max-lg:h-auto max-lg:w-full overflow-hidden bg-kral-porcelain select-none [-webkit-touch-callout:none] pointer-fine:cursor-zoom-in dark:bg-kral-graphite"
      >
        {/* Same sliding track as the shop cards. */}
        <div
          className={`flex size-full ${dragX === null ? 'transition-transform duration-350 ease-[cubic-bezier(0.16,1,0.3,1)]' : ''}`}
          style={{ transform: `translateX(calc(-${current * 100}% + ${dragX ?? 0}px))` }}
        >
          {images.map((image, i) =>
            failed.includes(image) ? (
              <div
                key={image}
                role="img"
                aria-label={`${name} (photo unavailable)`}
                className="flex size-full shrink-0 flex-col items-center justify-center gap-2 p-3 text-center text-kral-muted"
              >
                <SilhouetteMark className="w-10 text-kral-muted [&>path]:[stroke-width:2px] [&>path]:[vector-effect:non-scaling-stroke] [&>path:last-of-type]:hidden" />
                <span className="font-kral-mono text-xs uppercase">{name}</span>
              </div>
            ) : (
              <img
                key={image}
                src={image}
                alt={i === 0 ? product.alt : `${product.alt} (view ${i + 1} of ${images.length})`}
                decoding="async"
                draggable={false}
                onError={() => setFailed((f) => [...f, image])}
                style={
                  i === current
                    ? { transform: `scale(${zoom.active ? ZOOM : 1})`, transformOrigin: `${zoom.x}% ${zoom.y}%` }
                    : undefined
                }
                className="size-full shrink-0 object-cover transition-transform duration-200 ease-out motion-reduce:transition-none"
              />
            ),
          )}
        </div>

        <button
          type="button"
          onClick={() => onToggleSaved(product)}
          aria-pressed={saved}
          aria-label={`Save ${name} to wishlist`}
          className="kral-focus group/heart absolute top-0 right-0 flex size-11 items-center justify-center text-kral-fg"
        >
          <span className="flex size-8 items-center justify-center transition-colors duration-150 ease-out group-hover/heart:bg-kral-fg/10 motion-reduce:transition-none">
            <HeartIcon filled={saved} />
          </span>
        </button>

        {multi && (
          <>
            <button
              type="button"
              onClick={step(-1)}
              aria-label="Previous image"
              className={`kral-focus absolute top-1/2 left-0 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center text-kral-fg ${REVEAL} ${SWIPED}`}
            >
              <span className="flex size-8 items-center justify-center bg-kral-bg">
                <ChevronLeftIcon />
              </span>
            </button>
            <button
              type="button"
              onClick={step(1)}
              aria-label="Next image"
              className={`kral-focus absolute top-1/2 right-0 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center text-kral-fg ${REVEAL} ${SWIPED}`}
            >
              <span className="flex size-8 items-center justify-center bg-kral-bg">
                <ChevronRightIcon />
              </span>
            </button>
            <ol
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 bottom-4 flex justify-center gap-1.5 max-lg:opacity-100 ${REVEAL}`}
            >
              {images.map((image, i) => (
                <li
                  key={image}
                  className={`size-1.5 bg-kral-bg transition-opacity duration-200 motion-reduce:transition-none ${i === current ? 'opacity-100' : 'opacity-50'}`}
                />
              ))}
            </ol>
          </>
        )}

        {multi && (
          <p className="font-kral-mono absolute right-3 bottom-3 bg-kral-bg px-2 py-0.5 text-xs tracking-[0.08em] text-kral-fg tabular-nums">
            <span className="sr-only" aria-live="polite">
              Image {current + 1} of {images.length}
            </span>
            <span aria-hidden="true">
              {current + 1}/{images.length}
            </span>
          </p>
        )}
      </div>
      </div>

      {multi && (
        <ul className="flex max-w-full shrink-0 flex-wrap gap-2 p-1 lg:mt-3 lg:p-0">
          {images.map((image, i) => (
            <li key={image} className="shrink-0">
              <button
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`Show view ${i + 1} of ${images.length}`}
                aria-current={i === current}
                className={`kral-focus block aspect-4/5 w-14 cursor-pointer overflow-hidden border-2 bg-kral-porcelain transition-colors duration-150 ease-out motion-reduce:transition-none lg:w-20 dark:bg-kral-graphite ${
                  i === current ? 'border-kral-fg' : 'border-transparent hover:border-kral-muted'
                }`}
              >
                {!failed.includes(image) && (
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={() => setFailed((f) => [...f, image])}
                    className="size-full object-cover"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
