import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

const ITEMS: { q: string; a: ReactNode }[] = [
  {
    q: 'What is SilhouFit?',
    a: "SilhouFit is KRAL's AR fitting. It uses your camera and the measurements you enter to show how a piece sits on you, in your browser. Nothing is uploaded.",
  },
  {
    q: 'How does SilhouFit work?',
    a: 'Turn on your camera and pose tracking reads body landmarks on your own device. A 3D garment, scaled to the piece you picked, renders over the video. It works on pieces marked AR-ready, and the module is still a working prototype.',
  },
  {
    q: 'How do I enter my measurements?',
    a: (
      <>
        Sign in, then open the body setup from your profile. Enter your measurements in centimetres or inches and your weight in kilograms or pounds. Each value is checked against a sensible range, and you can edit it any time.{' '}
        <Link to="/profile/measurements">Open body setup</Link>
      </>
    ),
  },
  {
    q: 'How accurate is the sizing?',
    a: 'It is guidance, not a guarantee. A fit check compares your measurements with the size chart of the piece, and cuts vary between garments. Each product page has a size guide to check against.',
  },
  {
    q: 'What about shipping and returns?',
    a: (
      <>
        Orders are delivered to the address you give at checkout. Returns and refunds follow the refund policy. <Link to="/refund-policy">Read the refund policy</Link>
      </>
    ),
  },
  {
    q: 'Are my measurements and camera private?',
    a: (
      <>
        The camera starts only after you allow it, and frames are processed on your device, not uploaded. Saved measurements belong to your account. <Link to="/privacy-policy">Read the privacy policy</Link>
      </>
    ),
  },
  {
    q: 'Do I need an account?',
    a: (
      <>
        You can browse the shop and product pages without one. Adding to the cart or wishlist, and saving measurements, need you to sign in. <Link to="/signup">Create an account</Link>
      </>
    ),
  },
]

export function Faq() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section id="faq" className="sv2-section sv2-dark sv2-section--tight" aria-labelledby="sv2-faq-title">
      <div className="sv2-wrap sv2-wrap--narrow">
        <p className="sv2-label sv2-label--red">[ Support // Q&amp;A ]</p>
        <h2 id="sv2-faq-title" className="sv2-h2">
          Frequently asked questions
        </h2>
        <ul className="sv2-faq">
          {ITEMS.map((item, i) => {
            const expanded = open === i
            return (
              <li key={item.q} className="sv2-faq-item">
                <h3>
                  <button
                    type="button"
                    className="sv2-faq-q"
                    aria-expanded={expanded}
                    aria-controls={`sv2-faq-${i}`}
                    id={`sv2-faq-q-${i}`}
                    onClick={() => setOpen(expanded ? null : i)}
                  >
                    <span>
                      {String(i + 1).padStart(2, '0')} // {item.q}
                    </span>
                    <span className="sv2-faq-icon" aria-hidden="true">
                      [ {expanded ? '-' : '+'} ]
                    </span>
                  </button>
                </h3>
                <div id={`sv2-faq-${i}`} role="region" aria-labelledby={`sv2-faq-q-${i}`} className="sv2-faq-a" data-open={expanded || undefined}>
                  <div>
                    <p className="sv2-body">{item.a}</p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
