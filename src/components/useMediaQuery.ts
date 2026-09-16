import { useEffect, useState } from 'react'

/**
 * Layout decisions that CSS cannot express — swapping a sidebar for a tab row,
 * for instance — need the breakpoint in JS. Everything that *can* be done in
 * CSS should stay in CSS.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** The spec's breakpoints, named. */
export const BP = {
  /** ≥1280 — desktop, as designed. */
  desktop: '(min-width: 1280px)',
  /** ≥1024 — small desktop; the common secretariat monitor. */
  smallDesktop: '(min-width: 1024px)',
  /** ≤1023 — tablet and narrow windows; nav becomes a tab row. */
  narrow: '(max-width: 1023px)',
  /** ≤767 — phone browser; single column. */
  phone: '(max-width: 767px)',
} as const
