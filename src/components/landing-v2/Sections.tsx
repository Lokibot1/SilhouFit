// The static sections of landing v2: tape, study, lookbook and reception. Data-driven and interactive ones have their own files.

import { useState } from 'react'

const TAPE = [
  'SILHOUFIT®',
  'TRY THE FIT',
  'BEFORE IT SHIPS',
  'MEASURED, NOT GUESSED',
  'ONE CATALOGUE',
  'ONLINE + IN-STORE',
  'AR IN YOUR BROWSER',
]

/** Red tape strip: one steady linear loop. The second copy only fills the loop, so it is hidden from assistive tech. */
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
        {run(true)}
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
    tag: 'CHANNEL // STORE + WEB',
    title: 'One catalogue, two doors',
    body: 'The boutique register and the online storefront share one inventory. Get it delivered, or reserve online and pick it up in the store.',
    foot: 'STOCK // SHARED ACROSS CHANNELS',
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

        <div className="sv2-strip">
          <div>
            <p className="sv2-strip-title">Boutique analytics embedded</p>
            <p className="sv2-label">AR sessions and size agreement feed the store&apos;s retail dashboard</p>
          </div>
          <ul className="sv2-chips">
            <li>(VIEW: STAFF + ADMIN)</li>
            <li>(SOURCE: AR SESSIONS)</li>
            <li>(STATUS: PROTOTYPE)</li>
          </ul>
        </div>
      </div>
    </section>
  )
}

// Store-floor photos from Unsplash (Unsplash License); as used across the app. `pos` is the focal point kept when a tile crops.
const PLATES = [
  { src: 'denim-jacket', alt: 'Denim jacket hanging among folded denim in a shop', label: 'Frame // Store floor', title: 'Denim, in store', sub: 'Jacket and folded denim on display', pos: '50% 45%', size: 'lg' },
  { src: 'white-shirt-rail', alt: 'White shirts hanging on a rail against a black wall', label: 'Frame // Rail', title: 'Shirt rail', sub: 'White shirts on one rail', pos: '50% 35%', size: 'lg' },
  { src: 'tank-top-outfit', alt: 'Model in a white tank top and camouflage trousers', label: 'Frame // On body', title: 'Tank and camo', sub: 'How it sits on a person', pos: '50% 35%', size: 'sm' },
  { src: 'jackets-on-hooks', alt: 'Jackets and a cap hanging on wall hooks', label: 'Frame // Store floor', title: 'The fitting wall', sub: 'Outerwear on wall hooks', pos: '50% 60%', size: 'sm' },
  { src: 'blazer', alt: 'Black blazer hanging on a rustic fence', label: 'Piece // Outerwear', title: 'Black blazer', sub: 'Tailoring on a hanger', pos: '50% 55%', size: 'sm' },
] as const

