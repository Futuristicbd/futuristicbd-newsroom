import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * Stat tiles that count up from zero and fade in when scrolled into view.
 */
export default function Stats({ stats }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const tiles = el.querySelectorAll('.stat')
    const nums = el.querySelectorAll('.stat-val')

    if (reduce) {
      nums.forEach((n) => { n.textContent = n.dataset.val })
      return
    }

    const ctx = gsap.context(() => {
      gsap.set(tiles, { opacity: 0, y: 16 })
      ScrollTrigger.create({
        trigger: el,
        start: 'top 85%',
        once: true,
        onEnter: () => {
          gsap.to(tiles, { opacity: 1, y: 0, duration: 0.55, ease: 'power2.out', stagger: 0.07 })
          nums.forEach((n) => {
            const end = +n.dataset.val || 0
            const obj = { v: 0 }
            gsap.to(obj, {
              v: end, duration: 1.1, ease: 'power2.out',
              onUpdate: () => { n.textContent = Math.round(obj.v) },
            })
          })
        },
      })
    }, el)
    return () => ctx.revert()
  }, [stats])

  return (
    <section className="stats" ref={ref} aria-label="Newsroom statistics">
      {stats.map((s, i) => (
        <div className="stat" key={i}>
          <div className="stat-val" data-val={s.v}>{s.v}</div>
          <div className="stat-lbl">{s.l}</div>
        </div>
      ))}
    </section>
  )
}
