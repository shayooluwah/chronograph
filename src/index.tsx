import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'
import App from './App'

// Routes (all render the same <App />, which reads the params):
//   /                    → year map (home)
//   /:year               → that year, all categories active
//   /:year/:categories   → that year, filtered to the listed category slugs
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/"                   element={<App />} />
        <Route path="/:year"              element={<App />} />
        <Route path="/:year/:categories"  element={<App />} />
      </Routes>
    </BrowserRouter>
    {/* Analytics + Speed Insights auto-configure from the Vercel deployment — no
        keys or IDs to wire up. Mounted once at the root (never inside a component
        that unmounts) so they live for the whole session; they render nothing
        visible. They only emit from the deployed Vercel domain, so seeing no
        events on localhost during local dev is expected. */}
    <Analytics />
    <SpeedInsights />
  </StrictMode>,
)
