import { useId, useRef, useState } from 'react'
import { checkImageFile, describedBy, filterText, IMAGE_TYPES, PRODUCT_LIMITS, type ImageDraft } from '../../../utils/productValidation'
import { PlusIcon } from '../../form/icons'
import { SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Field, FIELD_INPUT } from './FormField'

export const IMAGES_ID = 'pf-images'
const SMALL_BUTTON = `${SECONDARY_BUTTON} text-sm`

interface ImageUploaderProps {
  images: ImageDraft[]
  /** The product name, which the alt text follows until it is edited. */
  name: string
  /** Upload progress by image id, while the form is being sent. */
  progress: Record<string, number>
  disabled: boolean
  error?: string
  errors: Record<string, string>
  onChange: (images: ImageDraft[]) => void
}

let nextId = 0

/** What to call an image: its file name, or "image 2" for one the product already has. */
const fileName = (image: ImageDraft, index: number) => image.file?.name ?? `image ${index + 1}`

/** Up to five JPG, PNG or WebP photos. Files are checked here; they are uploaded when the product is created. */
export function ImageUploader({ images, name, progress, disabled, error, errors, onChange }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [rejected, setRejected] = useState<string[]>([])
  const listId = useId()

  function add(files: FileList | null) {
    const notes: string[] = []
    const accepted: ImageDraft[] = []
    for (const file of Array.from(files ?? [])) {
      const problem = checkImageFile(file)
      if (problem) notes.push(problem)
      else if (images.length + accepted.length >= PRODUCT_LIMITS.imagesMax)
        notes.push(`${file.name} wasn't added. A product holds ${PRODUCT_LIMITS.imagesMax} images at most, so remove one first.`)
      else accepted.push({ id: `img${++nextId}`, file, preview: URL.createObjectURL(file), alt: null })
    }
    setRejected(notes)
    if (accepted.length) onChange([...images, ...accepted])
    if (inputRef.current) inputRef.current.value = ''
  }

  function remove(image: ImageDraft) {
    if (image.file) URL.revokeObjectURL(image.preview)
    onChange(images.filter((i) => i.id !== image.id))
    document.getElementById(IMAGES_ID)?.focus()
  }

  const full = images.length >= PRODUCT_LIMITS.imagesMax
  return (
    <div className="grid gap-2">
      <p id={listId} className="text-sm font-semibold text-fg">
        Images <span className="font-normal text-fg-muted">(JPG, PNG or WebP, 5 MB each, up to 5; the first is the main photo)</span>
      </p>
      <div>
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          multiple
          tabIndex={-1}
          aria-label="Choose image files"
          className="sr-only"
          onChange={(event) => add(event.target.files)}
        />
        <button
          type="button"
          id={IMAGES_ID}
          disabled={disabled || full}
          aria-describedby={describedBy(IMAGES_ID, error)}
          onClick={() => inputRef.current?.click()}
          className={SECONDARY_BUTTON}
        >
          <PlusIcon className="mr-2" />
          Add images
        </button>
      </div>
      {error && (
        <p id={`${IMAGES_ID}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
      {rejected.length > 0 && (
        <ul role="alert" className="grid gap-1 text-sm text-danger">
          {rejected.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {images.length > 0 && (
        <ul aria-labelledby={listId} className="grid gap-3">
          {images.map((image, index) => {
            const percent = progress[image.id]
            const altId = `pf-alt-${image.id}`
            return (
              <li key={image.id} className="flex gap-3 rounded-xl border border-line p-3">
                <img src={image.preview} alt={`Preview of ${fileName(image, index)}`} className="size-16 shrink-0 rounded-xl bg-line object-cover" />
                <div className="grid min-w-0 flex-1 gap-2">
                  <Field id={altId} label="Alt text" error={errors[`alt:${image.id}`]}>
                    <input
                      id={altId}
                      type="text"
                      autoComplete="off"
                      value={image.alt ?? name}
                      placeholder="Defaults to the product name"
                      disabled={disabled}
                      aria-invalid={Boolean(errors[`alt:${image.id}`])}
                      aria-describedby={describedBy(altId, errors[`alt:${image.id}`])}
                      onChange={(event) =>
                        onChange(images.map((i) => (i.id === image.id ? { ...i, alt: filterText(event.target.value, PRODUCT_LIMITS.altMax) } : i)))
                      }
                      className={FIELD_INPUT}
                    />
                  </Field>
                  {percent !== undefined && !image.url && (
                    <div className="flex items-center gap-2">
                      <progress max={100} value={percent} aria-label={`Upload progress for ${fileName(image, index)}`} className="h-2 min-w-0 flex-1" />
                      <span className="w-10 text-right text-sm tabular-nums text-fg-muted">{percent}%</span>
                    </div>
                  )}
                  {image.url && percent !== undefined && <p className="text-sm text-fg-muted">Uploaded</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    {index === 0 ? (
                      <span className="font-ui text-sm font-semibold text-fg">Main photo</span>
                    ) : (
                      <button
                        type="button"
                        disabled={disabled}
                        aria-label={`Make ${fileName(image, index)} the main photo`}
                        onClick={() => onChange([image, ...images.filter((i) => i.id !== image.id)])}
                        className={SMALL_BUTTON}
                      >
                        Make primary
                      </button>
                    )}
                    <button type="button" disabled={disabled} aria-label={`Remove ${fileName(image, index)}`} onClick={() => remove(image)} className={SMALL_BUTTON}>
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
