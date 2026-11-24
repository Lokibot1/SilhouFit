import type { ReactNode } from 'react'
import { Bullets, Lead, Mail, Steps } from './legalParts'

export type LegalDoc = 'terms' | 'privacy'

export interface LegalDocument {
  title: string
  lastUpdated: string
  scopeNote: string
  sections: { heading: string; body: ReactNode }[]
}

export const TERMS: LegalDocument = {
  title: 'Terms of service',
  lastUpdated: 'November 3, 2026',
  scopeNote:
    'Welcome to SilhouFit ("SilhouFit", "we", "us", "our"). These Terms of Service ("Terms") govern your access to and use of the SilhouFit website (silhoufit.com), web/mobile applications, and omnichannel services, including e-commerce transactions, physical retail touchpoints, and the Augmented Reality (AR) virtual fitting room feature (collectively, the "Service"). By accessing, creating an account, or transacting on the Service, you signify your full agreement to these Terms, which constitute a legally valid electronic agreement pursuant to the Electronic Commerce Act of 2000 (Republic Act No. 8792). If you do not agree, do not use the Service.',
  sections: [
    {
      heading: 'Statutory merchant disclosures',
      body: (
        <>
          <p>
            Pursuant to Section 18 of the Internet Transactions Act of 2023
            (Republic Act No. 11967), the details of the digital enterprise
            operating this e-commerce platform are set forth below:
          </p>
          <Bullets>
            <li>Trade Name / Brand: SilhouFit</li>
            <li>
              Official Website / Platform:{' '}
              <a href="https://silhoufit.com">https://silhoufit.com</a>
            </li>
            <li>
              Customer Support / Help Desk: <Mail />
            </li>
            <li>
              Operating Hours: 8:00 AM – 5:00 PM PST, Monday through Friday
              (excluding official Philippine public holidays)
            </li>
          </Bullets>
        </>
      ),
    },
    {
      heading: 'Eligibility & capacity',
      body: (
        <p>
          You must possess the legal capacity to enter into binding contracts
          under Philippine law. Minors may access the Service and place orders
          only with the express involvement and verified consent of a parent
          or legal guardian.
        </p>
      ),
    },
    {
      heading: 'Account security & acceptable use',
      body: (
        <Bullets>
          <li>
            <Lead>Registration Integrity:</Lead> You agree to provide true,
            accurate, current, and complete registration information and
            maintain its accuracy at all times.
          </li>
          <li>
            <Lead>Credential Protection:</Lead> You are solely responsible for
            preserving the confidentiality of your credentials. You must
            notify us immediately at <Mail /> upon suspecting unauthorized
            account access or data exposure.
          </li>
          <li>
            <Lead>Acceptable Use & Anti-Fraud:</Lead> Pursuant to the
            Cybercrime Prevention Act of 2012 (Republic Act No. 10175), you
            expressly agree not to:
            <ul className="mt-2 list-[circle] space-y-2 pl-5">
              <li>
                Use the platform to perpetrate fraudulent payment
                transactions, chargeback fraud, or exploit unauthorized
                payment methods.
              </li>
              <li>
                Interfere with platform integrity through distributed
                denial-of-service (DDoS) attacks, injection of malicious
                software, automated scraping, bots, or unauthorized
                vulnerability scans.
              </li>
              <li>
                Access or tamper with accounts or customer data belonging to
                other users without authorization.
              </li>
              <li>
                Circumvent stated purchase limits or engage in unauthorized
                automated bulk resale.
              </li>
            </ul>
          </li>
          <li>
            <Lead>Account Remediation:</Lead> We reserve the right to
            temporarily lock accounts after repeated failed authentication
            attempts, or terminate access for material breaches of these Terms
            or suspected cyber-offenses.
          </li>
        </Bullets>
      ),
    },
    {
      heading: 'Product listings, landed pricing, and availability',
      body: (
        <Bullets>
          <li>
            <Lead>Truth in Description:</Lead> Garment specifications, sizing
            charts, fabric composition, care instructions, and imagery are
            presented truthfully and accurately, as required by the Consumer
            Act of the Philippines (Republic Act No. 7394). Slight display
            variances may occur due to screen hardware limitations.
          </li>
          <li>
            <Lead>Landed Pricing & Price Tag Compliance:</Lead> In adherence
            to RA 7394 (Price Tag Law) and RA 11967, all prices are quoted in
            Philippine Peso (PHP), inclusive of 12% Value-Added Tax (VAT)
            where applicable, packaging, and itemized shipping fees clearly
            displayed before final order confirmation.
          </li>
          <li>
            <Lead>Inventory & Order Acceptance:</Lead> Orders placed on the
            Service constitute an offer to purchase. Acceptance occurs only
            when we issue an electronic order confirmation and shipping
            dispatch notice pursuant to RA 8792. If an item is unavailable,
            mispriced due to a typographical error, or linked to suspicious
            activity, we reserve the right to cancel the order and provide an
            immediate full refund.
          </li>
        </Bullets>
      ),
    },
    {
      heading: 'Invoicing & official receipts',
      body: (
        <p>
          Pursuant to the National Internal Revenue Code (NIRC), BIR Revenue
          Regulations (including RR No. 16-2023), and relevant e-invoicing
          standards, an electronic invoice or registered sales invoice will be
          issued for all completed orders.
        </p>
      ),
    },
    {
      heading: 'AR virtual fitting & sizing disclaimers',
      body: (
        <Bullets>
          <li>
            <Lead>Simulated Estimations:</Lead> The Augmented Reality (AR)
            virtual fitting tool processes voluntary body measurements and
            camera views locally to generate visual fitting simulations. These
            outputs are non-binding visual estimations. Variances in garment
            drape, textile elasticity, and manual measurement errors may
            produce differences in real-world fit.
          </li>
          <li>
            <Lead>Permission & Privacy:</Lead> Utilizing the AR camera view
            requires explicit client permission and operates in real time
            without continuous cloud video capture. For details, see our Privacy Policy.
          </li>
        </Bullets>
      ),
    },
    {
      heading: 'Intellectual property',
      body: (
        <p>
          All digital assets, brand marks, logos, garment patterns, 3D asset
          models, UI designs, lookbook imagery, and software source code
          powering SilhouFit are the proprietary property of SilhouFit or its
          licensors, protected by the Intellectual Property Code of the
          Philippines (Republic Act No. 8293). No material may be copied,
          scraped, reproduced, modified, or exploited commercially without
          express prior written consent.
        </p>
      ),
    },
    {
      heading: 'Consumer rights & statutory remedies',
      body: (
        <p>
          Nothing in these Terms excludes, restricts, or modifies statutory
          consumer rights established under Republic Act No. 7394 (Consumer
          Act) or Republic Act No. 11967 (Internet Transactions Act). For
          qualifying defective, non-conforming, or misrepresented apparel,
          consumers are entitled to statutory remedies including repair,
          replacement, or full refund.
        </p>
      ),
    },
    {
      heading: 'Governing law & dispute jurisdiction',
      body: (
        <p>
          These Terms are governed by and construed under the laws of the
          Republic of the Philippines. In the event of a dispute, the parties
          shall first pursue good-faith amicable settlement. If unresolved,
          the dispute shall be submitted to the exclusive jurisdiction of the
          competent courts of Metro Manila, Philippines, without prejudice to
          administrative complaint proceedings before the Department of Trade
          and Industry (DTI) or the National Privacy Commission (NPC).
        </p>
      ),
    },
    {
      heading: 'Contact',
      body: (
        <p>
          SilhouFit Legal & Support Team
          <br />
          Email: <Mail />
          <br />
          Phone: +63 (2) 8888-7454
        </p>
      ),
    },
  ],
}

export const PRIVACY: LegalDocument = {
  title: 'Privacy policy',
  lastUpdated: 'November 3, 2026',
  scopeNote:
    'SilhouFit respects your fundamental right to privacy and is strictly committed to protecting personal data across the SilhouFit website and platform in compliance with the Data Privacy Act of 2012 (Republic Act No. 10173), its Implementing Rules and Regulations (IRR), and applicable circulars of the National Privacy Commission (NPC).',
  sections: [
    {
      heading: 'Information controller & privacy inquiries',
      body: (
        <>
          <p>
            SilhouFit, operating for KRAL, acts as the Personal Information
            Controller (PIC) responsible for safeguarding your personal data.
            If you have questions about this Privacy Policy or wish to
            exercise your rights to access, correct, or delete your account
            information, please reach out to our team:
          </p>
          <Bullets>
            <li>
              <Lead>Data Controller:</Lead> Sean Larkin Castro
            </li>
            <li>
              <Lead>Support Email:</Lead> <Mail />
            </li>
          </Bullets>
        </>
      ),
    },
    {
      heading: 'Personal data we collect',
      body: (
        <>
          <p>
            In connection with our omnichannel and e-commerce services on the
            SilhouFit platform and website (silhoufit.com), we collect:
          </p>
          <Bullets>
            <li>
              <Lead>Identity & Contact Details:</Lead> Full name, billing and
              delivery addresses, active mobile phone number, email address,
              and encrypted/hashed passwords.
            </li>
            <li>
              <Lead>Transactional & Payment Details:</Lead> Order histories,
              tracking IDs, delivery confirmations, cart entries, and digital
              payment transaction tokens. (Direct card numbers and e-wallet
              credentials are processed via certified third-party payment
              gateways; we do not store raw card numbers.)
            </li>
            <li>
              <Lead>Sizing & Fitting Data:</Lead> Voluntarily inputted
              anatomical dimensions (e.g., bust/chest, waist, hips, inseam,
              height) and fit preference profiles used to calibrate size
              recommendations.
            </li>
            <li>
              <Lead>Augmented Reality (AR) Sensor & Camera Feeds:</Lead> Video
              and camera streams requested for virtual fitting are executed
              locally and in real time on your client device to position the
              3D apparel overlay. Camera streams are not recorded, stored, or
              transmitted to remote cloud databases without your distinct,
              explicit opt-in.
            </li>
            <li>
              <Lead>Technical & Browsing Data:</Lead> IP addresses, operating
              system, browser fingerprints, session duration, and cookie
              identifiers (governed under our Cookie Policy).
            </li>
          </Bullets>
        </>
      ),
    },
    {
      heading: 'Purpose & legal bases for processing',
      body: (
        <>
          <p>
            Under Section 12 and Section 13 of RA 10173, personal data is
            processed strictly under the following lawful bases:
          </p>
          <Bullets>
            <li>
              <Lead>Contractual Necessity:</Lead> Processing orders,
              fulfilling garment deliveries, issuing digital receipts,
              updating cross-store inventory, and facilitating size
              exchanges.
            </li>
            <li>
              <Lead>Consent:</Lead> Tailoring AR fitting simulations,
              maintaining optional measurement profiles, and sending direct
              promotional marketing communications (which can be opted out of
              at any time).
            </li>
            <li>
              <Lead>Compliance with Legal Obligations:</Lead> Maintaining
              financial, corporate, and digital transaction logs for at least
              three (3) years under Section 18 of RA 11967 and BIR revenue
              regulations.
            </li>
            <li>
              <Lead>Legitimate Interests:</Lead> Platform infrastructure
              security, rate limiting, brute-force mitigation, and aggregate
              internal retail analytics to optimize regional production and
              stock distribution.
            </li>
          </Bullets>
        </>
      ),
    },
    {
      heading: 'Data sharing & third-party processors',
      body: (
        <>
          <p>
            Personal data is never sold or rented. Transfers to Personal
            Information Processors (PIPs) occur solely under strict Data
            Sharing Agreements conforming to NPC standards:
          </p>
          <Bullets>
            <li>
              <Lead>Logistics & Delivery Carriers:</Lead> Accredited
              third-party logistics and courier partners for door-to-door
              transit and package tracking.
            </li>
            <li>
              <Lead>Payment Gateway Providers:</Lead> Licensed payment
              gateways, electronic money issuers, and banks for real-time
              transaction processing and fraud verification.
            </li>
            <li>
              <Lead>Cloud Infrastructure & Hosting:</Lead> Scalable,
              encrypted database and web servers managing platform
              availability.
            </li>
            <li>
              <Lead>Regulatory & Law Enforcement:</Lead> DTI, BIR, NPC, or
              judicial authorities when formally required by subpoena, valid
              search warrant, or lawful order.
            </li>
          </Bullets>
        </>
      ),
    },
    {
      heading: 'Security measures & retention schedule',
      body: (
        <Bullets>
          <li>
            <Lead>Organizational & Technical Measures:</Lead> Transport Layer
            Security (TLS/HTTPS), encrypted databases, salted hashing for
            credentials, role-based access control (RBAC), and automated
            lockout after sustained failed attempts.
          </li>
          <li>
            <Lead>Statutory Retention:</Lead> Transaction and order archives
            are securely retained for a minimum of three (3) years as
            mandated by RA 11967 and applicable tax laws. Measurement profiles
            and inactive accounts are expunged or anonymized upon customer
            request, unless preservation is legally mandated.
          </li>
          <li>
            <Lead>Data Breach Notification:</Lead> In the event of a security
            incident posing high risk to data subjects, SilhouFit will notify
            affected users and the NPC within 72 hours of verification,
            pursuant to NPC Circular 16-03.
          </li>
        </Bullets>
      ),
    },
    {
      heading: 'Your rights as a data subject',
      body: (
        <>
          <p>
            Under Section 16 of the Data Privacy Act, you have the right to:
          </p>
          <Steps>
            <li>
              <Lead>Right to Be Informed:</Lead> Understand how and why your
              personal information is gathered and used.
            </li>
            <li>
              <Lead>Right to Access:</Lead> Obtain copies of your personal
              information held in our records.
            </li>
            <li>
              <Lead>Right to Object:</Lead> Decline data processing for
              profiling or direct marketing.
            </li>
            <li>
              <Lead>Right to Rectification:</Lead> Dispute and correct
              inaccurate, false, or outdated records.
            </li>
            <li>
              <Lead>Right to Erasure or Blocking:</Lead> Suspend, withdraw, or
              order the removal of your personal data upon grounds
              established by law.
            </li>
            <li>
              <Lead>Right to Data Portability:</Lead> Obtain your data in an
              electronic, structured format.
            </li>
            <li>
              <Lead>Right to Damages:</Lead> Be indemnified for damages
              suffered due to inaccurate, unlawful, or unauthorized
              processing.
            </li>
            <li>
              <Lead>Right to File a Complaint:</Lead> Elevate grievances
              directly to the National Privacy Commission (
              <a href="https://www.privacy.gov.ph">
                https://www.privacy.gov.ph
              </a>
              ) if requests are improperly handled.
            </li>
          </Steps>
          <p>
            To exercise these rights, submit a written inquiry to our DPO at{' '}
            <Mail />. Requests will be evaluated and addressed within thirty
            (30) business days.
          </p>
        </>
      ),
    },
  ],
}
