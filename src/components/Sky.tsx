import { useLayoutEffect, useRef } from 'react'
import { useTheme } from '../contexts/ThemeContext'

// Literal carbon/silver values, not semantic tokens, same as the sky toggle.
const PALETTE = {
  dark: { bg: '#0a0a0a', ink: '236 236 236', band: '205 205 205', bandA: 0.12 },
  light: { bg: '#f3f4f6', ink: '20 23 28', band: '92 100 112', bandA: 0.09 },
} as const

// Seeded so every redraw lays out the same sky.
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Box-Muller: dust hugs the band's spine.
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
  ctx.fillStyle = p.bg
  ctx.fillRect(0, 0, w, h)

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

  for (let i = 0; i < 520 * area; i++) {
    const b = rand() ** 3
    dot(rand() * w, rand() * h, 0.35 + b * 1.1, 0.2 + b * 0.8)
  }
}

// Twinkling stars are DOM dots so the canvas paints once per resize or theme change.
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

export function Sky() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { theme } = useTheme()

  // Layout effect so the repaint lands inside the theme toggle's flushSync.
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

/** The one fixed sky behind the site; `lvh` avoids redraws as a phone's address bar collapses. */
export function SiteSky() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-lvh">
      <Sky />
    </div>
  )
}
