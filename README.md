# ChronoGraph

**Interactive historical graph explorer powered by Wikidata.**

Enter any year and ChronoGraph fetches real historical data — births, deaths, events, and organizations — then renders them as an animated radial graph against a living star-field background. Click any node to read its full Wikidata entry and jump to Wikipedia.

---

## Tech stack

| Layer | Technology |
|---|---|
| UI framework | React 19 + TypeScript |
| Graph / animation | D3.js v7 |
| Styling | Tailwind CSS v3 |
| Build tool | Vite |
| API / backend | Vercel Serverless Functions (Node.js) |
| Data source | Wikidata SPARQL endpoint |
| HTTP client | Axios |
| Routing (future) | React Router DOM |

---

## Features

- 🌌 Canvas-based animated star-field background (200 twinkling particles)
- 🔭 Radial D3 graph with category-coloured nodes and burst entry animation
- 🗓️ Supports any year including BCE (e.g. `-44` for 44 BCE)
- 🔍 Per-category filter pills (Births, Deaths, Events, Organizations, Publications, Wars, Discoveries)
- 📖 Slide-in event detail panel with Wikipedia deep-link
- 📱 Responsive — bottom-sheet panel and compact layout on mobile
- ⚡ 24-hour CDN cache on the serverless function; no auth required

---

## Run locally

```bash
# 1. Install dependencies
npm install

# 2. Start the Vite dev server
npm run dev
```

The app is served at **http://localhost:5173**.

> **Note — API in development:**
> The serverless function at `api/year.js` runs on Vercel's edge infrastructure.
> For local development, install the Vercel CLI and run `vercel dev` instead of
> `npm run dev` if you want live SPARQL calls. `npm run dev` alone still works —
> the Vite proxy will 404 on `/api/*`, but you can mock responses or point the
> client at a deployed preview URL by setting `VITE_API_BASE` in a `.env.local` file.

---

## No API keys required

ChronoGraph queries the public [Wikidata SPARQL endpoint](https://query.wikidata.org/) directly — no registration, tokens, or billing needed for the MVP.

---

## Project structure

```
chronograph/
├── api/
│   └── year.js          # Vercel serverless function (SPARQL -> HistoricalEvent[])
├── src/
│   ├── api/
│   │   └── yearApi.ts   # Axios client wrapper
│   ├── components/
│   │   ├── SpaceBackground.tsx  # Canvas starfield
│   │   ├── Graph.tsx            # D3 radial graph
│   │   ├── SearchBar.tsx        # Landing/graph mode morphing search
│   │   ├── CategoryFilter.tsx   # Toggle pills
│   │   └── EventPanel.tsx       # Slide-in detail panel
│   ├── types/
│   │   └── index.ts     # HistoricalEvent, GraphNode, GraphLink, YearData
│   ├── App.tsx
│   └── main.tsx
├── vercel.json           # API rewrite rules
└── vite.config.ts
```

---

## Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Vercel auto-detects the `api/` directory and deploys `year.js` as a serverless function. No additional configuration required.
