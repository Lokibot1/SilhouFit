import {
  LegalPageLayout,
  LegalSection,
} from '../components/legal/LegalPageLayout'

export function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="Privacy policy"
      lastUpdated="September 27, 2026"
      scopeNote="SilhouFit is a capstone prototype. This policy describes how the platform is designed to handle data once boutiques and shoppers are using it. The site you are viewing today does not have accounts, checkout, or a live camera-based fitting session connected to it. The only thing it currently stores in your browser is your theme choice and your cookie preference, covered in the cookie policy."
    >
      <LegalSection heading="Information the platform is designed to collect">
        <p>
          Account details such as name, email address, and shipping
          address. Order history and purchase records from both the
          storefront and in-store point-of-sale terminals. Sizing
          preferences and wishlist items saved to a customer profile. Video
          frames from your device&apos;s camera during a fitting session,
          used to estimate body landmarks and scale a garment model. Basic
          device and browser information used for security and
          troubleshooting.
        </p>
      </LegalSection>

      <LegalSection heading="How camera data is handled">
        <p>
          Pose tracking for the AR fitting module runs on your own device,
          in your browser. Camera frames are processed there to estimate
          body landmarks and are not uploaded to or stored on SilhouFit
          servers as part of that process.
        </p>
      </LegalSection>

      <LegalSection heading="How information would be used">
        <p>
          To fulfill orders and coordinate pickup or delivery, keep
          inventory accurate across the store and the site, remember sizing
          preferences and wishlist items, improve the accuracy of the
          fitting module, and prevent fraud.
        </p>
      </LegalSection>

      <LegalSection heading="Who information is shared with">
        <p>
          The boutique you are shopping at, for order fulfillment. A
          third-party payment processor, to complete a transaction. Law
          enforcement or regulators, where required by law. Personal data
          is not sold to third parties for advertising.
        </p>
      </LegalSection>

      <LegalSection heading="How long information is kept">
        <p>
          For as long as needed to service an account or order, or as
          required by applicable law. You can request deletion of your
          account data at any time, subject to records a boutique is
          legally required to retain.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          You can request access to, correction of, or deletion of your
          personal data, and request a copy of it, by writing to{' '}
          <a
            href="mailto:team@silhoufit.dev"
            className="underline decoration-bronze decoration-2 underline-offset-2"
          >
            team@silhoufit.dev
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          The platform is not directed at children under 13, and it does
          not knowingly collect personal data from them.
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          Reasonable technical and organizational measures would be used to
          protect stored data. No method of transmission or storage is
          completely secure, and this policy cannot guarantee absolute
          security.
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
