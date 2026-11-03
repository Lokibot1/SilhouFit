import { animate, motion, useMotionValue, useMotionValueEvent } from 'motion/react'
import { useEffect, useId, useState } from 'react'
import { WORDMARK } from './landing-v2/wordmark'
import './IntroLoader.css'

const COUNT_DURATION = 2.3
const HOLD_MS = 320

const { width: W, height: H } = WORDMARK
const LOGO_PATH = WORDMARK.letters.map((l) => l.d).join('')

// One wave period; the layers slide by exactly one period so the loop is seamless.
const PERIOD = 1200
const AMP = 44
const BACK_LIFT = 18
const TRAVEL = H + 2 * AMP + BACK_LIFT

/** A sine-like surface of 7 periods (covers the logo plus one period of slide), with a solid body below it. */
const WAVE_PATH = (() => {
  const half = PERIOD / 2
  let d = 'M0 0'
  for (let i = 0; i < 14; i++) d += `Q${i * half + half / 2} ${i % 2 ? 2 * AMP : -2 * AMP} ${(i + 1) * half} 0`
  return `${d}V900H0Z`
})()

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export function IntroLoader({ onFinished }: { onFinished: () => void }) {
  const clipId = useId()
  const [level, setLevel] = useState(0)
  const count = useMotionValue(0)
  const percent = Math.round(level)

  useMotionValueEvent(count, 'change', setLevel)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    let cancelled = false

    async function run() {
      await animate(count, 100, { duration: COUNT_DURATION, ease: 'linear' })
      if (cancelled) return
      await wait(HOLD_MS)
      if (cancelled) return
      onFinished()
    }

    run()
    return () => {
      cancelled = true
      document.body.style.overflow = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const front = H + AMP + BACK_LIFT - (level / 100) * TRAVEL
  const back = front - BACK_LIFT

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }}
      role="progressbar"
      aria-label="Loading KRAL"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="kl-loader"
    >
      <div className="kl-stack">
        <svg className="kl-logo" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
          <defs>
            <clipPath id={clipId}>
              <path clipRule="evenodd" d={LOGO_PATH} />
            </clipPath>
          </defs>
          <path className="kl-ghost" fillRule="evenodd" d={LOGO_PATH} />
          <g clipPath={`url(#${clipId})`}>
            <g style={{ transform: `translateY(${back}px)` }}>
              <path className="kl-wave kl-wave--back" d={WAVE_PATH} />
            </g>
            <g style={{ transform: `translateY(${front}px)` }}>
              <path className="kl-wave kl-wave--front" d={WAVE_PATH} />
            </g>
          </g>
        </svg>

        <p className="kl-meta">
          <span>(Loading)</span>
          <span className="kl-num">{String(percent).padStart(3, '0')}%</span>
        </p>
      </div>

      <p className="kl-tagline" aria-hidden="true">
        Made to Represent // Mark of Identity
      </p>
    </motion.div>
  )
}
