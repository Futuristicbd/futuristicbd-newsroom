import { useEffect, useMemo, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * SplitText — React Bits style character reveal.
 * Splits `text` into words (kept unbreakable) and animated per-character spans,
 * then staggers them in with GSAP. Set `immediate` to fire on mount instead of
 * waiting for a scroll trigger (used for the hero, which is above the fold).
 * Honours prefers-reduced-motion by rendering the text statically.
 */
export default function SplitText({
  text,
  className = '',
  as: Tag = 'span',
  delay = 0,
  duration = 0.7,
  stagger = 0.028,
  ease = 'power3.out',
  from = { opacity: 0, yPercent: 60 },
  to = { opacity: 1, yPercent: 0 },
  immediate = false,
  onComplete,
}) {
  const ref = useRef(null)

  // Preserve word boundaries: split on spaces, render each word as an
  // inline-block that won't wrap mid-word.
  const words = useMemo(() => String(text).split(/(\s+)/), [text])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const chars = el.querySelectorAll('.split-char')
    if (reduce || !chars.length) {
      gsap.set(chars, to)
      onComplete?.()
      return
    }

    const ctx = gsap.context(() => {
      gsap.set(chars, from)
      gsap.to(chars, {
        ...to,
        duration,
        ease,
        stagger,
        delay,
        ...(immediate
          ? {}
          : { scrollTrigger: { trigger: el, start: 'top 85%', once: true } }),
        onComplete,
      })
    }, el)

    return () => ctx.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  let charKey = 0
  return (
    <Tag ref={ref} className={className} aria-label={text}>
      {words.map((w, wi) => {
        if (/^\s+$/.test(w)) return ' '
        return (
          <span className="split-word" key={wi} aria-hidden="true">
            {Array.from(w).map((ch) => (
              <span className="split-char" key={charKey++}>{ch}</span>
            ))}
          </span>
        )
      })}
    </Tag>
  )
}
