import { useEffect, useState } from 'react'

/**
 * Types `text` out one character at a time. With `instant` (reduced motion) it
 * returns the full string on the first render, so nothing is ever mid-word for
 * a visitor who asked for stillness.
 */
export function useTypewriter(
  text: string,
  { speed = 38, startDelay = 600, instant = false } = {},
) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (instant) return
    let interval: number | undefined
    const start = window.setTimeout(() => {
      interval = window.setInterval(() => {
        setCount((n) => {
          if (n + 1 >= text.length) window.clearInterval(interval)
          return n + 1
        })
      }, speed)
    }, startDelay)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(interval)
    }
  }, [text, speed, startDelay, instant])

  const shown = instant ? text.length : count
  return { displayed: text.slice(0, shown), done: shown >= text.length }
}
