import { useEffect, useRef, useState } from 'react'
import { MoonIcon, SunIcon } from './icons.jsx'

/**
 * Sticky header that slides in once the hero is scrolled past, and hosts the
 * theme toggle + last-updated stamp.
 */
export default function Header({ theme, onToggleTheme, lastUpdated }) {
  const ref = useRef(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const onScroll = () => setRevealed(window.scrollY > window.innerHeight * 0.6)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const stamp = lastUpdated
    ? (() => {
        const d = new Date(lastUpdated)
        return isNaN(d) ? '' : 'Updated ' + d.toLocaleString(undefined, {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        })
      })()
    : ''

  return (
    <header ref={ref} className={revealed ? 'revealed' : ''}>
      <div className="header-inner">
        <div className="brand">
          <h1>FuturisticBD <span className="accent">Newsroom</span></h1>
          <p>Daily marketing &amp; industry intelligence — Bangladesh &amp; global</p>
        </div>
        <div className="header-meta">
          {stamp && <div id="last-updated">{stamp}</div>}
          <button
            id="theme-toggle"
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title="Toggle theme"
          >
            <MoonIcon />
            <SunIcon />
          </button>
        </div>
      </div>
    </header>
  )
}
