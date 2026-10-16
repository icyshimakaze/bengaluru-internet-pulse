# Launch visual review

The original page gave its introductory question and collection totals more prominence than its evidence. Small labels, duplicated metrics and explanatory sections made a relatively simple product feel like a dashboard. The refinement makes the product proposition explicit and gives the first trend the strongest visual treatment.

| Area | Refinement |
| --- | --- |
| Landing viewport | Direct product name, momentum distinction, named public sources and actual snapshot status. A shorter introduction brings the lead trend into the viewport. |
| Typography and hierarchy | Serif headlines and score numerals, larger supporting text, a wider lead column and quieter secondary rows. Removed the stock pulse icon and miniature charts. |
| Spacing, color and borders | Retained the warm paper, dark ink and restrained green palette. Removed boxes around lifecycle labels, segmented-button fills and internal metric dividers. |
| Controls and mobile | Native category/source selectors replace the scrolling category strip. Controls use 44px targets; navigation remains visible on mobile. Search uses 16px text on phones. |
| Charts and map | Larger axis text, concise chart context, exact data tables and offset map labels. Empty geography omits the unused plot. Keyboard selection, tile failure notices, retry and attribution remain available. |
| Topic briefs | Removed repeated metrics beneath the explanation. Replaced the evidence card grid with a ruled list; dates, discovery/publication labels and original links remain visible. |
| Methodology and footer | Shorter product-facing explanations, detailed thresholds in a disclosure and a compact footer. Removed the homepage pipeline tutorial and infrastructure details from the reader's path. |
| Missing data, errors and loading | Clear demo/fictional status, delayed live state, plain recovery actions and quiet static skeletons. Failed reads preserve the last evidence and allow retry. |

## Verification

- Reviewed rendered homepage, topic brief, methodology, chart and map on desktop and mobile.
- Browser coverage at 1440, 1024, 768, 390 and 320px; topic and street-map tests also exercise expanded tables, long titles and popups.
- WCAG A/AA automated checks, keyboard map selection, filter races, failed reads, retry, empty live mode, missing topics, chart failures and tile outages.
- Production build, strict lint, 377 unit tests and 27 browser tests passed.

Scoring, ingestion, provider selection and public read contracts are unchanged. Live status still requires actual fresh successful collection. Demo evidence remains explicitly fictional.
