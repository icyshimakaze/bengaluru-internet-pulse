# Portfolio readiness verification

Baseline on 18 October 2026 at commit `3f8aeff`: `npm ci`, lint, typecheck, 449 unit tests, production build and 36 Playwright tests passed. Initial install hit libSQL locked by two repository preview servers; stopping those servers resolved it. Playwright required Windows process permission. npm reported five high-severity dependency advisories; no automatic major upgrade was applied.

Existing README edits and untracked demo assets/recruiter review were preserved. The original README is copied into ignored `.cache/portfolio/README.before.md` for the later documentation move.

## Phase 1 contracts

One shared masthead contains Pulse, Explore, Map and Methodology. GitHub and the small status indicator live in the footer. `/status` reads validated health/dashboard projections and separates collection, enrichment and publication. It never collects. `/api/health` retains its existing aggregate and HTTP semantics for compatibility.

The presentation status ignores heuristic selection/fallback. Migration 0009 adds consecutive failed/partial collection counts, reset by a fully successful poll. Two consecutive problem polls qualify as repeated source failure; stale data and delayed reads remain visible. Old databases default this counter to zero until migrated; source rows still disclose each actual error. Existing per-source health/API labels remain compatible. Historic failure counts are not invented.

The homepage lead requires two distinct latest-2H signals, a positive deterministic score and confidence >=35%. This is a presentation gate, not a scoring change. NOW chooses the shortest eligible window and otherwise uses 24H. Explicit activity windows remain fixed. Compatibility topic lists can still contain wider-window diagnostic zero scores; the UI never promotes those to the lead. Below-threshold conversations remain in Recently observed; when no lead qualifies its heading is “Top stories in the last 24 hours”, ordered by timestamp then source count, explicitly labeled observations.

Language badges use local Unicode script counts (English/Latin, Kannada, Tamil, Hindi/Devanagari, other). These are estimates: Devanagari is not uniquely Hindi, Latin text is not uniquely English, and mixed/transliterated text is limited. No network language detector is used.

Privacy/Terms describe repository behavior and carry draft source comments. `CONTACT_EMAIL` is optional, server-validated and intentionally public only as the contact link.

Phase 1 final checks: lint, typecheck, 461 unit tests, production build and all 36 Playwright tests passed. Browser checks include Status/Privacy/Terms WCAG A/AA scans, zero-score lead exclusion, footer navigation, and 320?1920px layouts. Full logs are retained locally under `.cache/portfolio/phase1-*.log`.
