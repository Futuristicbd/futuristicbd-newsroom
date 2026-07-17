import { useEffect, useRef, useState } from 'react'
import { SearchIcon } from './icons.jsx'

const REGIONS = [
  { val: 'all', label: 'All' },
  { val: 'bangladesh', label: 'Bangladesh' },
  { val: 'global', label: 'Global' },
]
const CATS = [
  { val: 'all', label: 'All' },
  { val: 'industry', label: 'Industry' },
  { val: 'marketing', label: 'Marketing' },
  { val: 'promotion', label: 'Promotion' },
  { val: 'trend', label: 'Trend' },
]

function Pills({ items, value, onChange, label }) {
  return (
    <div className="filter-row">
      <span className="filter-label">{label}</span>
      <div className="pills" role="group" aria-label={`Filter by ${label.toLowerCase()}`}>
        {items.map((it) => (
          <button
            key={it.val}
            type="button"
            className={'pill' + (value === it.val ? ' on' : '')}
            onClick={() => onChange(it.val)}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Controls({ filters, setFilters }) {
  const [q, setQ] = useState(filters.q)
  const tRef = useRef(null)

  // Debounce the search input into filter state (250ms), matching the original.
  useEffect(() => {
    clearTimeout(tRef.current)
    tRef.current = setTimeout(() => {
      setFilters((f) => (f.q === q ? f : { ...f, q }))
    }, 250)
    return () => clearTimeout(tRef.current)
  }, [q, setFilters])

  return (
    <section className="controls" aria-label="Filters">
      <div className="search-wrap">
        <SearchIcon />
        <input
          id="search"
          type="search"
          placeholder="Search headlines, summaries, sources, tags, people…"
          autoComplete="off"
          aria-label="Search stories"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <Pills items={REGIONS} value={filters.region} label="Region"
             onChange={(v) => setFilters((f) => ({ ...f, region: v }))} />
      <Pills items={CATS} value={filters.cat} label="Category"
             onChange={(v) => setFilters((f) => ({ ...f, cat: v }))} />
    </section>
  )
}
