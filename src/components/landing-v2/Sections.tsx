// The static sections of landing v2: tape, study, lookbook and reception. Data-driven and interactive ones have their own files.

import { useState } from 'react'

const TAPE = ['KRAL®', 'SILHOUFIT']

/** Red tape strip: one steady linear loop. The other copies only fill the loop (a run of two words is about 200px, so 24 copies cover a 2400px screen twice over), so it is hidden from assistive tech. */
export function Tape() {
  const run = (hidden: boolean) => (
    <span className="sv2-tape-run" aria-hidden={hidden || undefined}>
      {TAPE.map((t) => (
        <span key={t}>{t} //</span>
      ))}
    </span>
  )
  return (
    <div className="sv2-tape">
      <div className="sv2-tape-track">
        {run(false)}
        {Array.from({ length: 23 }, (_, i) => i + 1).map((i) => (<span key={i} className="contents">{run(true)}</span>))}
      </div>
    </div>
  )
}

const SPECS = [
  {
    code: 'SPEC // 01',
    tag: 'MEASURE // MANUAL',
    title: 'Measured, not guessed',
    body: 'Enter your own measurements once and they become a body profile on your account. Every fit check starts from your numbers, not a size label.',
    foot: 'INPUT // CM OR IN, KG OR LB',
  },
  {
    code: 'SPEC // 02',
    tag: 'CAMERA // BROWSER',
    title: 'One camera is enough',
    body: 'Pose tracking reads body landmarks from your own camera, on your own device, and a scaled 3D garment renders over the video. No kiosk, headset or app install.',
    foot: 'PROCESSING // ON YOUR DEVICE',
  },
  {
    code: 'SPEC // 03',
    tag: 'CHANNEL // WEB',
    title: 'One catalogue, delivered',
    body: 'Browse the boutique catalogue online, check what is in stock, and get your order delivered to your door.',
    foot: 'STOCK // LIVE ON THE STOREFRONT',
  },
]

export function Study() {
  return (
    <section id="detail" className="sv2-section sv2-paper" aria-labelledby="sv2-study-title">
      <div className="sv2-wrap">
        <header className="sv2-head sv2-head--rule">
          <div>
            <p className="sv2-label sv2-label--red">(Research // fit_log)</p>
            <h2 id="sv2-study-title" className="sv2-h2">
              A study in fit
            </h2>
            <p className="sv2-quote">&ldquo;A size label is a guess. Your measurements are not.&rdquo;</p>
          </div>
          <p className="sv2-label sv2-meta-note">
            DOC_ID: SF-FIT-2026
            <br />
            BUILD: CAPSTONE PROTOTYPE
          </p>
        </header>

        <ul className="sv2-specs">
          {SPECS.map((s) => (
            <li key={s.code} className="sv2-spec">
              <p className="sv2-label sv2-spec-top">
                <span className="sv2-label--red">({s.code})</span>
                <span>[ {s.tag} ]</span>
              </p>
              <h3 className="sv2-h3">{s.title}</h3>
              <p className="sv2-body">{s.body}</p>
              <p className="sv2-label sv2-spec-foot">{s.foot}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

// Brand imagery from the KRAL rebranding presentation by Bryworks, used with the brand's permission. `pos` is the focal point kept when a tile crops.
const PLATES = [
  { src: 'storefront', alt: 'KRAL shopfront with a red roller shutter and the KRAL logo across it', label: 'Frame // Storefront', title: 'The storefront', sub: 'Where KRAL meets the street', pos: '50% 45%', size: 'lg' },
  { src: 'posters', alt: 'KRAL posters pasted on a wall, reading Daily Movement and Individuality', label: 'Frame // Posters', title: 'Daily movement', sub: 'Posters in the street', pos: '50% 40%', size: 'lg' },
  { src: 'tee', alt: 'Person in a white tee with a small red KRAL logo, holding a red dice keyring', label: 'Frame // On body', title: 'The KRAL tee', sub: 'How it sits on a person', pos: '50% 45%', size: 'sm' },
  { src: 'box', alt: 'Two stacked red KRAL gift boxes with black sleeves', label: 'Frame // Packaging', title: 'The red box', sub: 'How an order arrives', pos: '50% 50%', size: 'sm' },
  { src: 'label', alt: 'Red woven neck label with the white KRAL K', label: 'Piece // Label', title: 'Neck label', sub: 'The K, woven in', pos: '50% 50%', size: 'sm' },
] as const

function Plate({ plate, no }: { plate: (typeof PLATES)[number]; no: number }) {
  const [failed, setFailed] = useState(false)
  const [colour, setColour] = useState(false) // a tap (no hover on phones) toggles the colour
  return (
    <figure
      className={`sv2-plate sv2-plate--${plate.size}${colour ? ' sv2-plate--colour' : ''}`}
      tabIndex={0}
      aria-label={plate.title}
      onClick={() => setColour((c) => !c)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setColour((c) => !c)
        }
      }}
    >
      {failed ? (
        <span className="sv2-plate-fallback">{plate.alt}</span>
      ) : (
        <img
          src={`/images/brand/${plate.src}.webp`}
          alt={plate.alt}
          loading="lazy"
          decoding="async"
          style={{ objectPosition: plate.pos }}
          onError={() => setFailed(true)}
        />
      )}
      <figcaption>
        <span className="sv2-label sv2-label--tint">({plate.label})</span>
        <span className="sv2-plate-title">{plate.title}</span>
        <span className="sv2-label sv2-plate-sub">{plate.sub}</span>
        {plate.size === 'lg' && <span className="sv2-label sv2-plate-no">PLATE #{String(no).padStart(3, '0')}</span>}
      </figcaption>
    </figure>
  )
}

export function Lookbook() {
  return (
    <section id="lookbook" className="sv2-section sv2-dark" aria-labelledby="sv2-look-title">
      <div className="sv2-wrap">
        <header className="sv2-head sv2-head--rule">
          <div>
            <p className="sv2-label sv2-label--red">[ Field documentation // 2026 ]</p>
            <h2 id="sv2-look-title" className="sv2-h2">
              Lookbook editorial mosaic
            </h2>
          </div>
          <p className="sv2-label sv2-meta-note">Brand imagery // KRAL rebrand by Bryworks</p>
        </header>
        <div className="sv2-mosaic">
          {PLATES.map((p, i) => (
            <Plate key={p.src} plate={p} no={i + 1} />
          ))}
        </div>
      </div>
    </section>
  )
}

// Sample copy written for the prototype, not from real shoppers; the section says so.
const DISPATCHES = [
  { no: '001', quote: 'I typed in my measurements once. After that every product page told me if a size was going to be tight.', who: 'First-time online shopper', ctx: 'Sample feedback' },
  { no: '002', quote: 'Seeing the garment on the camera view settled it before I added it to my cart.', who: 'Online shopper', ctx: 'Sample feedback' },
  { no: '003', quote: 'The stock on the site is always current. That alone cuts the back-and-forth with customers.', who: 'Boutique staff', ctx: 'Sample feedback' },
]

export function Reception() {
  return (
    <section className="sv2-section sv2-dark sv2-section--tight" aria-labelledby="sv2-recep-title">
      <div className="sv2-wrap">
        <header className="sv2-head">
          <div>
            <p className="sv2-label sv2-label--red">(Sample dispatches)</p>
            <h2 id="sv2-recep-title" className="sv2-h2">
              Cultural reception
            </h2>
          </div>
          <p className="sv2-label sv2-meta-note">Placeholder quotes written for this prototype, not from real customers</p>
        </header>
        <ul className="sv2-quotes">
          {DISPATCHES.map((d) => (
            <li key={d.no} className="sv2-quote-card">
              <p className="sv2-label sv2-spec-top">
                <span className="sv2-label--tint">DISPATCH #{d.no}</span>
                <span>SAMPLE</span>
              </p>
              <blockquote className="sv2-body">&ldquo;{d.quote}&rdquo;</blockquote>
              <p className="sv2-label sv2-quote-who">
                <strong>{d.who}</strong>
                <br />
                {d.ctx}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
