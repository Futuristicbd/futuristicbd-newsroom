import { fmtDate } from '../utils.js'

export default function DateBar({ dates, counts, total, value, onChange }) {
  return (
    <nav className="date-bar" aria-label="Archive dates">
      <button
        type="button"
        className={'dtab' + (value === 'all' ? ' on' : '')}
        onClick={() => onChange('all')}
      >
        All days <span className="cnt">{total}</span>
      </button>
      {dates.map((dt, idx) => (
        <button
          key={dt}
          type="button"
          className={'dtab' + (value === dt ? ' on' : '')}
          onClick={() => onChange(dt)}
        >
          {idx === 0 ? 'Latest · ' + fmtDate(dt) : fmtDate(dt)}
          <span className="cnt">{counts[dt] || 0}</span>
        </button>
      ))}
    </nav>
  )
}
