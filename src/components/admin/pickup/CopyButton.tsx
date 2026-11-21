import { useEffect, useRef, useState } from 'react'
import { CheckIcon, CopyIcon } from '../../form/icons'
import { useToast } from '../../toast/useToast'
import { Tooltip } from '../../ui/Tooltip'

/** The Clipboard API, then the old select-and-copy for browsers or pages that refuse it. */
async function writeText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const focused = document.activeElement as HTMLElement | null
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.cssText = 'position:fixed;opacity:0'
    document.body.append(area)
    area.select()
    try {
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      area.remove()
      focused?.focus()
    }
  }
}

/** An icon button that copies `text`, then shows a check for a moment and a toast. `what` fills "Copy ___". */
export function CopyButton({ text, what, className = '' }: { text: string; what: string; className?: string }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const timer = useRef<number>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy() {
    if (await writeText(text)) {
      toast.show({ kind: 'success', message: `${what[0].toUpperCase()}${what.slice(1)} copied` })
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1500)
    } else {
      toast.show({ kind: 'error', message: `Couldn't copy the ${what}. Your browser blocked clipboard access, so select the text and copy it by hand.` })
    }
  }

  return (
    <Tooltip label={copied ? 'Copied' : `Copy ${what}`} className={className}>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy ${what}`}
        className="flex size-11 cursor-pointer items-center justify-center rounded-xl text-fg-muted hover:bg-fg/5 hover:text-fg motion-safe:transition-colors"
      >
        {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
      </button>
    </Tooltip>
  )
}
