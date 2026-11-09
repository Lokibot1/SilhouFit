import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { MAX_MESSAGE_LENGTH } from '../../service/chatApi'
import { maskProfanity } from '../../utils/profanity'
import { SendIcon } from '../form/icons'
import { Tooltip } from '../ui/Tooltip'

interface ComposerProps {
  onSend: (body: string) => void
  /** A message is on its way: Send waits so one press cannot send twice. */
  sending: boolean
  /** Called as the text changes while it is not empty, for a typing hint. */
  onTyping?: () => void
  /** Puts the cursor in the box when it appears. */
  focusOnMount?: boolean
  /** Called with the masked text after a message that had flagged words was sent, so the offense can be counted. */
  onMasked?: (maskedBody: string) => void
  /** Why the customer cannot write (for example, messaging blocked by staff). The box and Send are disabled and the reason is shown. */
  disabledReason?: string
  /** Publishes its height as --bottom-bar-h so a toast sits above it. The dock turns this off: it reads that variable itself. */
  publishOffset?: boolean
}

/** Enter sends, Shift+Enter starts a new line. The text clears at once; a message that fails stays in the thread with Retry. */
export function Composer({ onSend, sending, onTyping, onMasked, disabledReason, focusOnMount = false, publishOffset = true }: ComposerProps) {
  const [text, setText] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const [masked, setMasked] = useState(false)
  const body = text.trim()
  const blocked = sending || !body || !!disabledReason

  useEffect(() => {
    if (focusOnMount) field.current?.focus()
  }, [focusOnMount])

  function submit() {
    if (blocked) return
    // Flagged words are hidden before the message leaves, so the other side never receives them.
    const { text: safe, offended } = maskProfanity(body)
    onSend(safe)
    setMasked(offended)
    if (offended) onMasked?.(safe)
    setText('')
    field.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }

  return (
    <form
      // Publishes how far its top sits above the screen bottom so a toast lands above the composer instead of over it.
      ref={(el) => {
        if (!el || !publishOffset) return
        const publish = () => document.documentElement.style.setProperty('--bottom-bar-h', `${Math.ceil(window.innerHeight - el.getBoundingClientRect().top)}px`)
        publish()
        const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish)
        resize?.observe(el)
        window.addEventListener('resize', publish)
        return () => {
          resize?.disconnect()
          window.removeEventListener('resize', publish)
          document.documentElement.style.removeProperty('--bottom-bar-h')
        }
      }}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="border-t border-line bg-canvas-sub p-3"
    >
      <div className="flex items-end gap-2">
        <textarea
          ref={field}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            if (event.target.value.trim()) onTyping?.()
          }}
          onKeyDown={onKeyDown}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={1}
          aria-label="Message"
          disabled={!!disabledReason}
          aria-describedby={disabledReason || masked ? 'chat-composer-count chat-composer-note' : 'chat-composer-count'}
          placeholder="Write a message"
          className="font-ui field-sizing-content max-h-36 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-line-strong bg-canvas px-3 py-2.5 text-base leading-6 text-fg sm:text-sm placeholder:text-fg-muted"
        />
        <Tooltip label="Send message">
          <button
            type="submit"
            disabled={blocked}
            aria-label="Send message"
            className="btn-lift flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border-2 border-fg bg-fg text-canvas hover:border-chrome-strong hover:bg-chrome-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SendIcon />
          </button>
        </Tooltip>
      </div>
      {(disabledReason || masked) && (
        <p id="chat-composer-note" role={disabledReason ? undefined : 'status'} className="font-ui mt-1 text-xs text-fg-muted">
          {disabledReason ?? 'Some words were hidden. Repeated use of this language can lead to your messaging being blocked or your account banned.'}
        </p>
      )}
      <p id="chat-composer-count" className="font-ui mt-1 text-right text-xs text-fg-muted tabular-nums">
        {text.length} / {MAX_MESSAGE_LENGTH}
      </p>
    </form>
  )
}
