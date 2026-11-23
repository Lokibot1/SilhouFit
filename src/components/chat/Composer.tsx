import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { MAX_MESSAGE_LENGTH } from '../../service/chatApi'
import { hasProfanity, maskProfanity } from '../../utils/profanity'
import { checkChatFile, CHAT_ACCEPT } from '../../utils/chatAttachments'
import { PaperclipIcon, SendIcon, VideoIcon, XIcon } from '../form/icons'
import { Tooltip } from '../ui/Tooltip'

interface ComposerProps {
  /** `files` is passed only when some are attached. */
  onSend: (body: string, files?: File[]) => void
  /** A message is on its way: Send waits so one press cannot send twice. */
  sending: boolean
  /** Called as the text changes while it is not empty, for a typing hint. */
  onTyping?: () => void
  /** Puts the cursor in the box when it appears. */
  focusOnMount?: boolean
  /** Called with the masked text after a message that had flagged words was sent, so the offense can be counted. */
  onMasked?: (maskedBody: string) => void
  /** Why the customer cannot write (for example, messaging blocked by staff). The box and Send are disabled and the reason is shown. */
  disabledReason?: ReactNode
  /** Publishes its height as --bottom-bar-h so a toast sits above it. The dock turns this off: it reads that variable itself. */
  publishOffset?: boolean
  /** Shows the paperclip: photos and videos can be attached. */
  attachments?: boolean
  /** The longest message; chat messages by default. */
  maxLength?: number
}

interface Attached {
  id: string
  file: File
  /** An object URL for the thumbnail, released when the file is removed or sent. */
  url: string
}

/** Enter sends, Shift+Enter starts a new line. The text clears at once; a message that fails stays in the thread with Retry. */
export function Composer({ onSend, sending, onTyping, onMasked, disabledReason, focusOnMount = false, publishOffset = true, maxLength = MAX_MESSAGE_LENGTH, attachments = false }: ComposerProps) {
  const [text, setText] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const [masked, setMasked] = useState(false)
  const [files, setFiles] = useState<Attached[]>([])
  const [notes, setNotes] = useState<string[]>([])
  const picker = useRef<HTMLInputElement>(null)
  const clip = useRef<HTMLButtonElement>(null)
  const urls = useRef(new Set<string>())
  const body = text.trim()
  const blocked = sending || (!body && files.length === 0) || !!disabledReason
  const flagged = !disabledReason && hasProfanity(body)

  useEffect(() => {
    if (focusOnMount) field.current?.focus()
  }, [focusOnMount])

  useEffect(() => {
    const live = urls.current
    return () => live.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  function forget(url: string) {
    URL.revokeObjectURL(url)
    urls.current.delete(url)
  }

  function pick(chosen: FileList | null) {
    const added: Attached[] = []
    const refused: string[] = []
    for (const file of chosen ?? []) {
      const reason = checkChatFile(file, files.length + added.length)
      if (reason) refused.push(reason)
      else {
        const url = URL.createObjectURL(file)
        urls.current.add(url)
        added.push({ file, url, id: crypto.randomUUID() })
      }
    }
    setFiles((current) => [...current, ...added])
    setNotes(refused)
    if (picker.current) picker.current.value = ''
  }

  function unattach(item: Attached) {
    forget(item.url)
    setFiles((current) => current.filter((f) => f.id !== item.id))
    setNotes([])
    clip.current?.focus()
  }

  function submit() {
    if (blocked) return
    // Flagged words are hidden before the message leaves, so the other side never receives them.
    const { text: safe, offended } = maskProfanity(body)
    if (files.length) onSend(safe, files.map((f) => f.file))
    else onSend(safe)
    files.forEach((f) => forget(f.url))
    setFiles([])
    setNotes([])
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
      className="border-t border-line bg-canvas-sub px-3 py-2"
    >
      {files.length > 0 && (
        <ul aria-label="Attached files" className="mb-2 flex flex-wrap gap-2">
          {files.map((item) => (
            <li key={item.id} className="relative size-20 overflow-hidden rounded-xl border border-line bg-canvas">
              {item.file.type.startsWith('video/') ? (
                <div className="font-ui flex size-full flex-col items-center justify-center gap-1 px-1 text-xs text-fg-muted">
                  <VideoIcon />
                  <span className="w-full truncate text-center">{item.file.name}</span>
                </div>
              ) : (
                <img src={item.url} alt={item.file.name} className="size-full object-cover" />
              )}
              <Tooltip label={`Remove ${item.file.name}`} className="absolute top-0 right-0">
                <button type="button" onClick={() => unattach(item)} aria-label={`Remove ${item.file.name}`} className="flex size-11 cursor-pointer items-start justify-end p-1 text-fg">
                  <span className="flex size-6 items-center justify-center rounded-full bg-canvas/90 hover:bg-canvas">
                    <XIcon />
                  </span>
                </button>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        {attachments && !disabledReason && (
          <>
            <input ref={picker} type="file" multiple accept={CHAT_ACCEPT} aria-label="Choose photos or videos to attach" onChange={(event) => pick(event.target.files)} className="hidden" />
            <Tooltip label="Attach photos or videos">
              <button
                ref={clip}
                type="button"
                onClick={() => picker.current?.click()}
                aria-label="Attach photos or videos"
                className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-line-strong bg-canvas text-fg hover:bg-fg/5 pointer-coarse:size-11"
              >
                <PaperclipIcon />
              </button>
            </Tooltip>
          </>
        )}
        {/* The box has its own rounded outline, which lights up while it has focus. Paperclip and Send are 36px buttons beside it with a mouse, 44px on touch. */}
        <div className="flex min-h-9 min-w-0 flex-1 items-end rounded-xl bg-canvas ring-1 ring-line-strong ring-inset focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-chrome-strong pointer-coarse:min-h-11">
          <textarea
            ref={field}
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              if (event.target.value.trim()) onTyping?.()
            }}
            onKeyDown={onKeyDown}
            maxLength={maxLength}
            rows={1}
            aria-label="Message"
            disabled={!!disabledReason}
            aria-describedby={disabledReason || masked || flagged ? 'chat-composer-note' : undefined}
            placeholder={disabledReason ? 'Messaging is blocked' : 'Write a message'}
            className="font-ui field-sizing-content max-h-24 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-3 py-1.5 text-base leading-6 text-fg sm:text-sm placeholder:text-fg-muted focus-visible:outline-none pointer-coarse:min-h-11 pointer-coarse:py-2.5"
          />
        </div>
        <Tooltip label="Send message">
          <button
            type="submit"
            disabled={blocked}
            aria-label="Send message"
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-fg text-canvas enabled:hover:bg-chrome-strong disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:size-11"
          >
            <SendIcon />
          </button>
        </Tooltip>
      </div>
      {notes.length > 0 && (
        <div role="status" className="font-ui mt-1 grid gap-1 text-xs font-semibold text-danger">
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      )}
      {(disabledReason || masked || flagged) && (
        <p id="chat-composer-note" role={disabledReason ? undefined : 'status'} className={`font-ui mt-1 text-xs ${flagged ? 'font-semibold text-danger' : 'text-fg-muted'}`}>
          {disabledReason ??
            (flagged
              ? "Please don't use profanity or offensive language. These words will be hidden when you send, and repeated use can get your messaging blocked or your account banned."
              : 'Some words were hidden. Repeated use of this language can lead to your messaging being blocked or your account banned.')}
        </p>
      )}
    </form>
  )
}
