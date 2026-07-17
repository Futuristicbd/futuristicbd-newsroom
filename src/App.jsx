import { useCallback, useEffect, useState } from 'react'
import useLenis from './hooks/useLenis.js'
import useNews from './hooks/useNews.js'
import Header from './components/Header.jsx'
import Hero from './components/Hero.jsx'
import Stats from './components/Stats.jsx'
import Controls from './components/Controls.jsx'
import DateBar from './components/DateBar.jsx'
import NewsGrid from './components/NewsGrid.jsx'
import { ArrowUpIcon } from './components/icons.jsx'
import { fmtDate } from './utils.js'

const THEME_COLORS = { light: '#f7f7f5', dark: '#121214' }

function getInitialTheme() {
  const t = document.documentElement.getAttribute('data-theme')
  return t === 'dark' ? 'dark' : 'light'
}
function storedTheme() {
  try { const v = localStorage.getItem('fbd-theme'); return v === 'light' || v === 'dark' ? v : null }
  catch (e) { return null }
}

export default function App() {
  const lenisRef = useLenis()
  const { meta, status, filters, setFilters, dates, dateCounts, stats, filtered, news } = useNews()

  const [theme, setTheme] = useState(getInitialTheme)
  const [showBtt, setShowBtt] = useState(false)

  // Apply theme to <html>, persist it, and keep the browser chrome colour in sync.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    const m = document.querySelector('meta[name="theme-color"]')
    if (m) m.setAttribute('content', THEME_COLORS[theme])
  }, [theme])

  // Follow the OS scheme until the user makes an explicit choice.
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onScheme = (e) => { if (!storedTheme()) setTheme(e.matches ? 'dark' : 'light') }
    mq.addEventListener?.('change', onScheme)
    return () => mq.removeEventListener?.('change', onScheme)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem('fbd-theme', next) } catch (e) { /* ignore */ }
      return next
    })
  }, [])

  // Back-to-top visibility.
  useEffect(() => {
    const onScroll = () => setShowBtt(window.scrollY > 480)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = useCallback((target, offset = 0) => {
    const lenis = lenisRef.current
    if (lenis) lenis.scrollTo(target, { offset })
    else if (typeof target === 'number') window.scrollTo({ top: target, behavior: 'smooth' })
    else document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' })
  }, [lenisRef])

  const q = filters.q.trim()
  const scope = filters.date === 'all' ? 'across all days' : 'on ' + fmtDate(filters.date, true)

  return (
    <>
      <Header theme={theme} onToggleTheme={toggleTheme} lastUpdated={meta?.lastUpdated} />

      <Hero theme={theme} onExplore={() => scrollTo('#newsroom', -64)} />

      <main id="newsroom">
        <div className="sec-head">
          <h2>Today&apos;s briefing</h2>
          <p>Industry, marketing, promotions &amp; trends — Bangladesh and global, in one clean feed.</p>
        </div>

        <Stats stats={stats} />

        <Controls filters={filters} setFilters={setFilters} />

        <DateBar
          dates={dates}
          counts={dateCounts}
          total={news.length}
          value={filters.date}
          onChange={(d) => setFilters((f) => ({ ...f, date: d }))}
        />

        {status === 'ready' && (
          <div className="result-bar">
            Showing <strong>{filtered.length}</strong> {filtered.length === 1 ? 'story' : 'stories'} {scope}
            {q && <> matching &ldquo;<strong>{q}</strong>&rdquo;</>}
          </div>
        )}

        <NewsGrid status={status} filtered={filtered} />
      </main>

      <button
        id="btt"
        type="button"
        className={showBtt ? 'show' : ''}
        aria-label="Back to top"
        onClick={() => scrollTo(0)}
      >
        <ArrowUpIcon />
      </button>

      <footer>
        <div className="footer-inner">
          <div className="brand-line">FuturisticBD <span className="accent">Newsroom</span></div>
          <p>
            Curated daily for Bangladesh&apos;s marketing leaders — refreshed every day at 10:00 AM (BST).
            <br />
            Contact: <a href="mailto:contact.futuristicbd@gmail.com">contact.futuristicbd@gmail.com</a>
            <span className="sep">·</span>
            © <span>{new Date().getFullYear()}</span> FuturisticBD. All rights reserved.
          </p>
        </div>
      </footer>
    </>
  )
}
