import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'
import App from './App'

// Analytics + Speed Insights auto-configure from the Vercel deployment — no keys
// or IDs to wire up. Mounted once at the root (never inside a component that
// unmounts) so they live for the whole session; they render nothing visible.
// Note: these only emit from the deployed Vercel domain, so seeing no events on
// localhost during local dev is expected.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics />
    <SpeedInsights />
  </StrictMode>,
)
