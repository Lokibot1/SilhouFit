import { useEffect, useRef } from 'react'

// Seeded, so a resize lays the same field back down instead of reshuffling it.
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Three depth layers: far stars are small, dim and barely move; near stars are
// brighter and shift the most with the pointer, which is what reads as depth.
const LAYERS = [
  { count: 340, size: 0.5, alpha: 0.35, parallax: 5, drift: 1.2 },
  { count: 150, size: 0.9, alpha: 0.6, parallax: 12, drift: 2.6 },
  { count: 45, size: 1.4, alpha: 0.95, parallax: 26, drift: 4.5 },
] as const

type Comet = { x: number; y: number; vx: number; vy: number; len: number; life: number; age: number }

/**
 * The open field behind the 404: layered stars with gentle pointer parallax,
 * a slow constant drift, and an occasional shooting star. Fixed to the
 * viewport and always night, whichever theme the site is in. Under reduced
 * motion it paints one still frame and never animates.
 */
export function SpaceScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const rand = rng(404)
    const stars = LAYERS.map((layer) =>
      Array.from({ length: layer.count }, () => ({
        x: rand(),
        y: rand(),
        r: layer.size * (0.6 + rand() * 0.8),
        a: layer.alpha * (0.4 + rand() * 0.6),
        // A few stars breathe; most hold steady so the field stays calm.
        tw: rand() < 0.15 ? 0.6 + rand() * 1.4 : 0,
        ph: rand() * 6.28,
      })),
    )

    let w = 0
    let h = 0
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 1.5)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const pointer = { x: 0, y: 0 }
    const eased = { x: 0, y: 0 }
    const onPointerMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    if (!reduced) window.addEventListener('pointermove', onPointerMove)

    const comets: Comet[] = []
    let nextComet = 2500 + Math.random() * 2500

    const spawnComet = () => {
      // Streak from the upper right toward the lower left, steeper or
      // shallower each time, always crossing the empty part of the frame.
      const angle = Math.PI * (0.62 + Math.random() * 0.12)
      const speed = 620 + Math.random() * 360
      comets.push({
        x: w * (0.35 + Math.random() * 0.75),
        y: -40 + Math.random() * h * 0.35,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        len: 120 + Math.random() * 140,
        life: 1.1 + Math.random() * 0.5,
        age: 0,
      })
    }

    const paint = (t: number, dt: number) => {
      ctx.clearRect(0, 0, w, h)
      eased.x += (pointer.x - eased.x) * Math.min(1, dt * 2.5)
      eased.y += (pointer.y - eased.y) * Math.min(1, dt * 2.5)

      LAYERS.forEach((layer, i) => {
        // Drift is wrapped so the field loops without a visible seam.
        const driftX = (t * layer.drift) % w
        const ox = -eased.x * layer.parallax - driftX
        const oy = -eased.y * layer.parallax
        for (const s of stars[i]) {
          const x = (((s.x * w + ox) % w) + w) % w
          const y = (((s.y * h + oy) % h) + h) % h
          const a = s.tw ? s.a * (0.55 + 0.45 * Math.sin(t * s.tw + s.ph)) : s.a
          ctx.fillStyle = `rgb(226 234 255 / ${a})`
          ctx.beginPath()
          ctx.arc(x, y, s.r, 0, Math.PI * 2)
          ctx.fill()
        }
      })

      for (let i = comets.length - 1; i >= 0; i--) {
        const c = comets[i]
        c.age += dt
        c.x += c.vx * dt
        c.y += c.vy * dt
        const k = c.age / c.life
        if (k >= 1) {
          comets.splice(i, 1)
          continue
        }
        // Fade in fast, out slow, so it flashes across rather than pops.
        const alpha = Math.min(1, k * 8) * (1 - k) ** 1.4
        const speed = Math.hypot(c.vx, c.vy)
        const tx = c.x - (c.vx / speed) * c.len
        const ty = c.y - (c.vy / speed) * c.len
        const grad = ctx.createLinearGradient(c.x, c.y, tx, ty)
        grad.addColorStop(0, `rgb(255 255 255 / ${0.9 * alpha})`)
        grad.addColorStop(0.15, `rgb(200 215 255 / ${0.4 * alpha})`)
        grad.addColorStop(1, 'rgb(160 180 255 / 0)')
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.6
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(c.x, c.y)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        ctx.fillStyle = `rgb(255 255 255 / ${alpha})`
        ctx.beginPath()
        ctx.arc(c.x, c.y, 1.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    if (reduced) {
      paint(0, 0)
      return () => window.removeEventListener('resize', resize)
    }

    let frame = 0
    let last = performance.now()
    const start = last
    const tick = (now: number) => {
      // Clamped so a backgrounded tab doesn't resume with a giant jump.
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      nextComet -= dt * 1000
      if (nextComet <= 0) {
        spawnComet()
        nextComet = 5500 + Math.random() * 5500
      }
      paint((now - start) / 1000, dt)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [])

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-[5] overflow-hidden bg-[#04050a]">
      {/* Distant light: three soft pools, blurred and drifting very slowly. */}
      <div className="nebula nebula-a" />
      <div className="nebula nebula-b" />
      <div className="nebula nebula-c" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* Keeps the corners dark so the copy and footer always sit on near-black. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,transparent_35%,rgb(2_3_6/0.7)_100%)]" />
    </div>
  )
}
