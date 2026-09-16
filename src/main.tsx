import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts and icons are self-hosted rather than pulled from a CDN. The member
// app targets slow Nigerian connections and shared office machines behind
// restrictive networks — a blocked font CDN must not change the layout.
import '@fontsource/public-sans/400.css'
import '@fontsource/public-sans/500.css'
import '@fontsource/public-sans/600.css'
import '@fontsource/public-sans/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@phosphor-icons/web/regular'
import '@phosphor-icons/web/fill'
import '@phosphor-icons/web/bold'
import './theme/tokens.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
