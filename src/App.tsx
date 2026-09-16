import { useCallback, useMemo } from 'react'
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { ApiProvider } from './api/provider'
import { LangProvider, type Lang } from './i18n'
import type { SponsorId } from './data/sponsors'
import { MemberMobileApp } from './surfaces/phone/MemberMobileApp'
import { MemberWebApp } from './surfaces/web/MemberWebApp'
import { SponsorConsoleApp } from './surfaces/console/SponsorConsoleApp'

const LANGS: Lang[] = ['en', 'ha', 'yo', 'ig', 'pcm']
const SPONSORS: SponsorId[] = ['federal', 'state', 'employer', 'self']

/**
 * Three applications, three route trees.
 *
 *   /         member web — a desk browser, responsive down to 360
 *   /m        member app — mobile-first; the native Android build's web twin
 *   /console  sponsor console — desktop-first, usable on an HR officer's phone
 *
 * Until there is a backend, the member's language and collection rail come from
 * the query string rather than a session: `/?rail=self&lang=ha`. That is also
 * how the demo drives all four rails without a rail switcher living in the
 * product chrome, where it would not belong.
 */
export function App() {
  const [params, setParams] = useSearchParams()

  const lang = (LANGS.includes(params.get('lang') as Lang) ? params.get('lang') : 'en') as Lang
  const sponsorId = (
    SPONSORS.includes(params.get('rail') as SponsorId) ? params.get('rail') : 'federal'
  ) as SponsorId

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params)
      next.set(key, value)
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  const setLang = useCallback((l: Lang) => setParam('lang', l), [setParam])
  const setSponsor = useCallback((id: SponsorId) => setParam('rail', id), [setParam])

  /** Scenario flags the screens read, e.g. `?demo=late,offline`. */
  const demo = useMemo(() => {
    const flags = new Set((params.get('demo') ?? '').split(',').filter(Boolean))
    return { late: flags.has('late'), offline: flags.has('offline'), sun: flags.has('sun') }
  }, [params])

  const shared = { lang, setLang, sponsorId, setSponsor, demo }

  return (
    <LangProvider lang={lang}>
      <ApiProvider>
          <Routes>
          <Route path="/m" element={<MemberMobileApp {...shared} />} />
          <Route path="/m/:screen" element={<MemberMobileApp {...shared} />} />
          <Route path="/console/*" element={<SponsorConsoleApp sponsorId={sponsorId} setSponsor={setSponsor} demo={demo} />} />
          <Route path="/*" element={<MemberWebApp {...shared} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ApiProvider>
    </LangProvider>
  )
}
