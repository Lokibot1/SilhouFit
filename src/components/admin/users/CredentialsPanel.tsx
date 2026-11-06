import { useEffect, useRef, useState } from 'react'
import type { Credentials } from '../../../types/accounts'
import { formatCredentials } from '../../../service/credentials'
import { downloadCredentialsImage } from '../../../utils/credentialsImage'
import { CopyIcon, DownloadIcon, PrinterIcon, SpinnerIcon } from '../../form/icons'
import { useToast } from '../../toast/useToast'
import { SECONDARY_BUTTON_SM } from '../../ui/buttonStyles'
import { Tooltip } from '../../ui/Tooltip'

function CopyButton({ label, onCopy }: { label: string; onCopy: () => void }) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onCopy}
        className="flex size-11 shrink-0 cursor-pointer print:hidden items-center justify-center rounded-xl text-fg-muted hover:bg-line/60 hover:text-chrome-strong"
      >
        <CopyIcon />
      </button>
    </Tooltip>
  )
}

/** One labelled value in its own block, with its copy button. */
function Block({ label, value, onCopy, strong }: { label: string; value: string; onCopy?: () => void; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 ${strong ? 'border-fg' : 'border-line'}`}>
      <div className="min-w-0">
        <p className="text-sm text-fg-muted">{label}</p>
        <p className="font-mono text-lg font-semibold break-all text-fg select-all">{value}</p>
      </div>
      {onCopy && <CopyButton label={`Copy ${label.toLowerCase()}`} onCopy={onCopy} />}
    </div>
  )
}

/** Marks <html> while the browser prints, so the print stylesheet keeps only the card. */
function printCard() {
  const root = document.documentElement
  root.classList.add('printing-credentials')
  window.addEventListener('afterprint', () => root.classList.remove('printing-credentials'), { once: true })
  window.print()
}

/** The credentials of a new or reset account, shown once: the username and the temporary password apart, with copy, download and print. */
export function CredentialsPanel({
  credentials,
  heading,
  canReset = true,
  demo = true,
}: {
  credentials: Credentials
  heading: string
  canReset?: boolean
  /** The account lives in this browser only. False for one the server made: no demo note, no reset hint. */
  demo?: boolean
}) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // The form that held the focus is gone, so the focus moves to the new content.
  useEffect(() => headingRef.current?.focus(), [])

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.show({ kind: 'success', message: `${what} copied` })
    } catch {
      toast.show({ kind: 'error', message: `Couldn't copy the ${what.toLowerCase()}. Your browser blocked clipboard access, so select it and copy it by hand.` })
    }
  }

  async function download() {
    setSaving(true)
    try {
      await downloadCredentialsImage(credentials, heading, demo)
      toast.show({ kind: 'success', message: 'Credentials image downloaded' })
    } catch {
      toast.show({ kind: 'error', message: "Couldn't make the image. Your browser could not draw it, so copy the details or print the card instead." })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4 pb-5">
      <div className="credentials-sheet grid gap-3 rounded-xl border border-line bg-canvas-sub p-4">
        <div>
          <h3 ref={headingRef} tabIndex={-1} className="display text-lg text-fg outline-none">{heading}</h3>
          <p className="text-xs text-fg-muted">Hand these to the account holder. They choose their own password at first sign-in.</p>
        </div>
        {demo && <Block label="Username" value={credentials.username} onCopy={() => void copy(credentials.username, 'Username')} />}
        <Block label="Sign-in email" value={credentials.email} onCopy={demo ? undefined : () => void copy(credentials.email, 'Email')} />
        <Block label="Temporary password" value={credentials.password} onCopy={() => void copy(credentials.password, 'Password')} strong />
      </div>
      <p role="note" className="text-xs text-fg-muted">
        This is the only time the password is shown.
        {demo && (canReset ? ' If it is lost, reset the password to make a new one.' : ' A superadmin password cannot be reset, so keep it safe.')}
        {demo && ' Demo only, not secure: these accounts live in this browser.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void copy(formatCredentials(credentials, demo), 'Credentials')} className={SECONDARY_BUTTON_SM}>
          <CopyIcon />
          Copy both
        </button>
        <button type="button" onClick={() => void download()} disabled={saving} aria-busy={saving} className={SECONDARY_BUTTON_SM}>
          {saving ? <SpinnerIcon /> : <DownloadIcon />}
          {demo ? 'Download image' : saving ? 'Preparing PNG…' : 'Download as PNG'}
        </button>
        <button type="button" onClick={printCard} className={SECONDARY_BUTTON_SM}>
          <PrinterIcon />
          Print
        </button>
      </div>
    </div>
  )
}
