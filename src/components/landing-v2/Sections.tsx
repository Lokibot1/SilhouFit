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

