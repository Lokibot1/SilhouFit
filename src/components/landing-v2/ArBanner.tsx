import { Link } from 'react-router-dom'

/** Closing banner: AR fitting pitch, set straight on the section with an oversized FIT watermark. */
export function ArBanner() {
  return (
    <section className="sv2-section sv2-dark sv2-ar-section" aria-labelledby="sv2-ar-title">
      <div className="sv2-wrap">
        <div className="sv2-ar">
          <span className="sv2-ar-mark" aria-hidden="true">
            FIT
          </span>
          <div className="sv2-ar-copy">
            <p className="sv2-label sv2-label--tint">(AR // SilhouFit)</p>
            <h2 id="sv2-ar-title" className="sv2-h2">
              Try pieces on before you buy them.
            </h2>
            <p className="sv2-body">SilhouFit is KRAL's AR fitting. Your camera and a browser are enough to see how a garment sits on you. Nothing is uploaded.</p>
            <div className="sv2-ar-actions">
              <Link to={{ pathname: '/about', hash: '#how-it-works' }} className="sv2-btn sv2-btn--paper">
                See how AR fitting works
              </Link>
              <Link to={{ hash: '#faq' }} className="sv2-btn sv2-btn--line">
                How sizing works
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
