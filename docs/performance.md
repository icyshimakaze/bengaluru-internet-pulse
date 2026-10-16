# Production performance pass

Measurements use local production builds, fictional demo data and a fresh Chromium context per page at 1440 × 950. Script sizes are decoded response bodies; gzip figures are estimates summed per script, not real-user network timings. No live source, database or model API was used for the benchmark.

| Cold page load | Before JS | After JS | Reduction | Gzip estimate, before → after |
| --- | ---: | ---: | ---: | ---: |
| Homepage | 1.34 MB | 0.55 MB | 59% | 373 KB → 166 KB |
| Topic brief | 1.31 MB | 0.87 MB | 33% | 361 KB → 257 KB |
| Methodology | 496 KB | 469 KB | 6% | 148 KB → 140 KB |

The topic plot is near this viewport, so its deferred renderer loads during the topic measurement. The homepage initially requests neither Recharts nor Leaflet. Charts still load when a reader approaches them; this reduces initial work rather than eliminating the plotting library. Street-map JavaScript and CSS load only after opening the map.

## Changes

- Server pages retain headings, content, metadata and data access. A common lazy client renderer isolates Recharts; controls, captions, exact-value tables and reserved plot dimensions remain available before it loads. Next already optimizes Recharts/Lucide package imports, so no redundant experimental import setting was added.
- Leaflet already had a browser-only dynamic boundary and an on-open mount. Its stylesheet now follows that boundary instead of loading on every route. Specific map overrides preserve the existing appearance when library CSS arrives later.
- Pure source labels and neighborhood coordinates no longer import the validation graph. Full client API validation loads in parallel with the request, with the original abort deadline covering both response and validation loading. Invalid payloads, unsafe URLs and mismatched queries still fail closed.
- Homepage initial history is a narrow projection of the already validated topic detail. It contains every displayed score, version and timestamp, without duplicating original evidence or unused history factors. Regression coverage keeps it under one fifth of the full detail's serialized size.
- Layout and page share identical dashboard projections through React request memoization. Topic reads reuse the atomic shared state plus one parameterized history query bounded by its capture timestamp. A cold homepage/topic read needs eight SQL statements rather than sixteen: seven in the shared batch and one history query. Database work is constant per response, without an N+1 query loop. Existing time/topic indexes support these reads; no migration is needed.
- Dashboard, topic list and topic detail each evaluate deterministic topic metrics once per projection. Maps replace repeated linear identity lookups, and hotspot calculations reuse those metrics. Scoring equations, ordering, deduplication and filters are unchanged.
- Clock, metadata and publishing contexts are separate. The live clock updates only relative ages and status; it does not redraw dashboard, chart, stream or footer content. Stable chart rows, filtered topic lists and independent panels avoid unrelated renders.
- Date formatters are reused across ticks and tables. Existing system fonts require zero font requests. No web-font swap or image asset was introduced.

## Payloads and caching

Public API formats stay compatible. In this fixture, `/api/pulse` is about 39.6 KB JSON / 5.0 KB gzip, topic detail 42.1 KB / 5.3 KB, and hotspots 1.8 KB / 0.7 KB. Evidence/history/list limits and truncation metadata are preserved. Production compression already handles these bounded responses; stripping public provenance or compatibility fields is unnecessary.

The server read cache remains 15 seconds and isolated by opaque database identity. Topic history additionally keys on a validated known slug and parent capture time. Unknown slugs never create persistent entries. Clock-dependent scores and freshness still age per request. Dynamic read endpoints retain `Cache-Control: no-store`, and health still probes storage directly; a CDN cannot disguise old or unavailable data as fresh.

## Reproduction and regression coverage

Run `npm run build`, start a local demo production server on port 4320, then run `node scripts/measure-performance.mjs`. An alternate loopback origin can be passed as its first argument. Results are written to ignored `.cache/performance-current.json`. The script does not start ingestion.

`tests/e2e/performance.spec.ts` checks an initial JS budget, absence of chart/map assets before demand, zero font requests, on-open Leaflet CSS, fixed plot height and cumulative layout shift below 0.01 while the lazy plot mounts. Existing browser tests cover 320–1440px layouts, keyboard map controls, accessible tables, WCAG A/AA, metadata, original links, filter races, outages and recovery. Unit tests cover the SQL count, history capture ceiling, single metric evaluation, compact chart data and bounded lazy-validation reads.

These are reproducible local fixture measurements, not remote Turso latency measurements or field Core Web Vitals.

Final validation: `npm run lint`, `npm test -- --maxWorkers=2` (383 tests), `npm run build`, and `npm run test:e2e -- --workers=2` (28 browser tests) passed. Bounded workers avoid competing with the production compiler for local resources.
