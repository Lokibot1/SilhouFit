import { SIZES_BY_CATEGORY } from '../../../data/products'
import type { ProductFormValues } from '../../../utils/productValidation'
import { Select } from '../../ui/Select'
import { CustomSizingEditor } from '../measurements/CustomSizingEditor'
import { SELECT_FLAT, SelectField } from './FormField'

interface SizingPickerProps {
  values: ProductFormValues
  disabled: boolean
  error: (key: string) => string | undefined
  touch: (key: string) => void
  set: (patch: Partial<ProductFormValues>) => void
}

/** Whether the product follows its category's base sizes or has sizes of its own, typed here and sent with its variants. */
export function SizingPicker({ values, disabled, error, touch, set }: SizingPickerProps) {
  const { category, sizingMode } = values
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
          onChange={(mode) => (mode === 'base' ? set({ sizingMode: 'base', sizes: baseSizes, custom: [] }) : set({ sizingMode: 'custom' }))}
        />
      </SelectField>
      {sizingMode === 'base' ? (
        <p className="text-xs text-fg-muted">
          Uses the {category} sizes from Base measurements. Each variant gets its size&apos;s base measurements when the product is created. Pick the sizes this product comes in below.
        </p>
      ) : (
        <>
          <p className="text-xs text-fg-muted">This product has its own sizes and measurements, sent with its variants when it is created. Other products are not affected.</p>
          <CustomSizingEditor
            category={category}
            draft={values.sizingDraft}
            onChange={(sizingDraft) => set({ sizingDraft })}
            idPrefix="pf-sizing"
            error={(key) => error(`sizing:${key}`)}
            touch={(key) => touch(`sizing:${key}`)}
          />
        </>
      )}
    </fieldset>
  )
}
