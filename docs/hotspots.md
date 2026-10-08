# Neighborhood activity map

The hotspot map uses React Leaflet and OpenStreetMap. It visualizes explicit neighborhood mentions, never people or verified incident locations. No source request invokes a geocoder. `coordinates` in `src/lib/domain/schema.ts` is the shared curated constant of approximate centers for ten supported Bengaluru neighborhoods. Citywide, Unknown and null are not coordinate entries.

## Data and visual encoding

The server read projection calculates each neighborhood's distinct recent signal count, contributing topics, highest-ranked topic, its Pulse Score and the mean score of distinct topics. Signals deduplicate across the whole evidence set before grouping; repeated polls and syndicated copies do not add activity. Only successfully enriched relevant signals with an explicit supported neighborhood contribute. A topic's neighborhood alone never places its citywide signals on the map.

Activity uses the selected 2H/6H/24H window and category/source filters. Top-topic ranking remains the deterministic all-provider latest-two-hour score, even under source filtering. Positive activity may have a low or zero score; that is still an observed mention. Neighborhoods with no activity have no markers, including in the offline geographic diagram.

Both map views use bounded screen-pixel radius `min(24, 7 + 2 × sqrt(activity))`. Leaflet fill opacity is `0.16 + 0.50 × (topPulse / 100)` and outline weight is `1 + 1.3 × (topPulse / 100)`, with one restrained emerald color. Higher scores receive stronger emphasis independently of marker size. Selection adds an outline. Incoming coordinates never override the curated centers.

Hover/focus tooltips and click/Enter popups display neighborhood, recent signal count and window, top topic and Pulse Score. The popup links to the topic brief. Markers and the neighborhood list share selection. Keyboard users can focus markers, open details with Enter/Space, close them with Escape, and use the equivalent evidence list. Titles render as escaped React text rather than HTML.

## Rendering and resilience

All map callers use `hotspot-map-client.tsx`, whose dynamic import disables SSR. No server render evaluates Leaflet or React Leaflet. The stable loading placeholder reserves map height; the map mounts only when the street-map disclosure opens. Unmounting the disclosure cleans up Leaflet and observer listeners before reopening.

The viewport fits only the active curated centers, caps automatic zoom at 12 and disables scroll-wheel zoom/animated transitions. A ResizeObserver coalesces resize work, invalidates Leaflet's dimensions and refits the current centers on responsive layout changes. It disconnects and cancels pending frames on unmount. Ordinary selection or score updates do not reset the viewport. Empty views display Bengaluru without markers and an explicit empty message.

Tiles use `https://tile.openstreetmap.org/{z}/{x}/{y}.png` with visible linked “© OpenStreetMap contributors” attribution. Only the visible viewport is requested; there is no offline prefetch, forced cache bypass or server proxy. Browser caching, identification and referrers remain intact. Tile failures keep evidence markers and lists usable, show an honest message outside the map, and offer a user-triggered tile-layer retry without remounting the map. Successful subsequent loads clear the outage notice. The disclosure avoids external tile requests before the user opens it.

The integration follows the official [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/), [React Leaflet component API](https://react-leaflet.js.org/docs/api-components/) and [Leaflet reference](https://leafletjs.com/reference.html). Demo activity remains explicitly fictional.

## Verification

Fixture tests cover bounded independent visual encodings, supported centers, no activity, citywide signals despite topic-level locations, duplicate polling, top-topic scores, source-filter score consistency and server rendering without browser globals/dependencies. Browser tests use intercepted tile fixtures to avoid external network dependence; they verify attribution, tooltip/popup content, keyboard and list synchronization, working topic links, filter changes, tile outage/recovery, repeated mounting, responsive resize, accessibility, overflow and hydration.
