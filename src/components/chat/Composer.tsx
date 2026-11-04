import { useRef, useState, type KeyboardEvent } from 'react'
import { MAX_MESSAGE_LENGTH } from '../../service/chatApi'
import { SendIcon } from '../form/icons'
import { Tooltip } from '../ui/Tooltip'

interface ComposerProps {
  onSend: (body: string) => void
  /** A message is on its way: Send waits so one press cannot send twice. */
  sending: boolean
}

/** Enter sends, Shift+Enter starts a new line. The text clears at once; a message that fails stays in the thread with Retry. */
export function Composer({ onSend, sending }: ComposerProps) {
  const [text, setText] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const body = text.trim()
  const blocked = sending || !body

  function submit() {
    if (blocked) return
    onSend(body)
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
        if (!el) return
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
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={1}
          aria-label="Message"
          aria-describedby="chat-composer-count"
          placeholder="Write a message"
          className="font-ui field-sizing-content max-h-36 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-line-strong bg-canvas px-3 py-2.5 text-base leading-6 text-fg placeholder:text-fg-muted"
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
      <p id="chat-composer-count" className="font-ui mt-1 text-right text-xs text-fg-muted tabular-nums">
        {text.length} / {MAX_MESSAGE_LENGTH}
      </p>
    </form>
  )
}
