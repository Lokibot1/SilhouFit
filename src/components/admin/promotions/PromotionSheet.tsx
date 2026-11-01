import { useRef, useState, type FormEvent } from 'react'
import { createPromotion, getPromotions, updatePromotion, type PromoAppliesTo, type PromoType, type PromotionInput, type PromotionRow } from '../../../service/promotions'
import { filterPriceInput, withCommas } from '../../../utils/format'
import { addDays, manilaToday } from '../../../utils/period'
import {
  PROMO_LIMITS,
  PROMOTION_FIELD_ORDER,
  sanitizeCode,
  sanitizeName,
  validatePromotion,
  type PromotionErrors,
  type PromotionField,
  type PromotionFormValues,
} from '../../../utils/promotionValidation'
import { AlertIcon, SpinnerIcon } from '../../form/icons'
import { Field, FIELD_INPUT, SELECT_FLAT, SelectField } from '../../staff/inventory/FormField'
import { useToast } from '../../toast/useToast'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { DateRangeField } from '../../ui/DateRangeField'
import { Modal } from '../../ui/Modal'
import { Select } from '../../ui/Select'
import { PromotionAppliesTo } from './PromotionAppliesTo'

/** Placeholders sit clearly dimmer than typed text yet stay above 4.5:1 on the page colour in both themes. */
const FORM_ID = 'promotion-form'
const fieldId = (name: PromotionField) => `promo-${name === 'endsAt' ? 'startsAt' : name}`

const TYPE_OPTIONS: { value: PromoType; label: string }[] = [
  { value: 'percent', label: 'Percent off' },
  { value: 'fixed', label: 'Pesos off' },
]

/** The fields typed as text; "Applies to" holds a choice instead. */
type TextField = Exclude<PromotionField, 'appliesTo'>

const without = (errors: PromotionErrors, name: PromotionField): PromotionErrors => Object.fromEntries(Object.entries(errors).filter(([key]) => key !== name))

function initial(promotion: PromotionRow | null): PromotionFormValues {
  if (!promotion) {
    const today = manilaToday().date
    return { name: '', code: '', type: 'percent', value: '', appliesTo: { scope: 'all' }, startsAt: today, endsAt: addDays(today, 7), usageLimit: '', minSpend: '' }
  }
  return {
    name: promotion.name,
    code: promotion.code,
    type: promotion.type,
    value: String(promotion.value),
    appliesTo: promotion.appliesTo,
    startsAt: promotion.startsAt,
    endsAt: promotion.endsAt,
    usageLimit: promotion.usageLimit === null ? '' : String(promotion.usageLimit),
    minSpend: promotion.minSpend === null ? '' : String(promotion.minSpend),
  }
}

interface PromotionSheetProps {
  open: boolean
  onClose: () => void
  /** The promotion to change; null creates a new one. */
  promotion: PromotionRow | null
}

/** Creates or edits a promotion. Give it a new `key` for every open so it starts from the promotion (or empty). */
export function PromotionSheet({ open, onClose, promotion }: PromotionSheetProps) {
  const toast = useToast()
  const editing = promotion !== null
  const [values, setValues] = useState(() => initial(promotion))
  const [touched, setTouched] = useState<Partial<Record<PromotionField, boolean>>>({})
  const [serverErrors, setServerErrors] = useState<PromotionErrors>({})
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const inFlight = useRef(false)

  const all = validatePromotion(values, getPromotions(), promotion?.id)
  const errors: PromotionErrors = { ...Object.fromEntries(Object.entries(all).filter(([name]) => touched[name as PromotionField])), ...serverErrors }

  function setField(name: TextField, raw: string) {
    const clean =
      name === 'name'
        ? sanitizeName(raw)
        : name === 'code'
          ? sanitizeCode(raw)
          : name === 'usageLimit'
            ? raw.replace(/\D/g, '').slice(0, 7)
            : name === 'value' && values.type === 'percent'
              ? raw.replace(/\D/g, '').slice(0, 3)
              : name === 'value' || name === 'minSpend'
                ? (filterPriceInput(raw) ?? values[name])
                : raw
    setValues((current) => ({ ...current, [name]: clean }))
    setServerErrors((current) => without(current, name))
    setFailure(null)
  }

  function setDates(startsAt: string, endsAt: string) {
    setValues((current) => ({ ...current, startsAt, endsAt }))
    setServerErrors((current) => without(without(current, 'startsAt'), 'endsAt'))
    setFailure(null)
  }

  function setAppliesTo(appliesTo: PromoAppliesTo) {
    setValues((current) => ({ ...current, appliesTo }))
    setServerErrors((current) => without(current, 'appliesTo'))
    setFailure(null)
  }

  function setType(type: PromoType) {
    setValues((current) => ({ ...current, type, value: '' }))
    setTouched((current) => ({ ...current, value: false }))
    setServerErrors((current) => without(current, 'value'))
  }

  async function submit() {
    if (inFlight.current) return
    setTouched(Object.fromEntries(PROMOTION_FIELD_ORDER.map((name) => [name, true])))
    const first = PROMOTION_FIELD_ORDER.find((name) => all[name])
    if (first) {
      document.getElementById(fieldId(first))?.focus()
      return
    }
    const input: PromotionInput = {
      name: values.name.trim(),
      code: values.code.trim(),
      type: values.type,
      value: Number(values.value),
      appliesTo: values.appliesTo,
      startsAt: values.startsAt,
      endsAt: values.endsAt,
      usageLimit: values.usageLimit.trim() ? Number(values.usageLimit) : null,
      minSpend: values.minSpend.trim() ? Number(values.minSpend) : null,
    }
    inFlight.current = true
    setPending(true)
    setFailure(null)
    try {
      if (promotion) await updatePromotion(promotion.id, input)
      else await createPromotion(input)
      toast.show({ kind: 'success', message: `Promotion "${input.name}" ${editing ? 'saved' : 'created'}` })
      onClose()
    } catch (error) {
      const { kind, field, message } = error as { kind?: string; field?: PromotionField; message: string }
      if (kind === 'conflict') {
        setServerErrors({ code: 'Another promotion already uses this code. Choose a different one.' })
        document.getElementById(fieldId('code'))?.focus()
      } else if (kind === 'validation' && field) {
        setServerErrors({ [field]: message })
        document.getElementById(fieldId(field))?.focus()
      } else {
        setFailure(`The request failed before anything was saved, so ${editing ? 'the promotion is unchanged' : 'no promotion was made'}. Check your connection, then try again. What you typed is still here.`)
      }
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  const input = (name: TextField, extra: { inputMode?: 'numeric' | 'decimal'; className?: string; hint?: boolean } = {}) => ({
    id: fieldId(name),
    value: name === 'value' || name === 'usageLimit' || name === 'minSpend' ? withCommas(values[name]) : values[name],
    readOnly: pending,
    onChange: (event: { target: { value: string } }) => setField(name, event.target.value),
    onBlur: () => setTouched((current) => ({ ...current, [name]: true })),
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': [errors[name] && `${fieldId(name)}-error`, extra.hint && `${fieldId(name)}-hint`].filter(Boolean).join(' ') || undefined,
    autoComplete: 'off',
    inputMode: extra.inputMode,
    spellCheck: false,
    className: extra.className ?? FIELD_INPUT,
  })
  const hint = (name: PromotionField, text: string) => (
    <p id={`${fieldId(name)}-hint`} className="text-xs text-fg-muted">
      {text}
    </p>
  )

  return (
    <Modal
      variant="sheet"
      open={open}
      onClose={pending ? () => {} : onClose}
      title={promotion ? `Edit ${promotion.name}` : 'Create promotion'}
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={pending} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button type="submit" form={FORM_ID} disabled={pending} aria-busy={pending} className={PRIMARY_BUTTON}>
            {pending && <SpinnerIcon />}
            {pending ? (editing ? 'Saving…' : 'Creating…') : editing ? 'Save changes' : 'Create promotion'}
          </button>
        </div>
      }
    >
      <form
        id={FORM_ID}
        noValidate
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          void submit()
        }}
        aria-busy={pending}
        className="grid gap-4 pb-5"
      >
        <Field id={fieldId('name')} label="Name" count={{ value: values.name.length, max: PROMO_LIMITS.nameMax }} error={errors.name}>
          <input {...input('name')} type="text" />
        </Field>
        <Field id={fieldId('code')} label="Code" count={{ value: values.code.length, max: PROMO_LIMITS.codeMax }} error={errors.code}>
          <input {...input('code', { className: `${FIELD_INPUT} font-mono uppercase`, hint: true })} type="text" placeholder="SUMMER20" />
          {hint('code', 'Shoppers type this at checkout. Capital letters and numbers only.')}
        </Field>
        <SelectField label="Type">
          <Select label="Discount type" value={values.type} options={TYPE_OPTIONS} onChange={setType} className={SELECT_FLAT} />
        </SelectField>
        <Field id={fieldId('value')} label={values.type === 'percent' ? 'Percent off' : 'Pesos off'} error={errors.value}>
          <input
            {...input('value', { inputMode: values.type === 'percent' ? 'numeric' : 'decimal', className: `${FIELD_INPUT} tabular-nums` })}
            type="text"
            placeholder={values.type === 'percent' ? '20' : '200'}
          />
        </Field>
        <PromotionAppliesTo id={fieldId('appliesTo')} value={values.appliesTo} onChange={setAppliesTo} error={errors.appliesTo} disabled={pending} />
        <DateRangeField
          id={fieldId('startsAt')}
          label="Sale dates"
          start={values.startsAt}
          end={values.endsAt}
          error={errors.startsAt ?? errors.endsAt}
          disabled={pending}
          onChange={setDates}
          onBlur={() => setTouched((current) => ({ ...current, startsAt: true, endsAt: true }))}
        />
        <Field id={fieldId('usageLimit')} label="Usage limit" optional error={errors.usageLimit}>
          <input {...input('usageLimit', { inputMode: 'numeric', className: `${FIELD_INPUT} tabular-nums`, hint: true })} type="text" placeholder="No limit" />
          {hint('usageLimit', 'The most times the code can be used in total. Leave it empty for no limit.')}
        </Field>
        <Field id={fieldId('minSpend')} label="Minimum spend" optional error={errors.minSpend}>
          <input {...input('minSpend', { inputMode: 'decimal', className: `${FIELD_INPUT} tabular-nums`, hint: true })} type="text" placeholder="No minimum" />
          {hint('minSpend', 'The order total in pesos needed before the code works. Leave it empty for no minimum.')}
        </Field>
        {failure && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger p-3">
            <AlertIcon size={20} className="mt-0.5 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">{`We couldn't ${editing ? 'save' : 'create'} the promotion.`}</p>
              <p className="mt-1 text-sm text-fg-muted">{failure}</p>
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}
