import type { ReactNode } from 'react'

export type LegalDoc = 'terms' | 'privacy'

export interface LegalDocument {
  title: string
  lastUpdated: string
  scopeNote: string
  sections: { heading: string; body: ReactNode }[]
}

export const TERMS: LegalDocument = {
  title: 'Terms of service',
  lastUpdated: 'September 27, 2026',
  scopeNote:
    'SilhouFit is a capstone prototype for a Bachelor of Science in Information Technology program. These terms describe how the platform is designed to operate once boutiques and shoppers are using it, and apply to that intended use.',
  sections: [
    {
      heading: 'Acceptance of these terms',
      body: (
        <p>
          Using the platform, once it is live, means you agree to these
          terms. If you do not agree, do not use the platform.
        </p>
      ),
    },
    {
      heading: 'The service',
      body: (
        <p>
          SilhouFit connects a local apparel boutique&apos;s in-store point
          of sale with an online storefront, offers an in-browser
          augmented-reality fitting preview, and provides Buy Online, Pick
          Up In-Store fulfillment.
        </p>
      ),
    },
    {
      heading: 'Accounts',
      body: (
        <p>
          You are responsible for the accuracy of the information on your
          account and for keeping your login credentials confidential. You
          are responsible for activity that happens under your account.
        </p>
      ),
    },
    {
      heading: 'Orders and pricing',
      body: (
        <p>
          Product availability and prices are set by the boutique and can
          change without notice. Placing an order is a request to
          purchase; an order is confirmed once the boutique accepts it.
        </p>
      ),
    },
    {
      heading: 'The AR fitting preview',
      body: (
        <p>
          The fitting module estimates how a garment may sit on your body
          using camera-based pose tracking. It is a guide, not a
          guarantee. Lighting, camera quality, posture, and the accuracy of
          the underlying garment model can all affect the preview, and the
          delivered garment&apos;s fit may differ from what the preview
          showed.
        </p>
      ),
    },
    {
      heading: 'Pickup and delivery',
      body: (
        <p>
          Buy Online, Pick Up In-Store orders must be collected within the
          window stated at checkout, with a valid order confirmation.
          Orders not collected within that window may be canceled and
          refunded under the refund policy.
        </p>
      ),
    },
    {
      heading: 'Acceptable use',
      body: (
        <p>
          You agree not to scrape or resell catalog data, attempt to
          circumvent inventory or pricing controls, interfere with the AR
          module&apos;s operation, or use the platform for fraudulent
          transactions.
        </p>
      ),
    },
    {
      heading: 'Intellectual property',
      body: (
        <p>
          SilhouFit branding and software belong to the SilhouFit project.
          Product images, descriptions, and 3D garment models belong to
          the boutique that uploaded them.
        </p>
      ),
    },
    {
      heading: 'Third-party services',
      body: (
        <p>
          Payments are processed by a third-party payment provider, whose
          own terms apply to that transaction. SilhouFit does not store
          full payment card details.
        </p>
      ),
    },
    {
      heading: 'Limitation of liability',
      body: (
        <p>
          The platform is provided as is. To the extent permitted by law,
          SilhouFit is not liable for indirect or consequential losses
          arising from use of the platform, including losses arising from
          reliance on the AR fitting preview.
        </p>
      ),
    },
    {
      heading: 'Termination',
      body: (
        <p>
          Access can be suspended or ended for violation of these terms or
          suspected fraud.
        </p>
      ),
    },
    {
      heading: 'Governing law',
      body: <p>These terms are governed by the laws of the Philippines.</p>,
    },
    {
      heading: 'Changes to these terms',
      body: (
        <p>
          Updates will be posted on this page with a new date at the top.
        </p>
      ),
    },
  ],
}

export const PRIVACY: LegalDocument = {
  title: 'Privacy policy',
  lastUpdated: 'September 27, 2026',
  scopeNote:
    'SilhouFit is a capstone prototype. This policy describes how the platform is designed to handle data once boutiques and shoppers are using it. The site you are viewing today does not have accounts, checkout, or a live camera-based fitting session connected to it. The only thing it currently stores in your browser is your theme choice and your cookie preference, covered in the cookie policy.',
  sections: [
    {
      heading: 'Information the platform is designed to collect',
      body: (
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
      ),
    },
    {
      heading: 'How camera data is handled',
      body: (
        <p>
          Pose tracking for the AR fitting module runs on your own device,
          in your browser. Camera frames are processed there to estimate
          body landmarks and are not uploaded to or stored on SilhouFit
          servers as part of that process.
        </p>
      ),
    },
    {
      heading: 'How information would be used',
      body: (
        <p>
          To fulfill orders and coordinate pickup or delivery, keep
          inventory accurate across the store and the site, remember sizing
          preferences and wishlist items, improve the accuracy of the
          fitting module, and prevent fraud.
        </p>
      ),
    },
    {
      heading: 'Who information is shared with',
      body: (
        <p>
          The boutique you are shopping at, for order fulfillment. A
          third-party payment processor, to complete a transaction. Law
          enforcement or regulators, where required by law. Personal data
          is not sold to third parties for advertising.
        </p>
      ),
    },
    {
      heading: 'How long information is kept',
      body: (
        <p>
          For as long as needed to service an account or order, or as
          required by applicable law. You can request deletion of your
          account data at any time, subject to records a boutique is
          legally required to retain.
        </p>
      ),
    },
    {
      heading: 'Your rights',
      body: (
        <p>
          You can request access to, correction of, or deletion of your
          personal data, and request a copy of it, by writing to{' '}
          <a
            href="mailto:team@silhoufit.dev"
            className="underline decoration-chrome-strong decoration-2 underline-offset-2"
          >
            team@silhoufit.dev
          </a>
          .
        </p>
      ),
    },
    {
      heading: 'Children',
      body: (
        <p>
          The platform is not directed at children under 13, and it does
          not knowingly collect personal data from them.
        </p>
      ),
    },
    {
      heading: 'Security',
      body: (
        <p>
          Reasonable technical and organizational measures would be used to
          protect stored data. No method of transmission or storage is
          completely secure, and this policy cannot guarantee absolute
          security.
        </p>
      ),
    },
    {
      heading: 'Changes to this policy',
      body: (
        <p>
          Updates will be posted on this page with a new date at the top.
        </p>
      ),
    },
  ],
}
