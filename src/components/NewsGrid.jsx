import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import NewsCard from './NewsCard.jsx'

gsap.registerPlugin(ScrollTrigger)

export default function NewsGrid({ status, filtered }) {
  const gridRef = useRef(null)

  // Scroll-reveal cards in staggered batches. Re-runs whenever the filtered
  // list changes; initial hidden state is applied in JS so a no-JS/failed
  // render still shows every card.
  useEffect(() => {
    const el = gridRef.current
    if (!el || status !== 'ready') return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    const cards = el.querySelectorAll('.card.reveal')
    if (!cards.length) return

    const ctx = gsap.context(() => {
      gsap.set(cards, { opacity: 0, y: 18 })
      ScrollTrigger.batch(cards, {
        start: 'top 92%',
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, {
            opacity: 1, y: 0, duration: 0.5, ease: 'power2.out',
            stagger: 0.06, overwrite: true,
          }),
      })
      ScrollTrigger.refresh()
    }, el)
    return () => ctx.revert()
  }, [filtered, status])

  if (status === 'loading') {
    return (
      <section className="grid" aria-live="polite">
        <div className="loading-bar" aria-label="Loading"><span /></div>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section className="grid" aria-live="polite">
        <div className="state-box">
          <h3>Unable to load the newsroom feed</h3>
          <p>The news data could not be fetched right now. Please check your connection and try again shortly.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="grid" ref={gridRef} aria-live="polite">
      {filtered.length === 0 ? (
        <div className="state-box">
          <h3>No stories match</h3>
          <p>Try clearing the search, switching filters, or choosing another date.</p>
        </div>
      ) : (
        filtered.map((n) => <NewsCard n={n} key={n.id} />)
      )}
    </section>
  )
}
