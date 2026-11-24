import { filterMeasurement, describedBy } from '../../../utils/productValidation'
import { newSizingRow, SIZING_ROWS_MAX, sizingColumns, type SizingDraft, type SizingRow } from '../../../utils/customSizing'
import { filterSizeLabel, SIZE_MAX } from '../../../utils/sizeMeasurementValidation'
import { PlusIcon, TrashIcon } from '../../form/icons'
import { DANGER_BUTTON_SM, SECONDARY_BUTTON_SM } from '../../ui/buttonStyles'
import { Field, FIELD_INPUT } from '../inventory/FormField'

interface CustomSizingEditorProps {
  category: string
  draft: SizingDraft
  onChange: (draft: SizingDraft) => void
  /** Prefix of the field ids: `${idPrefix}-size:<row>`, `${idPrefix}-m:<row>:<key>`, `${idPrefix}-row:<row>`. */
  idPrefix: string
  /** The error to show for a key (see validateSizingDraft), or undefined. */
  error: (key: string) => string | undefined
  touch: (key: string) => void
}

/** A product's own sizes, each with the measurements (cm) its category asks for. */
export function CustomSizingEditor({ category, draft, onChange, idPrefix, error, touch }: CustomSizingEditorProps) {
  const columns = sizingColumns(category)

  const setRow = (id: string, patch: (row: SizingRow) => SizingRow) => onChange({ ...draft, rows: draft.rows.map((row) => (row.id === id ? patch(row) : row)) })

  return (
    <div className="grid gap-4">
      <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
        <legend className="text-sm font-semibold text-fg">Sizes and measurements (cm)</legend>
        {draft.rows.map((row, index) => {
          const sizeId = `${idPrefix}-size:${row.id}`
          const sizeError = error(`size:${row.id}`)
          const rowError = error(`row:${row.id}`)
          return (
            <div key={row.id} id={`${idPrefix}-row:${row.id}`} tabIndex={-1} className="grid gap-3 rounded-xl border border-line bg-canvas p-3 outline-none">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Field id={sizeId} label={`Size ${index + 1}`} error={sizeError}>
                    <input
                      id={sizeId}
                      type="text"
                      autoComplete="off"
                      maxLength={SIZE_MAX}
                      value={row.size}
                      aria-invalid={Boolean(sizeError)}
                      aria-describedby={describedBy(sizeId, sizeError)}
                      onChange={(event) => setRow(row.id, (r) => ({ ...r, size: filterSizeLabel(event.target.value) }))}
                      onBlur={() => touch(`size:${row.id}`)}
                      className={FIELD_INPUT}
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  disabled={draft.rows.length === 1}
                  aria-label={`Remove size ${row.size || index + 1}`}
                  onClick={() => onChange({ ...draft, rows: draft.rows.filter((r) => r.id !== row.id) })}
                  className={DANGER_BUTTON_SM}
                >
                  <TrashIcon />
                  Remove
                </button>
              </div>
              {rowError && (
                <p role="alert" className="text-sm text-danger">
                  {rowError}
                </p>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {columns.map(({ key, label, min, max }) => {
                  const id = `${idPrefix}-m:${row.id}:${key}`
                  const problem = error(`m:${row.id}:${key}`)
                  return (
                    <Field key={key} id={id} label={label} error={problem}>
                      <input
                        id={id}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder={`${min}–${max}`}
                        value={row.measurements[key]}
                        aria-invalid={Boolean(problem)}
                        aria-describedby={describedBy(id, problem)}
                        onChange={(event) => setRow(row.id, (r) => ({ ...r, measurements: { ...r.measurements, [key]: filterMeasurement(event.target.value) } }))}
                        onBlur={() => touch(`m:${row.id}:${key}`)}
                        className={`${FIELD_INPUT} text-right tabular-nums`}
                      />
                    </Field>
                  )
                })}
              </div>
            </div>
          )
        })}
        <button type="button" disabled={draft.rows.length >= SIZING_ROWS_MAX} onClick={() => onChange({ ...draft, rows: [...draft.rows, newSizingRow()] })} className={`${SECONDARY_BUTTON_SM} justify-self-start`}>
          <PlusIcon />
          Add size
        </button>
        {draft.rows.length >= SIZING_ROWS_MAX && <p className="text-xs text-fg-muted">A product holds up to {SIZING_ROWS_MAX} sizes.</p>}
      </fieldset>
    </div>
  )
}
