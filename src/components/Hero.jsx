import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import VantaBackground from './VantaBackground.jsx'
import SplitText from './SplitText.jsx'
import { ChevronDownIcon } from './icons.jsx'

/**
 * Full-viewport hero: animated Vanta network background, SplitText headline,
 * and a subtle parallax drift on the content as you scroll away.
 */
export default function Hero({ theme, onExplore }) {
  const innerRef = useRef(null)
  const heroRef = useRef(null)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const ctx = gsap.context(() => {
      // Fade + lift the eyebrow / sub / CTA in after the headline starts.
      gsap.from('.hero-anim', {
        opacity: 0, y: 22, duration: 0.7, ease: 'power3.out',
        stagger: 0.12, delay: 0.35,
      })
      // Parallax: content drifts up and fades as the hero leaves the viewport.
      gsap.to(innerRef.current, {
        yPercent: -18, opacity: 0.25, ease: 'none',
        scrollTrigger: {
          trigger: heroRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      })
    }, heroRef)
    return () => ctx.revert()
  }, [])

  return (
    <section className="hero" ref={heroRef}>
      <VantaBackground theme={theme} />
      <div className="hero-inner" ref={innerRef}>
        <span className="hero-eyebrow hero-anim">
          <span className="dot" /> Refreshed daily · 10:00 AM BST
        </span>
        <SplitText
          as="h1"
          text="The pulse of Bangladesh marketing."
          immediate
          delay={0.1}
        />
        <p className="hero-sub hero-anim">
          A minimalist daily briefing of industry moves, marketing shifts, promotions
          and trends — curated for Bangladesh&apos;s business leaders, with the world in view.
        </p>
        <div className="hero-cta hero-anim">
          <button className="hero-btn primary" type="button" onClick={onExplore}>
            Explore the newsroom
          </button>
          <a className="hero-btn" href="mailto:contact.futuristicbd@gmail.com">
            Get in touch
          </a>
        </div>
      </div>
      <button className="scroll-cue" type="button" onClick={onExplore} aria-label="Scroll to stories">
        Scroll
        <ChevronDownIcon />
      </button>
    </section>
  )
}
