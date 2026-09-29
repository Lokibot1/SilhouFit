import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'motion/react'
import { useEffect, useState } from 'react'
import { EASE_OUT } from '../motion/tokens'
import { SilhouetteMark } from './landing/SilhouetteMark'

const COUNT_DURATION = 2.3
const HOLD_MS = 320
const SWEEP_MS = 650

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export function IntroLoader({ onFinished }: { onFinished: () => void }) {
  const [sweeping, setSweeping] = useState(false)
  const [percent, setPercent] = useState(0)
  const count = useMotionValue(0)
  const rounded = useTransform(count, (v) => Math.round(v))
  const barWidth = useTransform(rounded, (v) => `${v}%`)

  useMotionValueEvent(rounded, 'change', setPercent)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    let cancelled = false

    async function run() {
      const controls = animate(count, 100, {
        duration: COUNT_DURATION,
        ease: 'linear',
      })
      await controls
      if (cancelled) return
      await wait(HOLD_MS)
      if (cancelled) return
      setSweeping(true)
      await wait(SWEEP_MS)
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

  return (
    <motion.div
      exit={{ y: '-100%', transition: { duration: 0.7, ease: EASE_OUT } }}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-carbon-950"
    >
      <div
        aria-hidden="true"
        className="intro-grain pointer-events-none absolute inset-0"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-[12%] w-px bg-silver-100/[0.06]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-[12%] w-px bg-silver-100/[0.06]"
      />

      <motion.div
        aria-hidden="true"
        initial={{ x: '-120%', opacity: 0 }}
        animate={sweeping ? { x: '220%', opacity: [0, 1, 0] } : undefined}
        transition={{ duration: SWEEP_MS / 1000, ease: EASE_OUT }}
        className="pointer-events-none absolute inset-y-[-20%] w-1/3 rotate-12 bg-gradient-to-r from-transparent via-white/10 to-transparent mix-blend-screen"
      />

      <div className="pointer-events-none absolute inset-x-6 top-6 flex items-center justify-between sm:inset-x-10 sm:top-10">
        <div className="flex items-center gap-2">
          <SilhouetteMark className="h-4 w-3 text-silver-200/70" />
          <span className="font-ui text-[10px] tracking-[0.32em] text-silver-100/70 uppercase">
            SilhouFit
          </span>
        </div>
        <span className="font-ui text-[10px] tracking-[0.28em] text-silver-300/40 uppercase tabular-nums">
          System / 001
        </span>
      </div>

      <div className="pointer-events-none absolute inset-x-6 bottom-6 sm:inset-x-10 sm:bottom-10">
        <span className="font-ui text-[9px] tracking-[0.28em] text-silver-300/35 uppercase">
          Digital fitting platform
        </span>
      </div>

      <div className="flex flex-col items-center">
        <span className="intro-chrome-text font-display text-[4.5rem] leading-none font-bold tracking-normal tabular-nums sm:text-[6.5rem] lg:text-[8.5rem]">
          {String(percent).padStart(2, '0')}
          <span className="ml-1 align-top text-[0.4em] opacity-70">%</span>
        </span>

        <div className="relative mt-6 h-px w-48 overflow-hidden bg-silver-100/10 sm:w-64">
          <motion.div
            style={{ width: barWidth }}
            className="intro-chrome-fill absolute inset-y-0 left-0"
          />
        </div>

        <span className="font-ui mt-4 text-[10px] tracking-[0.35em] text-silver-300/45 uppercase">
          Initializing experience
        </span>
      </div>
    </motion.div>
  )
}
