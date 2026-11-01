import { filterMeasurement, describedBy } from '../../../utils/productValidation'
import { filterSizingName, newSizingRow, SIZING_NAME_MAX, SIZING_ROWS_MAX, sizingColumns, type SizingDraft, type SizingRow } from '../../../utils/customSizing'
import { filterSizeLabel, SIZE_MAX } from '../../../utils/sizeMeasurementValidation'
import { PlusIcon } from '../../form/icons'
import { SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Field, FIELD_INPUT } from '../inventory/FormField'

interface CustomSizingEditorProps {
  category: string
  draft: SizingDraft
  onChange: (draft: SizingDraft) => void
  /** Prefix of the field ids: `${idPrefix}-name`, `${idPrefix}-size:<row>`, `${idPrefix}-m:<row>:<key>`, `${idPrefix}-row:<row>`. */
  idPrefix: string
  /** The error to show for a key (see validateSizingDraft), or undefined. */
  error: (key: string) => string | undefined
  touch: (key: string) => void
}

/** The name of a custom sizing and its sizes, each with the measurements (cm) its category asks for. Shared by the product form and the Measurements page. */
export function CustomSizingEditor({ category, draft, onChange, idPrefix, error, touch }: CustomSizingEditorProps) {
  const columns = sizingColumns(category)
  const nameId = `${idPrefix}-name`
  const nameError = error('name')

  const setRow = (id: string, patch: (row: SizingRow) => SizingRow) => onChange({ ...draft, rows: draft.rows.map((row) => (row.id === id ? patch(row) : row)) })

  return (
    <div className="grid gap-4">
      <Field id={nameId} label="Sizing name" count={{ value: draft.name.length, max: SIZING_NAME_MAX }} error={nameError}>
        <input
          id={nameId}
          type="text"
          autoComplete="off"
          placeholder={`e.g. ${category} Custom`}
          value={draft.name}
          aria-invalid={Boolean(nameError)}
          aria-describedby={describedBy(nameId, nameError, true)}
          onChange={(event) => onChange({ ...draft, name: filterSizingName(event.target.value) })}
          onBlur={() => touch('name')}
          className={FIELD_INPUT}
        />
      </Field>

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
                  className={`${SECONDARY_BUTTON} text-sm disabled:opacity-60`}
                >
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
        <button type="button" disabled={draft.rows.length >= SIZING_ROWS_MAX} onClick={() => onChange({ ...draft, rows: [...draft.rows, newSizingRow()] })} className={`${SECONDARY_BUTTON} justify-self-start gap-2 text-sm`}>
          <PlusIcon />
          Add size
        </button>
        {draft.rows.length >= SIZING_ROWS_MAX && <p className="text-xs text-fg-muted">A custom sizing holds up to {SIZING_ROWS_MAX} sizes.</p>}
      </fieldset>
    </div>
  )
}
