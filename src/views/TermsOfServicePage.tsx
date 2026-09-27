import {
  LegalPageLayout,
  LegalSection,
} from '../components/legal/LegalPageLayout'

export function TermsOfServicePage() {
  return (
    <LegalPageLayout
      title="Terms of service"
      lastUpdated="September 27, 2026"
      scopeNote="SilhouFit is a capstone prototype for a Bachelor of Science in Information Technology program. These terms describe how the platform is designed to operate once boutiques and shoppers are using it, and apply to that intended use."
    >
      <LegalSection heading="Acceptance of these terms">
        <p>
          Using the platform, once it is live, means you agree to these
          terms. If you do not agree, do not use the platform.
        </p>
      </LegalSection>

      <LegalSection heading="The service">
        <p>
          SilhouFit connects a local apparel boutique&apos;s in-store point
          of sale with an online storefront, offers an in-browser
          augmented-reality fitting preview, and provides Buy Online, Pick
          Up In-Store fulfillment.
        </p>
      </LegalSection>

      <LegalSection heading="Accounts">
        <p>
          You are responsible for the accuracy of the information on your
          account and for keeping your login credentials confidential. You
          are responsible for activity that happens under your account.
        </p>
      </LegalSection>

      <LegalSection heading="Orders and pricing">
        <p>
          Product availability and prices are set by the boutique and can
          change without notice. Placing an order is a request to
          purchase; an order is confirmed once the boutique accepts it.
        </p>
      </LegalSection>

      <LegalSection heading="The AR fitting preview">
        <p>
          The fitting module estimates how a garment may sit on your body
          using camera-based pose tracking. It is a guide, not a
          guarantee. Lighting, camera quality, posture, and the accuracy of
          the underlying garment model can all affect the preview, and the
          delivered garment&apos;s fit may differ from what the preview
          showed.
        </p>
      </LegalSection>

      <LegalSection heading="Pickup and delivery">
        <p>
          Buy Online, Pick Up In-Store orders must be collected within the
          window stated at checkout, with a valid order confirmation.
          Orders not collected within that window may be canceled and
          refunded under the refund policy.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>
          You agree not to scrape or resell catalog data, attempt to
          circumvent inventory or pricing controls, interfere with the AR
          module&apos;s operation, or use the platform for fraudulent
          transactions.
        </p>
      </LegalSection>

      <LegalSection heading="Intellectual property">
        <p>
          SilhouFit branding and software belong to the SilhouFit project.
          Product images, descriptions, and 3D garment models belong to
          the boutique that uploaded them.
        </p>
      </LegalSection>

      <LegalSection heading="Third-party services">
        <p>
          Payments are processed by a third-party payment provider, whose
          own terms apply to that transaction. SilhouFit does not store
          full payment card details.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          The platform is provided as is. To the extent permitted by law,
          SilhouFit is not liable for indirect or consequential losses
          arising from use of the platform, including losses arising from
          reliance on the AR fitting preview.
        </p>
      </LegalSection>

      <LegalSection heading="Termination">
        <p>
          Access can be suspended or ended for violation of these terms or
          suspected fraud.
        </p>
      </LegalSection>

      <LegalSection heading="Governing law">
        <p>These terms are governed by the laws of the Philippines.</p>
      </LegalSection>

      <LegalSection heading="Changes to these terms">
        <p>
          Updates will be posted on this page with a new date at the top.
        </p>
      </LegalSection>
    </LegalPageLayout>
  )
}
