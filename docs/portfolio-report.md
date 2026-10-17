# Portfolio readiness delivery report

18 October 2026. Local branch: `polish/portfolio-readiness`. Four phase commits; nothing was pushed, merged, deployed or tagged. No production settings or production database were changed.

## Completed by phase

| Phase | Commit | Delivered |
| --- | --- | --- |
| 1 | `98831c1` | Dedicated Status, Privacy and Terms routes; one masthead; footer links/contact; lead evidence gate and 24H fallback; reading help; local language hints; additive repeated-failure checkpoint. |
| 2 | `5174c07` | Retained filter reasons/Jobs exclusion, cricket event clustering, 140-name locality gazetteer with nine OSM centers, strict HN relevance, optional verified RSS/Atom feeds, source/rights diagnosis and heuristic worker default. |
| 3 | `ff85122` | Random redacted sampling, empty human labels, isolated predictions, synthetic evaluator fixtures/CI tests, P/R/F1/category/clustering tables, stored-history Markdown/CSV backtests and case-study template. |
| 4 | This report's commit; exact hash in delivery response | Concise README, real Playwright demo captures, Mermaid flow, deployment/decision docs, preserved prior README source, MIT license placeholder, contribution guide and package metadata. |

## Before and after checks

| Check | Baseline `3f8aeff` | Phase 1 | Phase 2 | Phase 3 | Final |
| --- | --- | --- | --- | --- | --- |
| Clean install | Pass | - | - | - | Pass |
| Lint | Pass | Pass | Pass | Pass | Pass |
| Typecheck | Pass | Pass | Pass | Pass | Pass |
| Unit tests | 449 | 461 | 488 | 495 | 495 |
| Playwright | 36 | 36 | 37 | 37 | 37 |
| Production build | Pass | Pass | Pass | Pass | Pass |

The final unit command uses `npm test -- --maxWorkers=2`; no test is skipped or weakened. Standard runs passed earlier, but this Windows/Node 26 environment intermittently exits a native libSQL test worker. A thread-pool attempt also crashed; the bounded final fork run passed cleanly. Required CI remains on Node 22. Browser checks include WCAG A/AA, responsive overflow, keyboard maps, source links, races, new routes, Jobs/RSS/language display and backend isolation. Logs are retained locally in ignored `.cache/portfolio/`.

`npm run screenshot` captures actual demo pages in `docs/images/`, checks the model/overflow/masthead and waits for fonts/the plot. Captures were visually inspected; the topic masthead scroll-timing issue was corrected. No generated image or live-looking fictional evidence is presented as production.

## Not verified or intentionally left to the author

- Real accuracy remains **TBD**. The 150-row ignored sample is from the verified existing 173-row Bluesky audit archive (13-15 October 2026 UTC), with every truth label empty. Stored assignments predate these changes; its sidecar records that limitation. The configured database was empty and a new isolated keyless collection returned zero usable evidence from this workstation. No data or labels were fabricated.
- No real case-study timeline could be filled: the checked databases had no available topic snapshots. Backtest emitted an honest empty table/CSV; synthetic tests verify saved values and version separation.
- GDELT still times out or fails at the network boundary; its private workflow log download returned HTTP 403. Earlier public audits recorded 429. There is no verified permanent root cause or claimed upstream fix. Other sources remain independent.
- Both RSS feeds returned real XML and passed parser checks, but publisher reuse terms remain **unchecked**. RSS stays off until review. Failed/nonlocal feed candidates are documented in [sources](data-sources.md).
- 131 coordinates remain unverified and are excluded from maps; all are listed below. Nine centers have OSM links in [the locality record](neighborhoods.md). Language hints and English locality aliases have documented limits.
- Five existing high-severity **development-tool** dependency advisories remain (Next ESLint plugin/config, braces, fast-glob, micromatch). `npm audit --omit=dev` reported zero production advisories. npm proposes a semver-major ESLint configuration downgrade to 14.2.35; no forced framework/tooling downgrade was applied.
- No deployment, production ingestion, repository settings, external account or release tag was changed. API providers were tested with mocks, with no model credits spent.

The repository already used scoring v3 when work began. Its equation, weights, confidence, caps and lifecycle were preserved; the engine-file edit only excludes unverified map centers. Historical versions/mock provenance and applied migration checksums are preserved. New numbered migrations are 0009/0010. There was no AGENTS.md conflict requiring an exception; the request's v2 reference was a repository-version mismatch, not a reason to downgrade scoring. The health API retains compatibility semantics, while the Status presentation separates heuristic fallback from source failure.

The pre-existing README was preserved verbatim in [historical source](readme-before-portfolio.md) before rewriting. Pre-existing untracked assets/recruiter review remain untouched and uncommitted.

## Every author placeholder (16)

- `README.md:14`: describe the Bengaluru question that prompted this project.
- `README.md:15`: describe the use case you wanted to explore.
- `README.md:16`: explain your contribution and what you learned, in your own words.
- `LICENSE:3`: copyright holder
- `docs/decisions.md:7`: why exactly two hours rather than another interval?
- `docs/decisions.md:10`: record the original hosting/scheduler selection rationale beyond this separation.
- `docs/decisions.md:12`: why these exact retention durations?
- `docs/neighborhoods.md:19`: verify these coordinates
- `docs/case-study-template.md:1`: event title
- `docs/case-study-template.md:5`: describe the actual event and link sources.
- `docs/case-study-template.md:6`: specify the stored topic and UTC/IST period.
- `docs/case-study-template.md:7`: record known missing/stale sources.
- `docs/case-study-template.md:11`: add the actual timeline, or state that no history exists.
- `docs/case-study-template.md:15`: support each observation with stored evidence and dates.
- `docs/case-study-template.md:19`: identify confirmed grouping/category/location/filter errors and counterexamples.
- `docs/case-study-template.md:23`: distinguish implemented fixes from proposed work and report the checks actually run. Do not infer causes from a score or claim an all-time peak from bounded history.

## Every unverified locality (131)

Each entry is explicitly `coordinates_unverified` in the gazetteer and has no map coordinates.

- MG Road
- Malleshwaram
- Rajajinagar
- Basavanagudi
- Banashankari
- JP Nagar
- BTM Layout
- Bellandur
- Sarjapur Road
- Sarjapur
- Domlur
- Ulsoor
- Frazer Town
- Cox Town
- Richmond Town
- Cooke Town
- Benson Town
- Shivajinagar
- Vasanth Nagar
- Sadashivanagar
- Seshadripuram
- Majestic
- Gandhinagar
- Chamrajpet
- Vijayanagar
- Nagarbhavi
- Kengeri
- Kumaraswamy Layout
- Padmanabhanagar
- Uttarahalli
- Girinagar
- Hanumanth Nagar
- Vidyaranyapura
- Sahakar Nagar
- Sanjay Nagar
- RT Nagar
- Ganganagar
- Mathikere
- Yeshwanthpur
- Jalahalli
- Peenya
- Dasarahalli
- Nagasandra
- Hesaraghatta
- Doddaballapur
- Bagalur
- Thanisandra
- Hennur
- Horamavu
- Banaswadi
- Kammanahalli
- Kalyan Nagar
- Ramamurthy Nagar
- KR Puram
- Kasturi Nagar
- CV Raman Nagar
- Baiyappanahalli
- Benniganahalli
- Mahadevapura
- Doddanekundi
- Brookefield
- Kundalahalli
- AECS Layout
- Varthur
- Gunjur
- Kadugodi
- Belathur
- Channasandra
- Hoodi
- ITPL
- Panathur
- Balagere
- Kadubeesanahalli
- Devarabisanahalli
- Kaikondrahalli
- Kasavanahalli
- Harlur
- Kudlu
- Singasandra
- Begur
- Bommanahalli
- Hongasandra
- Garvebhavi Palya
- Hosur Road
- Chandapura
- Anekal
- Attibele
- Jigani
- Bommasandra
- Bannerghatta
- Gottigere
- Hulimavu
- Arekere
- Bilekahalli
- Dollars Colony
- Wilson Garden
- Shanti Nagar
- Langford Town
- Austin Town
- Neelasandra
- Adugodi
- Ejipura
- Vivek Nagar
- Victoria Layout
- Ashok Nagar
- Cubbon Park
- Church Street
- Residency Road
- Cunningham Road
- Infantry Road
- Kasturba Road
- Richmond Road
- Race Course Road
- Lavelle Road
- New BEL Road
- Devanahalli
- Jakkur
- Amruthahalli
- Kodigehalli
- Byatarayanapura
- Sampigehalli
- Nagavara
- Manyata Tech Park
- Chikkabanavara
- Soladevanahalli
- Rajanukunte
- Yelahanka New Town
- Kamakshipalya
- Basaveshwaranagar
- Laggere
- Nandini Layout

## Manual actions

1. Set the GitHub Actions repository Variable `ENRICHMENT_PROVIDER=heuristic`, unless intentionally using a working optional API key/model. Code defaults do not override an existing repository Variable.
2. Hand-label ignored `eval/labels.csv` using the documented archive scope; obtain a current collected sample before claiming current-pipeline accuracy. Keep `eval/predictions.json` with it, then run `npm run eval`.
3. Verify all coordinates above using trustworthy locality data and preserve source links before enabling their map points.
4. Confirm The Hindu/Citizen Matters feed terms and intended enrichment/publication rights; only then enable worker Variable `RSS_ENABLED=true`.
5. Set optional `CONTACT_EMAIL` in Vercel to the author's actual public address, or leave it unset to hide Contact. Review draft Privacy/Terms.
6. Fill the author story, copyright holder, missing decision rationales and real case study. Review the development dependency advisories.
7. Add the GitHub repository About description and topics; package metadata is supplied but does not change GitHub settings.
8. Review/merge/publish the branch through the normal release process, verify deployed source status and migrations, and tag a `v1.0` release when satisfied.
