import { useEffect, useRef } from 'react'

// Themed palette for the Vanta NET effect (hex ints).
const PALETTE = {
  light: { color: 0x0f766e, backgroundColor: 0xf7f7f5 },
  dark:  { color: 0x2dd4bf, backgroundColor: 0x121214 },
}

/**
 * Subtle animated "network" hero background via Vanta + three.js.
 * - three/vanta are dynamically imported so they stay out of the initial paint.
 * - Recreated whenever the theme flips so colors track light/dark.
 * - Skipped entirely on small screens and when the user prefers reduced motion
 *   (Vanta is a WebGL/battery cost); the CSS veil provides a clean static fallback.
 * - destroy() on cleanup — Vanta leaks WebGL contexts otherwise.
 */
export default function VantaBackground({ theme }) {
  const elRef = useRef(null)
  const fxRef = useRef(null)

  useEffect(() => {
    const smallOrReduced =
      window.matchMedia('(max-width: 767px)').matches ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (smallOrReduced) return

    let cancelled = false
    Promise.all([
      import('three'),
      import('vanta/dist/vanta.net.min'),
    ]).then(([THREE, VANTA]) => {
      if (cancelled || !elRef.current) return
      const NET = VANTA.default || VANTA
      const pal = PALETTE[theme] || PALETTE.light
      fxRef.current = NET({
        el: elRef.current,
        THREE,
        mouseControls: true,
        touchControls: false,
        gyroControls: false,
        minHeight: 200,
        minWidth: 200,
        scale: 1,
        scaleMobile: 1,
        color: pal.color,
        backgroundColor: pal.backgroundColor,
        points: 9,
        maxDistance: 21,
        spacing: 19,
        showDots: true,
      })
    })

    return () => {
      cancelled = true
      if (fxRef.current) { fxRef.current.destroy(); fxRef.current = null }
    }
  }, [theme])

  return <div className="hero-canvas" ref={elRef} aria-hidden="true" />
}
