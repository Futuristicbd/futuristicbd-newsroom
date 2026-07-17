import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const REFRESH_MS = 30 * 60 * 1000

function distinctDates(news) {
  const seen = new Set()
  const out = []
  for (const n of news) {
    if (n.date && !seen.has(n.date)) { seen.add(n.date); out.push(n.date) }
  }
  out.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  return out
}

function matchesSearch(n, q) {
  if (!q) return true
  const hay = [
    n.headline, n.summary, n.source, n.promotionPerson,
    Array.isArray(n.tags) ? n.tags.join(' ') : '',
  ].join(' ').toLowerCase()
  return hay.indexOf(q) !== -1
}

/**
 * Loads news-data.json, keeps it fresh on an interval, and exposes derived
 * lists + a filter state object. Mirrors the original vanilla filtering:
 * region + category + date + free-text search, promotions floated to top.
 */
export default function useNews() {
  const [news, setNews] = useState([])
  const [meta, setMeta] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [filters, setFilters] = useState({ q: '', region: 'all', cat: 'all', date: null })
  const loadedOnce = useRef(false)

  const load = useCallback(() => {
    fetch('news-data.json?_=' + Date.now())
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
      .then((d) => {
        const list = Array.isArray(d.news) ? d.news : []
        setNews(list)
        setMeta(d.meta || {})
        setFilters((f) => {
          const dates = distinctDates(list)
          if (!f.date || (f.date !== 'all' && dates.indexOf(f.date) === -1)) {
            return { ...f, date: dates.length ? dates[0] : 'all' }
          }
          return f
        })
        loadedOnce.current = true
        setStatus('ready')
      })
      .catch(() => {
        if (loadedOnce.current) return // keep showing data on a background-refresh failure
        setStatus('error')
      })
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  const dates = useMemo(() => distinctDates(news), [news])

  const stats = useMemo(() => {
    const latest = dates[0]
    let today = 0, bd = 0, gl = 0, promos = 0
    for (const n of news) {
      if (n.date === latest) today++
      if (n.region === 'bangladesh') bd++
      else if (n.region === 'global') gl++
      if (n.isPromotion) promos++
    }
    return [
      { v: today, l: "Today's stories" },
      { v: bd, l: 'Bangladesh' },
      { v: gl, l: 'Global' },
      { v: promos, l: 'Promotions' },
      { v: dates.length, l: 'Archive days' },
    ]
  }, [news, dates])

  const dateCounts = useMemo(() => {
    const counts = {}
    for (const n of news) counts[n.date] = (counts[n.date] || 0) + 1
    return counts
  }, [news])

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    const rows = []
    news.forEach((n, i) => {
      if (filters.date !== 'all' && n.date !== filters.date) return
      if (filters.region !== 'all' && n.region !== filters.region) return
      if (filters.cat !== 'all' && n.category !== filters.cat) return
      if (!matchesSearch(n, q)) return
      rows.push({ n, i })
    })
    rows.sort((a, b) => {
      const pa = a.n.isPromotion ? 1 : 0, pb = b.n.isPromotion ? 1 : 0
      if (pa !== pb) return pb - pa
      return a.i - b.i
    })
    return rows.map((x) => x.n)
  }, [news, filters])

  return { news, meta, status, filters, setFilters, dates, dateCounts, stats, filtered }
}
