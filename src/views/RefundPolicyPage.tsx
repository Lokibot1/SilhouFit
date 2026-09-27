import {
  LegalPageLayout,
  LegalSection,
} from '../components/legal/LegalPageLayout'

export function RefundPolicyPage() {
  return (
    <LegalPageLayout
      title="Refund policy"
      lastUpdated="September 27, 2026"
      scopeNote="SilhouFit is a capstone prototype. This policy describes the default return and refund handling the platform is designed to support. An individual boutique may set a different window or exceptions on its product pages, which would take precedence over the default below."
    >
      <LegalSection heading="Return window">
        <p>
          Unless a product page states otherwise, items can be returned
          within 7 days of delivery or pickup, unworn, unwashed, and with
          original tags attached.
        </p>
      </LegalSection>

      <LegalSection heading="Items that cannot be returned">
        <p>
          Items marked final sale, intimate apparel and undergarments for
          hygiene reasons, and items altered or made to custom
          measurements.
        </p>
      </LegalSection>

      <LegalSection heading="Returning a Buy Online, Pick Up In-Store order">
        <p>
          These orders can be returned at the boutique where they were
          picked up, or by mail where the boutique offers that option.
        </p>
      </LegalSection>

      <LegalSection heading="Refund method and timing">
        <p>
          Approved refunds are issued to the original payment method.
          Processing typically takes 5 to 10 business days after the
          returned item is received and inspected.
        </p>
      </LegalSection>

      <LegalSection heading="Damaged or incorrect items">
        <p>
          Report a damaged or incorrect item within 48 hours of delivery or
          pickup. The boutique will arrange a replacement or a full
          refund, including return shipping where applicable, at no cost
          to you.
        </p>
      </LegalSection>

      <LegalSection heading="The AR fitting preview and returns">
        <p>
          The fitting preview is meant to reduce size-related returns, but
          it is an estimate and does not guarantee an exact fit. The
          standard return window above still applies to items that do not
          fit as expected.
        </p>
      </LegalSection>

      <LegalSection heading="Starting a return">
        <p>
          Contact the boutique directly, or write to{' '}
          <a
            href="mailto:team@silhoufit.dev"
            className="underline decoration-garnet decoration-2 underline-offset-2"
          >
            team@silhoufit.dev
          </a>{' '}
          with your order number.
        </p>
      </LegalSection>
    </LegalPageLayout>
  )
}
