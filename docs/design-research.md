# Bengaluru Pulse design research

Researched 17 October 2026, before implementing the redesign. Production was inspected with Chromium at 1920, 1600, 1440, 1280, 1024, 768, 430 and 390px. Captures and API responses are in `artifacts/before/` (local, ignored). The exact page background is **#f8f7f2** (rgb 248, 247, 242); it stays unchanged.

## References and translation

These are design interpretations of current public pages, not claims that their layouts should be reproduced.

| Examined | Useful principle | Adapt for Pulse | Do not copy |
| --- | --- | --- | --- |
| [Linear](https://linear.app/) | Compact navigation, clear hierarchy, contextual activity | A compact masthead and timestamps next to evidence | Dark styling, marketing hero, product screenshots |
| [Vercel](https://vercel.com/) | Rules establish modular regions; progressive detail | A wide twelve-column composition with shared alignment | Black-and-white branding, agent marketing, decorative geometry |
| [Resend](https://resend.com/) | Restrained typography and focused interaction | Quiet controls; small, predictable hover and focus responses | Dark palette, cinematic hero and 3D assets |
| [The Pudding](https://pudding.cool/) | Lead stories carry more visual weight than supporting stories; browsable categories | A large leading topic beside compact ranked rows, searchable evidence | Illustrations, sticker graphics, story compositions |
| [Our World in Data](https://ourworldindata.org/) | Narrative, charts and source context coexist; data is inspectable | Chart table alternatives, explicit units, methodology one click away | Their page grid, blue palette or charts verbatim |
| [Observable](https://observablehq.com/) | Exploration starts with a useful question and responsive controls | Topic and metric selectors directly above momentum history | Dashboard templates or showcase datasets |
| [Reuters Graphics colour system](https://graphics.thomsonreuters.com/testfiles/2026/o96NvTQkPV/) | Separate context, focus, quantity and direction with semantic colours | One forest accent, muted grid, amber delay and red errors; text accompanies colour | Reuters palette and chart designs |
| [Webby 2026 data visualization gallery](https://winners.webbyawards.com/winners/websites-and-mobile-sites/features-design/best-data-visualization) | Comprehension is the point of interaction | Neighborhood selection changes the supporting evidence; no scroll hijacking | Award-winner artwork, large immersive canvases or motion effects |
| [Awwwards interactive collection](https://www.awwwards.com/websites/web-interactive/?page=5) | Interaction and micro-interaction are distinct design tools | Short row, tab and link transitions; reduced-motion alternatives | Experimental navigation, cursor replacement or loading spectacles |

The Reuters landing page, Datawrapper home and Awwwards data-visualization landing page did not return usable pages through the research tool; they are not treated as inspected examples. Awwwards collection results were available through search. Public reference pages were read through web research; only Pulse received browser viewport inspection.

## Original direction: a city signal edition

- Preserve the warm paper background. Forest ink, fine rules and tabular numerals establish a data publication, not a SaaS template.
- Fluid outer gutters and a 1760px data ceiling; use twelve columns rather than widening every block equally. Reading text keeps a short measure. At 1920px, primary data occupies over 90% of the viewport.
- Use a disciplined variable sans family plus one data mono. A compact editorial question sits above immediately useful evidence, rather than a separate marketing hero.
- A large lead topic, ranked supporting rows and a narrow city briefing form distinct but aligned regions. The source stream reads as a full-width evidence ledger.
- Separate collection, enrichment and publication freshness. Show one concise summary and reveal operational detail on demand.
- Default to NOW: select the shortest window with qualifying topics, then the shortest with source evidence. Explicit selections never expand. Every activity count retains its window; scores always use the deterministic 2h engine.
- Motion explains arrival, selection and changing values. Content is visible without JavaScript animation, map bundles remain deferred, and reduced motion disables ornamental movement.

## Baseline audit

At 1920px, production used a 1200px column (62.5% of the screen). A long operational notice and a large empty 2h area pushed useful content down. There were no qualifying topics or source rows in 2h despite retained 24h observations. The same narrow shell constrained charts and topic pages. Background and quiet editorial tone were worth preserving.

Health at 16:08 UTC / 21:38 IST: database healthy; snapshot 13:16 UTC / 18:46 IST; GDELT failed all five queries; Bluesky partial with 92 accepted items; HN completed with one duplicate. All were honestly older than 90 minutes. The latest eight public scheduled workflow executions were separated by roughly 2–4.5 hours despite a 30-minute cron. The latest job completed all configuration, collection and publication steps successfully. This is evidence of scheduling gaps, not proof of missing secrets. Private secret values and provider logs were unavailable; xKiro's precise upstream error cannot be inferred from its fallback count.

A later production probe found a second issue: `/api/health` and `/api/hotspots?window=24h` saw the new 16:31 UTC snapshot while the first `/api/pulse?window=24h` and topic-list reads still returned 13:16 UTC data. This is consistent with stale-while-revalidate read caching and motivates the bounded direct read-through added to the read layer. A live GDELT probe independently returned HTTP 429. Neither condition is concealed by changing labels.
