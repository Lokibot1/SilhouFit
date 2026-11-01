import { useRef, type ChangeEvent } from 'react'
import { formatFileSize } from '../../utils/fileSize'
import { AlertIcon } from '../form/icons'
import { Avatar } from '../ui/Avatar'
import { SECONDARY_BUTTON } from '../ui/buttonStyles'

interface AvatarPickerProps {
  name: string
  /** What the preview shows: a chosen photo's local URL or the saved one. Undefined shows the initials. */
  src?: string
  /** The chosen photo, so its name and size are shown. */
  file?: File
  onPick: (file: File) => void
  onRemove: () => void
  /** Whether there is a photo to remove. */
  removable: boolean
  /** Upload percentage while a photo is uploading. */
  progress: number | null
  error?: string
  disabled: boolean
}

/** The profile photo in the edit dialog: preview, choose, remove and upload progress. */
export function AvatarPicker({ name, src, file, onPick, onRemove, removable, progress, error, disabled }: AvatarPickerProps) {
  const input = useRef<HTMLInputElement>(null)

  function change(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // so choosing the same file again still fires
    if (file) onPick(file)
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <Avatar name={name} src={src} size="lg" />
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => input.current?.click()} disabled={disabled} className={SECONDARY_BUTTON}>
            {src ? 'Change photo' : 'Add photo'}
          </button>
          {removable && (
            <button type="button" onClick={onRemove} disabled={disabled} className={SECONDARY_BUTTON}>
              Remove photo
            </button>
          )}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={change} hidden />
      </div>

      {file && (
        <p className="mt-3 truncate text-sm text-fg-muted">
          {file.name} · <span className="tabular-nums">{formatFileSize(file.size)}</span>
        </p>
      )}

      {progress !== null && (
        <div className="mt-3 flex items-center gap-3">
          <div role="progressbar" aria-label="Uploading photo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-2 flex-1 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-fg" style={{ width: `${progress}%` }} />
          </div>
          <span className="w-10 text-right text-sm text-fg-muted tabular-nums">{progress}%</span>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 px-1 text-xs leading-snug text-danger">
          <AlertIcon className="mt-px size-3.5" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
