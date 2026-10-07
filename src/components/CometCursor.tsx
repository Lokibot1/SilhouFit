import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'

type RGB = string

// Literal values, not semantic tokens: the comet must hold contrast over every surface.
const PALETTE = {
  dark: {
    blend: 'lighter' as GlobalCompositeOperation,
    dust: '226 232 242',
    ion: '120 165 255',
    glow: ['240 245 255', '165 190 255'] as [RGB, RGB],
    core: ['#ffffff', '#e6ebf2', '#9aa2ae'],
    rim: 'rgb(12 13 16 / 0.8)',
    burst: ['255 255 255', '214 222 234', '150 185 255', '190 165 255'],
  },
  light: {
    blend: 'source-over' as GlobalCompositeOperation,
    dust: '38 43 52',
    ion: '40 78 170',
    glow: ['40 48 64', '60 90 170'] as [RGB, RGB],
    core: ['#6b7280', '#1b1e24', '#0c0d10'],
    rim: 'rgb(255 255 255 / 0.95)',
    burst: ['12 13 16', '74 81 92', '40 80 170', '95 70 170'],
  },
}

// Tail: chains of points that each lag the one ahead (inertia, not position history).
const LINKS = 22
const DUST_FOLLOW = 0.42
const ION_FOLLOW = 0.3
const HEAD = 3.2

const COMPRESS_MS = 70
const BURST_MS = 900

type P = { x: number; y: number }
type Spark = {
  x: number; y: number; vx: number; vy: number
  life: number; age: number; size: number; color: RGB; streak: boolean
}
type Burst = { x: number; y: number; age: number }
type Press = { x: number; y: number; age: number }

function smooth(t: number) {
  const c = Math.min(Math.max(t, 0), 1)
  return c * c * (3 - 2 * c)
}

function ribbon(ctx: CanvasRenderingContext2D, pts: P[], w0: number, w1: number) {
  const n = pts.length
  const left: P[] = []
  const right: P[] = []
  let nx = 0
  let ny = 1
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(i - 1, 0)]
    const b = pts[Math.min(i + 1, n - 1)]
    const tx = a.x - b.x
    const ty = a.y - b.y
    const len = Math.hypot(tx, ty)
    if (len > 1e-3) {
      nx = -ty / len
      ny = tx / len
    }
    const t = i / (n - 1)
    const w = (w0 + (w1 - w0) * t) * (1 - t) ** 0.8
    left.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w })
    right.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w })
  }
  ctx.beginPath()
  ctx.moveTo(left[0].x, left[0].y)
  for (let i = 1; i < n; i++) ctx.lineTo(left[i].x, left[i].y)
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y)
  ctx.closePath()
}

/** Comet pointer that goes supernova on click. One fixed canvas; the rAF loop sleeps when idle. */
export function CometCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { theme } = useTheme()
  const themeRef = useRef(theme)
  useEffect(() => {
    themeRef.current = theme
  }, [theme])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const fine = window.matchMedia('(pointer: fine)').matches
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!fine || reduced) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const root = document.documentElement
    root.classList.add('comet-active')

    let dpr = 1
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio, 2)
      canvas.width = Math.round(window.innerWidth * dpr)
      canvas.height = Math.round(window.innerHeight * dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    const head = { x: -100, y: -100, visible: false, hover: 0, hoverTarget: 0 }
    const dust: P[] = Array.from({ length: LINKS }, () => ({ x: -100, y: -100 }))
    const ion: P[] = Array.from({ length: LINKS }, () => ({ x: -100, y: -100 }))
    const sparks: Spark[] = []
    const bursts: Burst[] = []
    const presses: Press[] = []
    let flash = 0
    let raf = 0
    let running = false
    let last = performance.now()

    const spawn = (s: Omit<Spark, 'age'>) => {
      if (sparks.length < 320) sparks.push({ ...s, age: 0 })
    }

    const follow = (chain: P[], k: number, dt: number) => {
      const f = 1 - Math.pow(1 - k, dt / 16)
      chain[0].x = head.x
      chain[0].y = head.y
      let slack = 0
      for (let i = 1; i < chain.length; i++) {
        const dx = chain[i - 1].x - chain[i].x
        const dy = chain[i - 1].y - chain[i].y
        chain[i].x += dx * f
        chain[i].y += dy * f
        slack += Math.abs(dx) + Math.abs(dy)
      }
      return slack
    }

    const tail = (chain: P[], rgb: RGB, w0: number, w1: number, alpha: number, now: number) => {
      const a = chain[0]
      const b = chain[chain.length - 1]
      if (Math.hypot(a.x - b.x, a.y - b.y) < 3) return
      const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
      const stops = [1, 0.72, 0.46, 0.26, 0.12, 0.04, 0]
      stops.forEach((base, j) => {
        const flicker = j === 0 || j === stops.length - 1 ? 1 : 0.82 + 0.18 * Math.sin(now * 0.004 + j * 1.9)
        g.addColorStop(j / (stops.length - 1), `rgb(${rgb} / ${(base * alpha * flicker).toFixed(3)})`)
      })
      ctx.fillStyle = g
      ribbon(ctx, chain, w0, w1)
      ctx.fill()
    }

    const draw = (now: number) => {
      const dt = Math.min(now - last, 40)
      last = now
      const p = PALETTE[themeRef.current]
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = p.blend
      ctx.lineCap = 'round'

      const slack = follow(dust, DUST_FOLLOW, dt) + follow(ion, ION_FOLLOW, dt)

      let squeeze = 0
      for (let i = presses.length - 1; i >= 0; i--) {
        const pr = presses[i]
        pr.age += dt
        if (pr.age >= COMPRESS_MS) {
          presses.splice(i, 1)
          fire(pr.x, pr.y, p)
        } else {
          squeeze = Math.max(squeeze, smooth(pr.age / COMPRESS_MS))
        }
      }

      if (head.visible) {
        tail(ion, p.ion, 1.4, 7, 0.6, now)
        tail(dust, p.dust, 2.6, 18, 0.55, now)
      }

      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i]
        b.age += dt
        const t = b.age / BURST_MS
        if (t >= 1) {
          bursts.splice(i, 1)
          continue
        }
        const out = 1 - (1 - Math.min(t * 1.6, 1)) ** 3
        const R = 18 + out * 70
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, R)
        const fade = (1 - t) ** 2
        g.addColorStop(0, `rgb(${p.burst[0]} / ${(0.6 * fade).toFixed(3)})`)
        g.addColorStop(0.35, `rgb(${p.burst[2]} / ${(0.26 * fade).toFixed(3)})`)
        g.addColorStop(0.7, `rgb(${p.burst[3]} / ${(0.08 * fade).toFixed(3)})`)
        g.addColorStop(1, `rgb(${p.burst[3]} / 0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(b.x, b.y, R, 0, Math.PI * 2)
        ctx.fill()

        const rings: [number, number, RGB, number][] = [
          [0, 88, p.burst[1], 1.3],
          [70, 58, p.burst[3], 0.9],
        ]
        for (const [delay, reach, rgb, width] of rings) {
          const rt = (b.age - delay) / 620
          if (rt <= 0 || rt >= 1) continue
          const e = 1 - (1 - rt) ** 3
          ctx.strokeStyle = `rgb(${rgb} / ${(0.75 * (1 - rt) ** 1.5).toFixed(3)})`
          ctx.lineWidth = width * (1 - rt) + 0.3
          ctx.beginPath()
          ctx.arc(b.x, b.y, 4 + e * reach, 0, Math.PI * 2)
          ctx.stroke()
        }

        const ct = b.age / 260
        if (ct < 1) {
          ctx.fillStyle = `rgb(${p.burst[0]} / ${(1 - ct).toFixed(3)})`
          ctx.beginPath()
          ctx.arc(b.x, b.y, 3 + 9 * Math.sin(Math.min(ct, 1) * Math.PI) * (1 - ct * 0.5), 0, Math.PI * 2)
          ctx.fill()
        }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]
        s.age += dt
        if (s.age >= s.life) {
          sparks.splice(i, 1)
          continue
        }
        const drag = Math.pow(s.streak ? 0.93 : 0.9, dt / 16)
        s.vx *= drag
        s.vy *= drag
        s.x += s.vx * dt
        s.y += s.vy * dt
        const a = (1 - s.age / s.life) ** 1.4
        if (s.streak) {
          const len = 26
          ctx.strokeStyle = `rgb(${s.color} / ${(a * 0.85).toFixed(3)})`
          ctx.lineWidth = s.size * (0.5 + a * 0.5)
          ctx.beginPath()
          ctx.moveTo(s.x, s.y)
          ctx.lineTo(s.x - s.vx * len, s.y - s.vy * len)
          ctx.stroke()
        } else {
          ctx.fillStyle = `rgb(${s.color} / ${(a * 0.9).toFixed(3)})`
          ctx.beginPath()
          ctx.arc(s.x, s.y, s.size * (0.4 + a * 0.6), 0, Math.PI * 2)
          ctx.fill()
        }
      }

      head.hover += (head.hoverTarget - head.hover) * Math.min(dt / 90, 1)
      flash = Math.max(0, flash - dt / 280)
      if (head.visible) {
        const r = HEAD * (1 + head.hover * 0.45) * (1 - squeeze * 0.45) * (1 + flash * 0.9)

        const R = r * 6 + flash * 26
        const g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, R)
        g.addColorStop(0, `rgb(${p.glow[0]} / ${(0.55 + squeeze * 0.3 + flash * 0.3).toFixed(3)})`)
        g.addColorStop(0.22, `rgb(${p.glow[0]} / ${(0.2 + flash * 0.2).toFixed(3)})`)
        g.addColorStop(0.55, `rgb(${p.glow[1]} / 0.07)`)
        g.addColorStop(1, `rgb(${p.glow[1]} / 0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(head.x, head.y, R, 0, Math.PI * 2)
        ctx.fill()

        ctx.globalCompositeOperation = 'source-over'
        const c = ctx.createRadialGradient(head.x - r * 0.4, head.y - r * 0.4, 0, head.x, head.y, r)
        c.addColorStop(0, p.core[0])
        c.addColorStop(0.55, p.core[1])
        c.addColorStop(1, p.core[2])
        ctx.fillStyle = c
        ctx.strokeStyle = p.rim
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(head.x, head.y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }

      const busy =
        slack > 0.6 || sparks.length || bursts.length || presses.length || flash > 0 ||
        Math.abs(head.hoverTarget - head.hover) > 0.01
      if (busy) {
        raf = requestAnimationFrame(draw)
      } else {
        running = false
      }
    }

    function fire(x: number, y: number, p: (typeof PALETTE)['dark']) {
      flash = 1
      bursts.push({ x, y, age: 0 })
      for (let i = 0; i < 38; i++) {
        const a = (i / 38) * Math.PI * 2 + (Math.random() - 0.5) * 0.35
        const v = 0.12 + Math.random() * 0.4
        spawn({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          life: 420 + Math.random() * 520,
          size: 0.6 + Math.random() * 1.6,
          color: p.burst[Math.floor(Math.random() * p.burst.length)],
          streak: false,
        })
      }
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2
        const v = 0.55 + Math.random() * 0.35
        spawn({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          life: 320 + Math.random() * 200,
          size: 0.9 + Math.random() * 0.8,
          color: i % 2 ? p.burst[2] : p.burst[0],
          streak: true,
        })
      }
    }

    const wake = () => {
      if (running) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(draw)
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const px = head.x
      const py = head.y
      head.x = e.clientX
      head.y = e.clientY
      if (!head.visible) {
        // Arriving from off-screen: start collapsed on the head, no streak.
        for (const pt of [...dust, ...ion]) {
          pt.x = head.x
          pt.y = head.y
        }
        head.visible = true
      } else {
        const dx = head.x - px
        const dy = head.y - py
        const speed = Math.hypot(dx, dy)
        if (speed > 18 && Math.random() < 0.6) {
          const p = PALETTE[themeRef.current]
          spawn({
            x: head.x - dx * Math.random(), y: head.y - dy * Math.random(),
            vx: (-dx / speed) * 0.03 + (Math.random() - 0.5) * 0.05,
            vy: (-dy / speed) * 0.03 + (Math.random() - 0.5) * 0.05,
            life: 380 + Math.random() * 320,
            size: 0.5 + Math.random() * 0.8,
            color: Math.random() < 0.5 ? p.dust : p.ion,
            streak: false,
          })
        }
      }
      const target = e.target as Element | null
      head.hoverTarget = target?.closest('a, button, [role="button"], label, summary') ? 1 : 0
      wake()
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      presses.push({ x: e.clientX, y: e.clientY, age: 0 })
      wake()
    }

    const onLeave = () => {
      head.visible = false
      wake()
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)

    return () => {
      cancelAnimationFrame(raf)
      root.classList.remove('comet-active')
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-100 h-screen w-screen"
    />
  )
}

/** The comet is a landing-page flourish; leaving "/" unmounts it, which restores the native cursor. */
export function LandingCometCursor() {
  return useLocation().pathname === '/' ? <CometCursor /> : null
}
