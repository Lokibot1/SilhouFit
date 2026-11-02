import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Product } from '../../data/products'
import { useShopCatalogue } from '../../hooks/useShopCatalogue'
import { formatPeso } from '../../utils/format'
import { SilhouetteMark } from '../landing/SilhouetteMark'

const COUNT = 4

function Card({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false)
  const soldOut = product.stock === 0
  const price = formatPeso(product.salePrice ?? product.price)
  const colors = product.colors.map((c) => c.name).join(', ')

  return (
    <li className="sv2-card">
      <p className="sv2-label sv2-card-top">
        <span className={soldOut ? 'sv2-muted' : 'sv2-label--tint'}>({soldOut ? 'Sold out' : product.arReady ? 'AR-ready' : 'In stock'})</span>
        <span className="sv2-num">STOCK // {String(product.stock).padStart(2, '0')}</span>
      </p>
      <div className="sv2-card-img">
        {failed || !product.image ? (
          <div role="img" aria-label={`${product.name} (photo unavailable)`} className="sv2-card-fallback">
            <SilhouetteMark className="sv2-card-mark" />
          </div>
        ) : (
          <img src={product.image} alt={product.alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
        )}
      </div>
      <div className="sv2-card-body">
        <p className="sv2-label sv2-muted">
          {product.category}
          {product.boutique && ` // ${product.boutique}`}
        </p>
        <h3 className="sv2-card-name">
          <Link to={`/shop/${product.slug ?? product.id}`}>{product.name}</Link>
        </h3>
        {colors && <p className="sv2-label sv2-muted">Colorway: {colors}</p>}
      </div>
      <p className="sv2-card-foot">
        <span className="sv2-label sv2-card-view" aria-hidden="true">
          [ View ]
        </span>
        <span className="sv2-num sv2-price">
          {product.priceMax ? 'From ' : ''}
          {price}
        </span>
      </p>
    </li>
  )
}

function SkeletonCard() {
  return (
    <li className="sv2-card sv2-skel" aria-hidden="true">
      <p className="sv2-card-top">
        <span className="sv2-skel-bar" style={{ width: '4rem' }} />
        <span className="sv2-skel-bar" style={{ width: '4.5rem' }} />
      </p>
      <div className="sv2-card-img sv2-skel-block" />
      <div className="sv2-card-body">
        <span className="sv2-skel-bar" style={{ width: '40%' }} />
        <span className="sv2-skel-bar sv2-skel-bar--lg" style={{ width: '75%' }} />
        <span className="sv2-skel-bar" style={{ width: '55%' }} />
      </div>
      <p className="sv2-card-foot">
        <span className="sv2-skel-bar" style={{ width: '4rem' }} />
        <span className="sv2-skel-bar" style={{ width: '5rem' }} />
      </p>
    </li>
  )
}

/** The four newest pieces from the real catalogue, with its own loading, error and empty states. */
export function Featured() {
  const catalogue = useShopCatalogue({ category: 'all', q: '', sort: 'newest', page: 1, perPage: COUNT })
  const items = catalogue.result?.items.slice(0, COUNT) ?? []

  return (
    <section id="collection" className="sv2-section sv2-dark" aria-labelledby="sv2-collection-title">
      <div className="sv2-wrap">
        <header className="sv2-head">
          <div>
            <p className="sv2-label sv2-label--red">[ Catalogue // Live ]</p>
            <h2 id="sv2-collection-title" className="sv2-h2">
              Featured collection
            </h2>
          </div>
          <p className="sv2-label sv2-meta-note">
            SORT: (NEWEST // 01-04)
            <br />
            <span className="sv2-label--tint">STOCK READ FROM THE STORE</span>
          </p>
        </header>

        {catalogue.status === 'error' ? (
          <div role="alert" className="sv2-state">
            <p className="sv2-label sv2-label--tint">(Error // Catalogue)</p>
            <p className="sv2-state-title">We couldn&apos;t load the collection</p>
            <p className="sv2-body">
              The store catalogue didn&apos;t respond, which usually means a dropped connection or a busy server. Check your connection, then try again.
            </p>
            <button type="button" className="sv2-btn sv2-btn--line" onClick={catalogue.retry}>
              [ Retry ]
            </button>
          </div>
        ) : catalogue.status === 'loading' ? (
          <ul className="sv2-cards" aria-busy="true" aria-label="Loading the collection">
            {Array.from({ length: COUNT }, (_, i) => (
              <SkeletonCard key={i} />
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="sv2-state">
            <p className="sv2-label sv2-label--tint">(Empty // Catalogue)</p>
            <p className="sv2-state-title">No pieces are listed yet</p>
            <p className="sv2-body">New pieces appear here as soon as the store adds them. Until then, see how SilhouFit, KRAL's AR fitting, works.</p>
            <Link to="/about" className="sv2-btn sv2-btn--line">
              [ How it works ]
            </Link>
          </div>
        ) : (
          <ul className="sv2-cards">
            {items.map((p) => (
              <Card key={p.id} product={p} />
            ))}
          </ul>
        )}

        <div className="sv2-bar-foot">
          <p className="sv2-label sv2-muted">Stock shown is shared by the online store and the shop floor // AR-ready pieces have a fit preview</p>
          <Link to="/shop" className="sv2-label sv2-bar-link">
            [ // View the full catalogue ]
          </Link>
        </div>
      </div>
    </section>
  )
}
