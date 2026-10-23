export interface Point {
  x: number
  y: number
}

const r = (n: number) => Math.round(n * 100) / 100

/** Fritsch-Carlson slopes: the curve through the points never overshoots them, and flat runs stay flat. */
function tangents(points: Point[]) {
  const n = points.length
  const slope = points.slice(1).map((p, i) => (p.x === points[i].x ? 0 : (p.y - points[i].y) / (p.x - points[i].x)))
  const m = points.map((_, i) => {
    if (i === 0) return slope[0]
    if (i === n - 1) return slope[n - 2]
    return slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2
  })
  slope.forEach((d, i) => {
    if (d === 0) {
      m[i] = 0
      m[i + 1] = 0
      return
    }
    const a = m[i] / d
    const b = m[i + 1] / d
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * d
      m[i + 1] = t * b * d
    }
  })
  return m
}

/** A smooth SVG path through `points` (x strictly increasing) as cubic Beziers. One point is only a move. */
export function smoothPath(points: Point[]) {
  if (points.length === 0) return ''
  let d = `M${r(points[0].x)} ${r(points[0].y)}`
  if (points.length === 1) return d
  const m = tangents(points)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const h = (b.x - a.x) / 3
    d += `C${r(a.x + h)} ${r(a.y + m[i - 1] * h)} ${r(b.x - h)} ${r(b.y - m[i] * h)} ${r(b.x)} ${r(b.y)}`
  }
  return d
}

/** The same curve closed down to `baseline`, for the fill beneath it. */
export function areaPath(points: Point[], baseline: number) {
  if (points.length < 2) return ''
  const last = points[points.length - 1]
  return `${smoothPath(points)}L${r(last.x)} ${r(baseline)}L${r(points[0].x)} ${r(baseline)}Z`
}

/** Rounds `max` up to 1, 2, 2.5, 5 or 10 times a power of ten, so axis labels land on round numbers. */
export function niceCeil(max: number) {
  if (max <= 0) return 1
  const base = 10 ** Math.floor(Math.log10(max))
  const step = [1, 2, 2.5, 5, 10].find((s) => s * base >= max) ?? 10
  return step * base
}

export interface DonutSegment {
  /** Share of the whole, 0 to 1. */
  share: number
  /** Dash length and where it starts, on a circle whose circumference is 100. */
  length: number
  start: number
}

/** Dash lengths for a donut drawn as stroked circles of circumference 100, with `gap` left between segments. */
export function donutSegments(values: number[], gap = 0.8): DonutSegment[] {
  const total = values.reduce((sum, v) => sum + v, 0)
  if (total <= 0) return []
  let start = 0
  return values.map((value) => {
    const share = value / total
    const segment = { share, length: Math.max(0, share * 100 - (values.length > 1 ? gap : 0)), start }
    start += share * 100
    return segment
  })
}
