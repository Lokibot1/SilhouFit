import { SIZES_BY_CATEGORY } from '../../../data/products'
import { useCustomSizings } from '../../../service/customSizings'
import type { ProductFormValues } from '../../../utils/productValidation'
import { Select } from '../../ui/Select'
import { CustomSizingEditor } from '../measurements/CustomSizingEditor'
import { SELECT_FLAT, SelectField } from './FormField'

const NEW = ''

interface SizingPickerProps {
  values: ProductFormValues
  disabled: boolean
  error: (key: string) => string | undefined
  touch: (key: string) => void
  set: (patch: Partial<ProductFormValues>) => void
  /** The Edit details form: the product's variants are managed on their own, so changing the sizing leaves them as they are. */
  editing?: boolean
}

/** Whether the product follows its category's base sizes or has a sizing of its own (a saved one, or a new one typed here and saved with the product). */
export function SizingPicker({ values, disabled, error, touch, set, editing = false }: SizingPickerProps) {
  const { category, sizingMode, sizingId } = values
  const saved = useCustomSizings(category)
  const chosen = saved.find((s) => s.id === sizingId)
  const baseSizes = SIZES_BY_CATEGORY[category] ?? []

  return (
    <fieldset disabled={disabled} className="m-0 grid min-w-0 gap-3 border-0 p-0">
      <legend className="sr-only">Sizing</legend>
      <SelectField label="Sizing">
        <Select
          className={SELECT_FLAT}
          label="Sizing"
          value={sizingMode}
          options={[
            { value: 'base', label: `${category} base sizes` },
            { value: 'custom', label: 'Custom sizing' },
          ]}
          onChange={(mode) => (mode === 'base' ? set({ sizingMode: 'base', sizingId: NEW, sizes: baseSizes, custom: [] }) : set({ sizingMode: 'custom' }))}
        />
      </SelectField>
      {sizingMode === 'base' ? (
        <p className="text-xs text-fg-muted">
          Uses the {category} sizes from Base measurements, so the size guide and AR fitting read them from there.{editing ? '' : " Each variant starts with its size's base measurements. Pick the sizes this product comes in below."}
        </p>
      ) : (
        <>
          <p className="text-xs text-fg-muted">
            This product has its own sizes and measurements. It is saved under {category} in Base measurements, so other {category.toLowerCase()} products can use it too.
            {editing ? " The product's existing variants keep their sizes." : ''}
          </p>
          <SelectField label="Custom sizing">
            <Select
              className={SELECT_FLAT}
              label="Custom sizing"
              value={sizingId}
              options={[{ value: NEW, label: 'New custom sizing' }, ...saved.map((s) => ({ value: s.id, label: s.name }))]}
              onChange={(id) => set({ sizingId: id })}
            />
          </SelectField>
          {chosen ? (
            <p className="text-xs text-fg-muted">
              Sizes: <span className="font-semibold text-fg">{chosen.sizes.map((s) => s.size).join(', ')}</span>. Edit its measurements in Base measurements.
            </p>
          ) : (
            <CustomSizingEditor
              category={category}
              draft={values.sizingDraft}
              onChange={(sizingDraft) => set({ sizingDraft })}
              idPrefix="pf-sizing"
              error={(key) => error(`sizing:${key}`)}
              touch={(key) => touch(`sizing:${key}`)}
            />
          )}
        </>
      )}
    </fieldset>
  )
}
