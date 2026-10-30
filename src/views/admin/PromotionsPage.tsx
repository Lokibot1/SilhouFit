import { PromotionSummaryCards } from '../../components/admin/promotions/PromotionSummaryCards'
import { PromotionsList } from '../../components/admin/promotions/PromotionsList'
import { Tooltip } from '../../components/ui/Tooltip'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'

const META_DESCRIPTION =
  'Create and manage SilhouFit promotions: set a percent or peso discount code, choose what it applies to and its sale dates, and end or delete it when it is done.'

/** The promotions shoppers can use at checkout: how many are running, and a list to create, edit, end and delete them. */
export function PromotionsPage() {
  useDocumentTitle('Pricing & Promotions — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  return (
    <div className="grid gap-3">
      <header className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-2xl text-fg sm:text-3xl">Pricing &amp; Promotions</h1>
          <p className="mt-1 text-xs text-fg-muted">Discount codes shoppers can use at checkout</p>
        </div>
        <Tooltip label="Promotions are saved in this browser's session only until the pricing backend is connected." describe>
          <span tabIndex={0} className="font-ui inline-flex h-8 items-center rounded-full border border-line-strong px-3 text-sm font-medium text-fg-muted">
            Sample data
          </span>
        </Tooltip>
      </header>
      <PromotionSummaryCards />
      <PromotionsList />
    </div>
  )
}
