import { useState } from 'react'
import { LangProvider, type Lang } from './i18n'
import type { SponsorId } from './data/sponsors'
import { PhoneApp } from './surfaces/phone/PhoneApp'

export function App() {
  const [lang, setLang] = useState<Lang>('en')
  const [sponsor, setSponsor] = useState<SponsorId>('federal')

  return (
    <LangProvider lang={lang}>
      <PhoneApp lang={lang} setLang={setLang} sponsorId={sponsor} setSponsor={setSponsor} />
    </LangProvider>
  )
}
