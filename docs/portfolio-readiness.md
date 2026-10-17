# Portfolio readiness verification

Baseline on 18 October 2026 at commit `3f8aeff`: `npm ci`, lint, typecheck, 449 unit tests, production build and 36 Playwright tests passed. Initial install hit libSQL locked by two repository preview servers; stopping those servers resolved it. Playwright required Windows process permission. npm reported five high-severity dependency advisories; no automatic major upgrade was applied.

Existing README edits and untracked demo assets/recruiter review were preserved. The original README is copied into ignored `.cache/portfolio/README.before.md` for the later documentation move.

## Phase 1 contracts

One shared masthead contains Pulse, Explore, Map and Methodology. GitHub and the small status indicator live in the footer. `/status` reads validated health/dashboard projections and separates collection, enrichment and publication. It never collects. `/api/health` retains its existing aggregate and HTTP semantics for compatibility.

The presentation status ignores heuristic selection/fallback. Migration 0009 adds consecutive failed/partial collection counts, reset by a fully successful poll. Two consecutive problem polls qualify as repeated source failure; stale data and delayed reads remain visible. Old databases default this counter to zero until migrated; source rows still disclose each actual error. Existing per-source health/API labels remain compatible. Historic failure counts are not invented.

The homepage lead requires two distinct latest-2H signals, a positive deterministic score and confidence >=35%. This is a presentation gate, not a scoring change. NOW chooses the shortest eligible window and otherwise uses 24H. Explicit activity windows remain fixed. Compatibility topic lists can still contain wider-window diagnostic zero scores; the UI never promotes those to the lead. Below-threshold conversations remain in Recently observed; when no lead qualifies its heading is “Top stories in the last 24 hours”, ordered by timestamp then source count, explicitly labeled observations.

Language badges use local Unicode script counts (English/Latin, Kannada, Tamil, Hindi/Devanagari, other). These are estimates: Devanagari is not uniquely Hindi, Latin text is not uniquely English, and mixed/transliterated text is limited. No network language detector is used.

Privacy/Terms describe repository behavior and carry draft source comments. `CONTACT_EMAIL` is optional, server-validated and intentionally public only as the contact link.

Phase 1 final checks: lint, typecheck, 461 unit tests, production build and all 36 Playwright tests passed. Browser checks include Status/Privacy/Terms WCAG A/AA scans, zero-score lead exclusion, footer navigation, and 320–1920px layouts. Full logs are retained locally under `.cache/portfolio/phase1-*.log`.

## Phase 2 verification

Final standard `npm test`: 488 tests passed in 34 files. Lint, typecheck, production build and all 37 Playwright tests passed, including RSS/Jobs/language accessibility, map keyboard controls, provenance, migration rollback and existing provider behavior. One earlier serial fork run printed a native Windows shutdown warning after all assertions passed; an attempted thread pool crashed in the native runtime. The final standard pool passed cleanly. No tests were skipped, weakened or removed. Existing coordinate expectations now use verified OSM values, with new assertions excluding unverified centers.

The deterministic score equation, weights, confidence, caps and lifecycle are unchanged. The only engine-file change is the map guard for unverified centers. The repository already used v3 before this work (Currents shares the v2 news channel); the request's v2 reference was not used to downgrade it. Migrations 0001–0009 retain their prior content/checksums. New migration 0010 adds RSS/filter/publisher contracts and preserves historical rows/provenance.

Real cached feed XML passed the parser: The Hindu yielded 50 considered valid metadata entries; Citizen Matters yielded three locally relevant entries out of ten. These are parser checks, not ingestion counts or accuracy results. Publisher terms remain unchecked; RSS is implemented but disabled by default. GDELT remains an honestly reported upstream timeout/network limitation, with no unverified root-cause or repair claim.

## Phase 3 verification

Lint, typecheck, standard `npm test` (495 tests in 35 files), production build and all 37 browser tests passed. The synthetic evaluation CLI passed and wrote only `.cache/eval-synthetic.md`. The real `npm run eval` correctly refused incomplete truth labels and left `docs/evaluation.md` as TBD. CSV tests cover multiline/Unicode fields, formula protection, redaction, duplicate/mismatched IDs, known P/R/F1 arithmetic, empty denominators and preservation of real documentation.

The configured local database was readable but had zero items. A separately isolated, keyless collection into `.data/portfolio-eval.db` made no model calls and returned zero evidence: GDELT timed out after two attempts, all ten Bluesky queries had network failures, and HN returned valid empty results. No production database was changed. The existing local audit archive was then verified to contain 173 non-fixture Bluesky items dated 13–15 October 2026. `eval:sample` exported 150 random redacted rows from that archive, with 150 matching prediction records and all four truth columns empty. A scan found no remaining common DID/profile/@handle patterns. Both files are ignored by Git; the sidecar explicitly records the archive scope and older stored assignments. This is not a current-pipeline accuracy result.

The backtest CLI read the configured database and generated an honest empty Markdown/CSV timeline for `namma-metro`. Neither it nor the audit archive had topic snapshots available for a real case study. The template remains unfilled; fixture tests verify exact saved values, gaps and version separation without presenting synthetic numbers as findings.

## Phase 4 final verification

The clean `npm ci`, lint, typecheck, 495 unit tests in 35 files, production build and all 37 Playwright tests passed. The final unit run uses `--maxWorkers=2` after an intermittent native Windows fork exit; it has no skipped tests or unhandled errors. The final screenshot command passed against the final build and the actual PNGs were visually inspected. Their mastheads and topic chart are intact; demo/fictional labels are visible. Local documentation links passed inspection. The previous README's complete source is preserved separately; unrelated pre-existing assets/recruiter notes remain uncommitted.

The full npm audit still reports five existing high development-tool advisories in the Next ESLint configuration chain; the proposed automated fix is a semver-major downgrade to 14.2.35, which was not applied. `npm audit --omit=dev` reported zero production advisories. These are dated dependency checks, not a security certification.

[Final delivery report, all 16 author placeholders, all 131 unverified localities and required manual actions](portfolio-report.md).
