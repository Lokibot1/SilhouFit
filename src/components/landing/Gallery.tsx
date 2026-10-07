import { useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'

type Piece = { src: string; alt: string; position: string }

// Unsplash License; each trailing comment is the photo ID.
const PIECES: Piece[] = [
  { src: 'white-polo', alt: 'White polo shirt on a wooden hanger', position: '50% 40%' }, // F5i3PZXYkvY
  { src: 'blazer', alt: 'Black blazer hanging on a rustic fence', position: '50% 45%' }, // VsCBt8j-qg4
  { src: 'tank-tops', alt: 'Rail of tank tops in assorted colours', position: '50% 50%' }, // iYqeLjGDk9M
  { src: 'straight-jeans', alt: 'Straight-leg jeans on a hanger', position: '50% 50%' }, // nC4-PXzKZcI
  { src: 'knitwear', alt: 'Stack of folded knit sweaters', position: '40% 50%' }, // 6-HTjxp21xo
  { src: 'dress-shirts', alt: 'White dress shirts on wooden hangers', position: '50% 50%' }, // hMMXhKSZk7k
  { src: 'floral-dresses', alt: 'Rail of floral print dresses', position: '45% 50%' }, // 1lmPFQ7ZXeM
  { src: 'black-tees', alt: 'Black crew-neck t-shirts on hangers', position: '50% 40%' }, // DjCo6_Rr4nE
  { src: 'denim-jacket', alt: 'Denim jacket displayed in a shop', position: '55% 50%' }, // zs6-wsPk8hI
  { src: 'striped-polo', alt: 'Striped rugby polo shirt, close up', position: '50% 50%' }, // 88b_XeVGGE0
  { src: 'dress-on-hanger', alt: 'White gown hanging against a wooden wall', position: '45% 30%' }, // lKHPn48Jju4
  { src: 'jackets-on-hooks', alt: 'Jackets and a cap hanging on wall hooks', position: '55% 45%' }, // 8xTN-V_s6sU
  { src: 'white-tee', alt: 'White t-shirt on a black hanger', position: '48% 45%' }, // TvL5vIgwiwo
  { src: 'sweater-stack', alt: 'Folded wool sweaters in earth tones', position: '50% 50%' }, // 3FQBV3LvrDM
  { src: 'tank-top-outfit', alt: 'White tank top worn with camouflage trousers', position: '50% 35%' }, // JYPTSbq5Kos
  { src: 'jeans-on-hanger', alt: 'Light-wash jeans on a wooden hanger', position: '50% 40%' }, // EtOMMg1nSR8
  { src: 'white-shirt-rail', alt: 'White shirts on a rail against black', position: '40% 50%' }, // e8sbQNYEwX8
  { src: 'folded-jeans', alt: 'Folded jeans stacked on a boot', position: '50% 40%' }, // Arxc2ZOfGRU
]

// Each list cycles at its own length, so the pattern rarely repeats.
const ASPECTS = ['3 / 4', '4 / 5', '2 / 3', '1 / 1', '3 / 4', '5 / 6', '4 / 5']
const WIDTHS = ['100%', '82%', '92%', '76%', '88%']
const GAPS = ['7vh', '12vh', '5vh', '15vh', '9vh', '11vh']
const COLUMN_START = ['0vh', '16vh', '6vh', '24vh']
const COLUMN_DRIFT = [0, -0.07, 0.05, -0.04]

const MIN_SCALE = 0.55

function smoothstep(x: number) {
  const t = Math.min(Math.max(x, 0), 1)
  return t * t * (3 - 2 * t)
}

/** Document-space top, via the offset chain so transforms don't skew it. */
function docTop(el: HTMLElement) {
  let top = 0
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) {
    top += node.offsetTop
  }
  return top
}

/** Editorial archive driven by scroll position in a rAF loop. */
export function Gallery() {
  const reduced = useReducedMotion()
  const isLg = useMediaQuery('(min-width: 1024px)')
  const isMd = useMediaQuery('(min-width: 768px)')
  const columnCount = isLg ? 4 : isMd ? 3 : 2

  const sectionRef = useRef<HTMLElement>(null)
  const columnRefs = useRef<HTMLDivElement[]>([])
  const cardRefs = useRef<HTMLElement[]>([])

  const columns = Array.from({ length: columnCount }, (_, c) =>
    PIECES.map((piece, i) => ({ piece, i })).filter(({ i }) => i % columnCount === c),
  )

  useEffect(() => {
    const section = sectionRef.current
    if (!section || reduced) return

    const cols = columnRefs.current.slice(0, columnCount)
    const cards = cardRefs.current.slice(0, PIECES.length)
    let sectionTop = 0
    let centers: number[] = []

    // Positions are measured once per resize, never per frame.
    const measure = () => {
      sectionTop = docTop(section)
      centers = cards.map((card) => docTop(card) + card.offsetHeight / 2)
      lastY = -1
    }

    let lastY = -1
    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const y = window.scrollY
      if (y === lastY) return
      lastY = y
      const vh = window.innerHeight

      const into = y - sectionTop
      const shifts = cols.map((col, c) => {
        const shift = into * COLUMN_DRIFT[c]
        col.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`
        return shift
      })

      cards.forEach((card, i) => {
        const p = (centers[i] + shifts[i % columnCount] - y) / vh
        // Per-tile nudge (±0.06 of the viewport) to the enter/exit thresholds.
        const j = (((i * 37) % 13) / 12 - 0.5) * 0.12
        const enter = smoothstep((1.1 + j - p) / 0.4)
        const exit = smoothstep((p + 0.1 + j) / 0.4)
        const s = MIN_SCALE + (1 - MIN_SCALE) * Math.min(enter, exit)
        card.style.transform = `scale(${s.toFixed(4)})`
      })
    }

    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(section)
    measure()

    // The loop only runs while the gallery is on screen.
    const inView = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame)
      if (entry.isIntersecting) {
        lastY = -1
        frame = requestAnimationFrame(tick)
      }
    })
    inView.observe(section)

    return () => {
      cancelAnimationFrame(frame)
      inView.disconnect()
      resizeObserver.disconnect()
      cols.forEach((col) => (col.style.transform = ''))
      cards.forEach((card) => (card.style.transform = ''))
    }
  }, [reduced, columnCount])

  return (
    <section
      ref={sectionRef}
      id="gallery"
      aria-labelledby="gallery-title"
      className="relative scroll-mt-28 overflow-clip"
    >
      <div>
        <div className="mx-auto max-w-7xl px-4 pt-32 pb-[30vh] sm:px-8">
          <header className="max-w-xl">
            <span className="font-ui text-[11px] tracking-[0.22em] text-fg-muted uppercase">
              Gallery
            </span>
            <h2
              id="gallery-title"
              className="display mt-4 text-[clamp(2.5rem,6vw,5rem)] text-fg drop-shadow-sm"
            >
              The fitting archive
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-fg-muted">
              Pieces from the prototype catalogue, each one ready to preview
              on your own body before it ever leaves the rack.
            </p>
          </header>

          <div
            className="mt-[14vh] grid gap-4 sm:gap-8 lg:gap-12"
            style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
          >
            {columns.map((items, c) => (
              <div
                key={c}
                ref={(el) => {
                  if (el) columnRefs.current[c] = el
                }}
                className="flex flex-col will-change-transform"
                style={{ paddingTop: COLUMN_START[c] }}
              >
                {items.map(({ piece, i }, row) => (
                  <figure
                    key={i}
                    ref={(el) => {
                      if (el) cardRefs.current[i] = el
                    }}
                    className={`will-change-transform ${row % 2 === 0 ? 'self-start' : 'self-end'}`}
                    style={{
                      width: WIDTHS[i % WIDTHS.length],
                      marginTop: row === 0 ? 0 : GAPS[i % GAPS.length],
                    }}
                  >
                    <div
                      className="chrome-edge overflow-hidden rounded-sm bg-canvas-sub shadow-[0_24px_48px_-24px_rgb(var(--shadow-key)/var(--shadow-b))]"
                      style={{ aspectRatio: ASPECTS[i % ASPECTS.length] }}
                    >
                      <img
                        src={`/images/gallery/${piece.src}.webp`}
                        alt={piece.alt}
                        loading="lazy"
                        decoding="async"
                        className="photo-mono h-full w-full object-cover"
                        style={{ objectPosition: piece.position }}
                      />
                    </div>
                    <figcaption className="font-mono mt-3 text-[11px] tabular-nums tracking-[0.18em] text-fg-muted">
                      No. {String(i + 1).padStart(2, '0')}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
