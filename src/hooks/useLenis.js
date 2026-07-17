import { useEffect, useRef } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * Sets up a single Lenis smooth-scroll instance and hands the scroll loop to
 * GSAP's ticker so Lenis drives ScrollTrigger (they must not both own rAF).
 * Returns a ref holding the live Lenis instance for programmatic scrollTo().
 */
export default function useLenis() {
  const lenisRef = useRef(null)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const lenis = new Lenis({
      duration: 1.05,
      smoothWheel: !reduce,
      // ease-out expo — settled, minimal feel
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    })
    lenisRef.current = lenis

    lenis.on('scroll', ScrollTrigger.update)

    const onTick = (time) => lenis.raf(time * 1000) // ticker gives seconds, Lenis wants ms
    gsap.ticker.add(onTick)
    gsap.ticker.lagSmoothing(0)

    return () => {
      gsap.ticker.remove(onTick)
      lenis.destroy()
      lenisRef.current = null
    }
  }, [])

  return lenisRef
}
