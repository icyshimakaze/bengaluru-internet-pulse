# Editorial homepage

The homepage introduces the city, live public sources and momentum before asking the reader to inspect a score. A lead topic receives editorial emphasis; secondary topics stay compact. Pulse Score, smoothed two-hour change, source count, confidence and lifecycle are displayed separately. Source and time filters select evidence, never alter the deterministic ranking equation.

## Read and interaction boundaries

All data comes from validated server projections. The browser requests only the public read routes, never a database, upstream source, ingestion endpoint or model. Category chips use the persisted semantic taxonomy: civic, traffic, technology, business, culture, food, events, weather and sports. The older editorial API buckets remain supported. An absent persisted semantic classification falls back to its existing coarse category; unknown city-life classifications are `other`, rather than invented subcategories.

Time controls query two/six/24-hour activity. Pulse Scores always compare the latest two hours with the preceding two. Search filters the returned topics locally. Category/source changes refresh the whole model, including hotspots and stream. Pending requests have a ten-second deadline; changing filters cancels the previous request and an increasing request ID prevents a late response replacing a newer selection. A failed read retains the previous snapshot and restores its filters. Valid 503 empty models show missing live collection honestly. Live reads refresh every minute.

The chart switches between recorded v2 Pulse Score snapshots within the last 24 hours and hourly distinct signal counts. Topic selection fetches bounded public detail data. Loading, errors, retry, absent history and single snapshots have explicit states. A keyboard-accessible data table supplies exact values. Demo score history is a deterministic replay at 30-minute intervals against the fictional observations available at each time; it is labeled fixture replay and is never written to live storage.

The neighborhood view projects curated geographic centers onto a latitude/longitude grid. It does not invent city boundaries, roads or incident locations. Circle size represents explicit mention activity; stronger emerald emphasis represents the top topic's Pulse Score. Empty and citywide locations have no markers. Keyboard and pointer selection share the same focused neighborhood, counts and linked topic. The optional React Leaflet street map has rich tooltips/popups, a tile-outage fallback and retry; the geographic diagram and controls require no external service. See [Hotspot map](hotspots.md) for client boundaries, attribution and responsive behavior.

The stream displays latest-first deduplicated evidence, original HTTP(S) links, provider, domain, timestamp and publication/discovery distinction. Demo URLs and fictional reports are explicitly labeled. Expansion shows up to the API's 30-item limit; full counts and truncation remain visible. Footer links lead to methodology, actual GitHub repository and sources; ingestion time always refers to a successful live run.

## Truthful status and accessibility

`LIVE` requires live mode, a successful ingestion timestamp no more than 45 minutes old, no future timestamp, a readable non-stale snapshot, and no delayed read-cache refresh. A fresh partial ingestion may be live while individual source gaps remain visible. Otherwise the header says `DELAYED`. Demo mode always says `DELAYED / DEMO` and has no successful live ingestion. The server evaluation clock initializes the first render; a client timer advances freshness after hydration, avoiding locale/clock mismatches.

The layout supports 320px mobile through desktop, uses semantic headings, labeled controls, pressed states, live read feedback, focus outlines, safe external links and reduced-motion preferences. No stock imagery, gradients, sidebars, animation loops or paid APIs are required. Browser tests cover filters, request races, outages, retry, chart/table modes, neighborhood keyboard input, stream expansion, original links, truthful statuses, navigation, hydration, viewport overflow and WCAG A/AA checks.
