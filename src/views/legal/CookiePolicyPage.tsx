import {
  LegalPageLayout,
  LegalSection,
} from '../../components/legal/LegalPageLayout'

export function CookiePolicyPage() {
  return (
    <LegalPageLayout
      title="Cookie policy"
      lastUpdated="September 27, 2026"
      scopeNote="This policy covers what this site actually stores in your browser today, and what categories the full platform is designed to use once it is live."
    >
      <LegalSection heading="What this site uses today">
        <p>
          This site stores these in your browser&apos;s storage: your light
          or dark theme choice, whether you accepted or rejected this
          cookie notice, your sign-in session, your cart and wishlist, your
          progress through the welcome tour, a summary of your last order,
          and the delivery address you save, which stays on this device. No
          analytics, advertising, or tracking cookies are set. Rejecting
          the notice only stops it from reappearing; it does not remove
          these, which the site needs to work.
        </p>
      </LegalSection>

      <LegalSection heading="Categories planned for the live platform">
        <p>
          None of the categories below are active on this site. They
          describe what the full platform is designed to use once
          boutiques and shoppers are on it.
        </p>
        <p>
          <span className="font-semibold text-fg">
            Strictly necessary.
          </span>{' '}
          Keeping you signed in and remembering the contents of your cart.
        </p>
        <p>
          <span className="font-semibold text-fg">
            Functional.
          </span>{' '}
          Remembering preferences such as size and theme.
        </p>
        <p>
          <span className="font-semibold text-fg">
            Analytics.
          </span>{' '}
          Aggregated, non-identifying usage data used to improve the
          catalog and the fitting module.
        </p>
      </LegalSection>

      <LegalSection heading="Managing storage">
        <p>
          You can clear local storage for this site at any time through
          your browser settings, which will reset your theme, sign you out,
          empty your cart and remove your saved address, and reshow the
          cookie notice.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          Updates will be posted on this page with a new date at the top.
        </p>
      </LegalSection>
    </LegalPageLayout>
  )
}
