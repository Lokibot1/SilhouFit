import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArIcon, BagIcon, BoxIcon, MailIcon, MessageIcon, RulerIcon, StoreIcon } from '../../components/form/icons'
import { ShopHeader } from '../../components/shop/ShopHeader'
import { KRAL_PRIMARY, KRAL_SECONDARY } from '../../components/shop/shopControls'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'

const META_DESCRIPTION =
  'SilhouFit is an innovative web and mobile e-commerce platform built to bridge the gap between digital convenience and the authentic fitting room experience.'

const STEPS = [
  {
    code: 'STEP // 01',
    title: 'Enter measurements',
    body: 'Sign in and open body setup. Type your measurements in centimetres or inches and your weight in kilograms or pounds. Each value is range-checked and you can edit it any time.',
  },
  {
    code: 'STEP // 02',
    title: 'Build your avatar',
    body: 'Choose a body model and a build. A 3D avatar is drawn in your browser and reshaped to your numbers. It is an approximate picture, not a scan.',
  },
  {
    code: 'STEP // 03',
    title: 'Check the size',
    body: 'Each product page has a size guide and shows stock per size. Cuts vary between garments, so treat the chart as guidance, not a guarantee.',
  },
  {
    code: 'NEXT // 04',
    title: 'Camera try-on',
    body: 'On a mobile device, pose tracking places a scaled 3D garment over your camera view, processed on your device. Status: in the current build this module is a prototype and is not switched on yet.',
  },
]

const ACTIONS = [
  { icon: <StoreIcon />, title: 'Shop', body: 'Browse one catalogue. Filter by category, colour, price and size, and see what is in stock.' },
  { icon: <RulerIcon />, title: 'Fit', body: 'Save a body profile to your account. Your measurements stay yours and can be edited or replaced.' },
  { icon: <BagIcon />, title: 'Order', body: 'Save pieces to a wishlist, fill a cart and check out for delivery with GCash, Maya or cash on delivery. Checkout is a prototype: no payment is taken.' },
  { icon: <MessageIcon />, title: 'Talk to staff', body: 'Message the store from your account. Staff reply from their own inbox.' },
]

const PROFILE = [
  ['Business type', 'Online-only streetwear clothing seller'],
  ['Products', 'Basic menswear, hoodies, jackets, pants, shorts, beanies and more'],
  ['Target customers', 'Males who love streetwear'],
  ['Platforms', 'Facebook, Shopee, TikTok Shop and Lazada. SilhouFit gives KRAL its own storefront.'],
  ['Catalogue size', 'Very large, with many products and size and colour variations'],
  ['Team', 'The owner plus a few staff. One staff member handles inventory and product updates together with the owner.'],
  ['Production', 'Its own production team (tahian) that delivers output regularly'],
]

const BACK_OFFICE = [
  'Inventory and size charts',
  'Online orders and messages',
  'Sales, product mix and trending items',
  'AR insights, promotions and refunds (admin)',
  'Activity logs and user management (admin)',
]

function GroupHeader({ id, index, kicker, title }: { id: string; index: string; kicker: string; title: string }) {
  return (
    <div id={id} className="scroll-mt-28 border-t-2 border-kral-fg pt-6">
      <p className="text-sm font-medium tracking-[0.08em] text-kral-red-ink uppercase">
        ({index}) {kicker}
      </p>
      <h2 className="mt-3 font-kral-display text-3xl leading-[1.05] font-extrabold text-kral-fg uppercase [overflow-wrap:anywhere] sm:text-5xl">{title}</h2>
    </div>
  )
}

function Section({ id, label, title, children }: { id: string; label: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28 border-t border-kral-rule py-10 sm:py-14 lg:grid lg:grid-cols-12 lg:gap-10">
      <div className="lg:col-span-4">
        <p className="text-sm font-medium tracking-[0.08em] text-kral-red-ink uppercase">({label})</p>
        <h3 id={`${id}-title`} className="mt-3 font-kral-display text-2xl leading-[1.05] font-extrabold text-kral-fg uppercase [overflow-wrap:anywhere] sm:text-3xl">
          {title}
        </h3>
      </div>
      <div className="mt-6 min-w-0 lg:col-span-8 lg:mt-0">{children}</div>
    </section>
  )
}

export function AboutPage() {
  useDocumentTitle('About KRAL and SilhouFit — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  return (
    <div className="font-kral-mono text-kral-fg">
      <ShopHeader title="About" crumb="About" tone="kral" />
      <div className="mx-auto max-w-6xl px-6 pb-16 2xl:max-w-[88rem]">
        <div className="max-w-3xl pt-4 pb-10 sm:pb-14">
          <span aria-hidden="true" className="mb-6 block h-0.5 w-14 bg-kral-red" />
          <p className="text-sm font-medium tracking-[0.08em] text-kral-muted uppercase">Made to Represent // Mark of Identity</p>
          <p className="mt-4 text-base leading-relaxed text-kral-muted sm:text-lg">
            KRAL® is the company: an online-only streetwear clothing seller. SilhouFit is the system: a BSIT capstone platform built for KRAL&apos;s online store, whose storefront carries the KRAL brand.
          </p>
          <nav aria-label="On this page" className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link to={{ pathname: '/about', hash: '#kral' }} className={`${KRAL_SECONDARY} justify-start whitespace-normal! text-left`}>
              (01) KRAL // The company
            </Link>
            <Link to={{ pathname: '/about', hash: '#silhoufit' }} className={`${KRAL_SECONDARY} justify-start whitespace-normal! text-left`}>
              (02) SilhouFit // The system
            </Link>
          </nav>
        </div>

        <GroupHeader id="kral" index="01" kicker="KRAL // The company" title="About KRAL®" />
        <div className="pt-6 pb-10 sm:pb-14">
          <p className="max-w-2xl text-base leading-relaxed text-kral-muted">
            A streetwear label for men, sold online. Here is the business profile.
          </p>
          <dl className="mt-6 divide-y divide-kral-rule border-y border-kral-rule">
            {PROFILE.map(([item, details]) => (
              <div key={item} className="py-3 sm:grid sm:grid-cols-12 sm:gap-6 sm:py-4">
                <dt className="text-sm font-medium tracking-[0.08em] text-kral-red-ink uppercase sm:col-span-3">{item}</dt>
                <dd className="mt-1 min-w-0 text-base leading-relaxed text-kral-fg [overflow-wrap:anywhere] sm:col-span-9 sm:mt-0">{details}</dd>
              </div>
            ))}
          </dl>
        </div>

        <GroupHeader id="silhoufit" index="02" kicker="SilhouFit // The system" title="About SilhouFit" />
        <p className="max-w-2xl pt-6 pb-4 text-base leading-relaxed text-kral-muted">
          SilhouFit is an innovative web and mobile e-commerce platform built to bridge the gap between digital convenience and the authentic fitting room experience. Designed specifically for modern streetwear brands like KRAL, our platform pairs a centralized web management system with interactive, AR-powered virtual fitting on mobile devices.
        </p>

        <Section id="how-it-works" label="How fit works" title="Measured, not guessed">
          <ol className="grid gap-px border border-kral-rule bg-kral-rule sm:grid-cols-2">
            {STEPS.map((step) => (
              <li key={step.code} className="bg-kral-bg p-5 sm:p-6">
                <p className="text-sm font-medium tracking-[0.08em] text-kral-red-ink uppercase">{step.code}</p>
                <h4 className="mt-3 font-kral-display text-lg leading-tight font-extrabold text-kral-fg uppercase">{step.title}</h4>
                <p className="mt-3 text-base leading-relaxed text-kral-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="capabilities" label="What you can do" title="Shop, fit, order, ask">
          <ul className="grid gap-px border border-kral-rule bg-kral-rule sm:grid-cols-2">
            {ACTIONS.map((a) => (
              <li key={a.title} className="bg-kral-bg p-5 sm:p-6">
                <h4 className="flex items-center gap-3 font-kral-display text-lg leading-tight font-extrabold text-kral-fg uppercase">
                  <span aria-hidden="true" className="text-kral-red-ink">{a.icon}</span>
                  {a.title}
                </h4>
                <p className="mt-3 text-base leading-relaxed text-kral-muted">{a.body}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="boutiques" label="Behind the store" title="Staff and admin tools">
          <p className="max-w-2xl text-base leading-relaxed text-kral-muted">
            This is the centralized web management system. Staff and admins sign in to their own dashboards. Figures there are sample data in the current build.
          </p>
          <ul className="mt-5 max-w-2xl divide-y divide-kral-rule border-y border-kral-rule">
            {BACK_OFFICE.map((item) => (
              <li key={item} className="flex min-h-11 items-center gap-3 py-2 text-base text-kral-fg">
                <BoxIcon className="shrink-0 text-kral-red-ink" />
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="capstone" label="The project" title="A capstone, in the open">
          <div className="max-w-2xl space-y-4 text-base leading-relaxed text-kral-muted">
            <p>
              This is a working prototype built for a BSIT capstone. Parts that are not live are marked as sample or as not available yet, and nothing here takes a real payment.
            </p>
            <p>
              Credits // 3D avatar models, photography and licences are listed in the footer. The wordmark is generated from Archivo (SIL OFL 1.1).
            </p>
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link to="/shop" className={KRAL_PRIMARY}>
              <StoreIcon size={16} />
              Shop the catalogue
            </Link>
            <Link to="/contact" className={KRAL_SECONDARY}>
              <MailIcon size={16} />
              Contact the team
            </Link>
            <Link to="/profile/measurements" className={KRAL_SECONDARY}>
              <ArIcon size={16} />
              Open body setup
            </Link>
          </div>
        </Section>
      </div>
    </div>
  )
}
