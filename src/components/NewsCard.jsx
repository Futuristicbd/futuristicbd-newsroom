import { ExtIcon, PromoIcon } from './icons.jsx'
import { fmtDate, cap } from '../utils.js'

export default function NewsCard({ n }) {
  const promo = !!n.isPromotion
  return (
    <article className={'card reveal' + (promo ? ' promo' : '')}>
      <div className="card-top">
        <div className="badges">
          <span className={'badge ' + (n.region === 'bangladesh' ? 'b-bd' : 'b-global')}>
            {n.region === 'bangladesh' ? 'Bangladesh' : 'Global'}
          </span>
          <span className={'badge b-' + n.category}>{cap(n.category)}</span>
        </div>
        <span className="card-date">{fmtDate(n.date, true)}</span>
      </div>

      <h3 className="card-headline">
        {promo && <PromoIcon />}
        {n.headline}
      </h3>

      <p className="card-summary">{n.summary}</p>

      {promo && n.congratsMessage && <div className="congrats">{n.congratsMessage}</div>}

      {Array.isArray(n.tags) && n.tags.length > 0 && (
        <div className="tags">
          {n.tags.map((t, i) => <span className="tag" key={i}>{t}</span>)}
        </div>
      )}

      <div className="card-foot">
        {n.sourceUrl ? (
          <a className="src-link" href={n.sourceUrl} target="_blank" rel="noopener noreferrer">
            {n.source || 'Source'} <ExtIcon />
          </a>
        ) : (
          <span className="src-link">{n.source || ''}</span>
        )}
      </div>
    </article>
  )
}
