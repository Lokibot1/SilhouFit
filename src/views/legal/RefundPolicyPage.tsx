import {
  LegalPageLayout,
  LegalSection,
} from '../../components/legal/LegalPageLayout'
import { Bullets, Lead, Mail, Steps } from '../../components/legal/legalParts'

export function RefundPolicyPage() {
  return (
    <LegalPageLayout
      title="Return, refund & exchange policy"
      lastUpdated="November 3, 2026"
      scopeNote="This Return, Refund, and Exchange Policy governs orders placed through the SilhouFit website (silhoufit.com) and is drafted in accordance with the Consumer Act of the Philippines (Republic Act No. 7394), DTI Department Administrative Orders (DAO), and the Internet Transactions Act of 2023 (Republic Act No. 11967)."
    >
      <LegalSection heading="Compliance with the “No Return, No Exchange” prohibition">
        <p>
          Under Title III, Chapter 3 of RA 7394 and standard DTI guidelines, a
          blanket &quot;No Return, No Exchange&quot; policy is strictly
          prohibited.
        </p>
        <Bullets>
          <li>
            If an item sent to you is factory-defective, damaged,
            non-conforming, or materially misrepresented, you are entitled to
            your choice of an exchange, immediate repair, or a full refund
            (including all shipping fees incurred).
          </li>
          <li>
            Note: Under Philippine law, stores are not legally obligated to
            honor returns or refunds resulting from consumer change of mind or
            personal buyer&apos;s remorse, provided the item delivered matches
            the listing and is free from manufacturing defects.
          </li>
        </Bullets>
      </LegalSection>

      <LegalSection heading="Statutory return window">
        <Bullets>
          <li>
            <Lead>Defective / Non-Conforming Goods:</Lead> Reports for factory
            damage, missing parts, mislabeled garments, or erroneous items
            must be filed within seven (7) calendar days of confirmed courier
            delivery.
          </li>
          <li>
            <Lead>Size / Fit Voluntary Exchanges:</Lead> If an item does not
            fit to your preference despite using our sizing charts or AR
            preview, we accommodate size exchanges within seven (7) calendar
            days of receipt, subject to size availability. For
            change-of-preference or non-defective size exchanges, reverse
            logistics shipping fees are shouldered by the customer.
          </li>
        </Bullets>
      </LegalSection>

      <LegalSection heading="Product eligibility criteria">
        <p>
          For non-defective size exchanges to be accepted, items must remain
          in clean, resalable condition:
        </p>
        <Bullets>
          <li>
            Unworn, unwashed, and unaltered, with original brand and care tags
            intact.
          </li>
          <li>
            Free from cosmetic marks, perfume, deodorant, or detergent odors.
          </li>
          <li>
            In original packaging with proof of transaction (e.g., order
            receipt or digital order ID).
          </li>
        </Bullets>
      </LegalSection>

      <LegalSection heading="Hygiene exceptions">
        <p>
          In accordance with consumer health and hygiene safety, the following
          items cannot be returned or exchanged for reasons other than
          verified manufacturer defects:
        </p>
        <Bullets>
          <li>
            Intimate apparel, undergarments, shapewear, and swimwear if
            hygiene liners or tamper-evident seals have been unsealed or
            removed.
          </li>
          <li>
            Custom tailored or personalized uniforms/apparel, except in cases
            of factory flaws or incorrect construction against specifications.
          </li>
        </Bullets>
      </LegalSection>

      <LegalSection heading="Refund processing">
        <Bullets>
          <li>
            <Lead>Inspection:</Lead> Returned items will be inspected within
            three (3) business days of receipt at our fulfillment center.
          </li>
          <li>
            <Lead>Reimbursement Channel:</Lead> Approved refunds will be
            reversed to your original payment method (e-wallet credit,
            debit/credit reversal, or direct bank transfer) within seven (7)
            to fourteen (14) business days, subject to your issuing
            bank&apos;s clearing cycle. Cash-on-delivery (COD) orders will be
            reimbursed via validated bank transfer or verified e-wallet
            deposit.
          </li>
          <li>
            <Lead>Shipping Costs:</Lead> All shipping and handling costs are
            100% refunded when the return is caused by our error, transit
            damage, or manufacturer defects.
          </li>
        </Bullets>
      </LegalSection>

      <LegalSection heading="Submitting a claim">
        <Steps>
          <li>
            Initiate an exchange or refund request through the SilhouFit
            official portal (silhoufit.com) or email <Mail /> referencing your
            Order Number.
          </li>
          <li>
            Provide an unboxing video or photographs clearly displaying the
            issue, batch labels, and garment condition.
          </li>
          <li>
            Upon return approval, drop off the parcel via our designated
            partner courier or present it in person at our authorized return
            drop-off centers.
          </li>
        </Steps>
      </LegalSection>
    </LegalPageLayout>
  )
}
