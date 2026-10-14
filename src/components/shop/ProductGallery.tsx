import { useRef, useState, type PointerEvent } from 'react'
import { productImages, type Product } from '../../data/products'
import { ChevronLeftIcon, ChevronRightIcon, HeartIcon } from '../form/icons'
import { SilhouetteMark } from '../landing/SilhouetteMark'

// Same hover reveal as the shop cards: controls fade in on hover or keyboard focus, and stay visible on touch.
const REVEAL =
  'opacity-0 transition-[opacity,translate] duration-500 ease-in-out group-hover/img:opacity-100 group-has-focus-visible/img:opacity-100 pointer-coarse:opacity-100'
// Below lg the chevrons give way to swiping: hidden and untappable, but still there for keyboard focus.
const SWIPED = 'max-lg:pointer-events-none max-lg:opacity-0! max-lg:focus-visible:pointer-events-auto max-lg:focus-visible:opacity-100!'
const DRIFT =
  'transition-transform duration-500 ease-in-out group-hover/img:translate-x-0 group-has-focus-visible/img:translate-x-0 pointer-coarse:translate-x-0'

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
  function swipeStart(e: PointerEvent<HTMLDivElement>) {
    if (!multi || window.matchMedia('(min-width: 64rem)').matches || (e.pointerType === 'mouse' && e.button !== 0)) return
    swipe.current = { id: e.pointerId, x: e.clientX, at: Date.now(), locked: false }
  }
  function swipeMove(e: PointerEvent<HTMLDivElement>) {
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
    // Below lg the thumbnails sit in a column beside the photo so the photo can use the whole height left over.
    <div className="mx-auto flex min-h-0 w-full flex-1 items-center gap-2 max-lg:min-h-28 max-lg:justify-center lg:h-full lg:flex-none lg:flex-col lg:gap-0">
      <div className="flex w-full justify-center max-lg:contents lg:min-h-0 lg:flex-1">
      <div
        onPointerDown={swipeStart}
        onPointerMove={swipeMove}
        onPointerUp={swipeEnd}
        onPointerCancel={swipeEnd}
        className="group/img relative aspect-4/5 h-full w-auto max-w-full touch-pan-y overflow-hidden rounded-2xl border border-line bg-canvas-sub select-none"
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
                className="flex size-full shrink-0 flex-col items-center justify-center gap-2 p-3 text-center text-fg-muted"
              >
                <SilhouetteMark className="w-10 text-fg-muted" />
                <span className="font-ui text-xs">{name}</span>
              </div>
            ) : (
              <img
                key={image}
                src={image}
                alt={i === 0 ? product.alt : `${product.alt} (view ${i + 1} of ${images.length})`}
                decoding="async"
                draggable={false}
                onError={() => setFailed((f) => [...f, image])}
                className="photo-mono size-full shrink-0 object-cover"
              />
            ),
          )}
        </div>

        <button
          type="button"
          onClick={() => onToggleSaved(product)}
          aria-pressed={saved}
          aria-label={`Save ${name} to wishlist`}
          className="absolute top-0 right-0 flex size-11 items-center justify-center text-fg"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-canvas">
            <HeartIcon filled={saved} />
          </span>
        </button>

        {multi && (
          <>
            <button
              type="button"
              onClick={step(-1)}
              aria-label="Previous image"
              className={`absolute top-1/2 left-0 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center text-fg ${REVEAL} ${SWIPED}`}
            >
              <span className={`flex size-8 -translate-x-2 items-center justify-center rounded-full bg-canvas ${DRIFT}`}>
                <ChevronLeftIcon />
              </span>
            </button>
            <button
              type="button"
              onClick={step(1)}
              aria-label="Next image"
              className={`absolute top-1/2 right-0 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center text-fg ${REVEAL} ${SWIPED}`}
            >
              <span className={`flex size-8 translate-x-2 items-center justify-center rounded-full bg-canvas ${DRIFT}`}>
                <ChevronRightIcon />
              </span>
            </button>
            <ol
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 bottom-4 flex translate-y-1.5 justify-center gap-1.5 group-hover/img:translate-y-0 group-has-focus-visible/img:translate-y-0 pointer-coarse:translate-y-0 max-lg:translate-y-0 max-lg:opacity-100 ${REVEAL}`}
            >
              {images.map((image, i) => (
                <li
                  key={image}
                  className={`size-1.5 rounded-full bg-canvas transition-opacity duration-200 ${i === current ? 'opacity-100' : 'opacity-50'}`}
                />
              ))}
            </ol>
          </>
        )}

        {multi && (
          <p className="font-ui absolute right-3 bottom-3 rounded-full bg-canvas px-2 py-0.5 text-xs text-fg tabular-nums">
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
        <ul className="flex max-w-full shrink-0 gap-2 overflow-x-auto p-1 max-lg:order-first max-lg:max-h-full max-lg:flex-col max-lg:overflow-x-hidden max-lg:overflow-y-auto lg:mt-3 lg:overflow-visible lg:p-0">
          {images.map((image, i) => (
            <li key={image} className="shrink-0">
              <button
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`Show view ${i + 1} of ${images.length}`}
                aria-current={i === current}
                className={`block aspect-4/5 w-11 cursor-pointer lg:w-20 overflow-hidden rounded-xl border-2 bg-canvas-sub focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chrome-strong ${
                  i === current ? 'border-fg' : 'border-line'
                }`}
              >
                {!failed.includes(image) && (
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={() => setFailed((f) => [...f, image])}
                    className="photo-mono size-full object-cover"
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
