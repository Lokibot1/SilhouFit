import { useLayoutEffect, useRef } from 'react'
import { useTheme } from '../../contexts/ThemeContext'

// The sky is a fixed composition that flips between a night and a negative
// "day" print, so it takes literal values from the raw carbon/silver ramp
// rather than the semantic tokens -- same reasoning as the sky toggle.
const PALETTE = {
  dark: { top: '#0a0b0e', bottom: '#111318', ink: '236 240 246', band: '200 210 225', bandA: 0.12 },
  light: { top: '#f3f4f6', bottom: '#e4e7ec', ink: '20 23 28', band: '92 100 112', bandA: 0.09 },
} as const

// Seeded, so every redraw -- resize, theme swap -- lays out the same sky.
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Box-Muller: most of the dust hugs the band's spine, thinning out to its
// edges, which is what makes it read as a galaxy and not a stripe of noise.
function gaussian(rand: () => number) {
  return Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand())
}

function draw(canvas: HTMLCanvasElement, theme: 'light' | 'dark') {
  const dpr = Math.min(window.devicePixelRatio, 2)
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (!w || !h) return
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)

  const p = PALETTE[theme]
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, p.top)
  sky.addColorStop(1, p.bottom)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  // The band runs corner to corner, top right to bottom left.
  const from = { x: w * 0.68, y: -h * 0.05 }
  const to = { x: w * 0.3, y: h * 1.05 }
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  const cx = (from.x + to.x) / 2
  const cy = (from.y + to.y) / 2
  const thickness = Math.min(w, h) * 0.16

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.scale(1, thickness / (length / 2))
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, length / 2)
  glow.addColorStop(0, `rgb(${p.band} / ${p.bandA})`)
  glow.addColorStop(0.6, `rgb(${p.band} / ${p.bandA * 0.5})`)
  glow.addColorStop(1, `rgb(${p.band} / 0)`)
  ctx.fillStyle = glow
  ctx.fillRect(-length / 2, -length / 2, length, length)
  ctx.restore()

  const rand = rng(7)
  const area = (w * h) / (1440 * 900)
  const dot = (x: number, y: number, r: number, a: number) => {
    ctx.fillStyle = `rgb(${p.ink} / ${a})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Star dust along the band.
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  for (let i = 0; i < 2600 * area; i++) {
    const along = (rand() - 0.5) * length
    const across = gaussian(rand) * thickness * 0.45
    dot(
      cx + along * cos - across * sin,
      cy + along * sin + across * cos,
      0.3 + rand() * 0.55,
      0.12 + rand() * 0.45,
    )
  }

  // The open field: mostly faint, a few bright, like a real exposure.
  for (let i = 0; i < 520 * area; i++) {
    const b = rand() ** 3
    dot(rand() * w, rand() * h, 0.35 + b * 1.1, 0.2 + b * 0.8)
  }
}

// A handful of brighter stars that twinkle, as DOM dots so the canvas is only
// ever painted once per resize or theme change -- the chrome figure above it
// already spends the frame budget.
const TWINKLES = (() => {
  const rand = rng(21)
  return Array.from({ length: 26 }, () => ({
    left: `${(rand() * 100).toFixed(2)}%`,
    top: `${(rand() * 100).toFixed(2)}%`,
    size: 1.5 + rand() * 1.5,
    duration: `${(2.4 + rand() * 3.6).toFixed(2)}s`,
    delay: `${(-rand() * 6).toFixed(2)}s`,
  }))
})()

/**
 * The hero's backdrop: a night sky with a galactic band crossing it, echoing
 * the chrome figure's "silver surfer" read. In light mode the same sky prints
 * as a negative -- graphite stars on silver -- so the composition holds while
 * the palette flips.
 */
export function HeroSky() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { theme } = useTheme()

  // A layout effect so the repaint lands inside the theme toggle's
  // flushSync: the view transition's "after" snapshot must already hold the
  // new sky, or it would reveal the old one and then pop.
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    draw(canvas, theme)
    const observer = new ResizeObserver(() => draw(canvas, theme))
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [theme])

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="h-full w-full" />
      {TWINKLES.map((star, i) => (
        <span
          key={i}
          className="animate-twinkle absolute rounded-full bg-fg"
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            animationDuration: star.duration,
            animationDelay: star.delay,
          }}
        />
      ))}
    </div>
  )
}
