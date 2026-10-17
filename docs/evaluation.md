# Evaluation

<!-- RESULTS_START -->
**Results: TBD (awaiting hand-labeled sample).**
<!-- RESULTS_END -->

## Reproduce

1. Configure an existing collected database in ignored `.env.local`. Run `npm run eval:sample` (default 150), or `npm run eval:sample -- --n 200`. Sampling is a read-only, random query over retained non-fixture items; it does not migrate, ingest or call a model. The actual sample can be smaller than requested.
2. Hand-label the four EMPTY columns in ignored `eval/labels.csv`. `true_event_group`: a consistent real-event group ID; use unique IDs for unrelated items. `true_neighborhood`: an exact gazetteer name or `none`. `true_category`: civic, traffic, technology, business, culture, food, events, weather, sports, other, jobs. `is_spam_or_bot`: literal `true` or `false`. Review the supplied text; do not infer authors, factual truth or locations from URLs. Ambiguous cases need a recorded author labeling decision, not invented certainty.
3. Run `npm run eval`. Incomplete/empty labels, duplicates, mismatched text/source/language or missing predictions fail without replacing results. The script writes measured tables here and updates the README's marked results block. Keep the prediction sidecar with the sample. A filled labels file is never overwritten by the sampler; archive it and its predictions together before a new sample.

Exports strip handles, DIDs, email addresses and common profile/AT links; internal item/topic IDs become SHA-256 pseudonyms. They are review data, not a claim of complete anonymization of free text. No author/profile fields or original source IDs are exported. CSV text is protected against leading spreadsheet formulas. Label columns are never generated from predictions. Real samples and sidecars are ignored by Git; review residual personal content before sharing.

## Measures and limits

- Spam/bot filter precision and recall compare retained content-rule flags with human `is_spam_or_bot`. Recruitment exclusion is a product policy; a legitimate job posting is not necessarily spam. Such cases can lower measured spam precision and must be labeled honestly.
- Neighborhood precision counts correct named predictions over all named predictions; recall divides by all gold named locations. A wrong named place is both a false positive and false negative. True `none` items do not inflate recall.
- Category accuracy includes every labeled row. Per-class precision/recall/F1 includes support; unclassified predictions count as incorrect rather than silently becoming Other.
- Pairwise clustering precision/recall/F1 compares same-event item pairs on gold non-spam items. Unassigned items are distinct singleton groups. This sample-based measure is sensitive to event frequency and may include few positive pairs. It does not measure unique people or truth.

Zero denominators display N/A. Reports include actual sample size, evaluation date in Asia/Kolkata, evaluated commit, sample/export commit and whether the sampling tree had changes. Stored category/place/group assignments are sampled as observed, while legacy unmarked filters use current deterministic rules; no model labels become ground truth. Version 1 filter rules are recorded. This is an exploratory retained-data sample with one labeler, not a calibrated benchmark or representative census. Language is only a local script hint and is not evaluated as a human-annotated metric. Publication/collection times and retention/scheduling bias affect the sample.

The sample sidecar also records actual observation date bounds and an optional `--note`. The sample prepared during portfolio work uses 150 of 173 non-fixture Bluesky rows in the existing local audit archive (13–15 October 2026). The default configured database contained zero items; a separate fresh keyless collection returned no evidence from this workstation (GDELT timeout, Bluesky network errors, HN valid empty results). The archive is genuine stored collection, but its category/place/group assignments predate these portfolio changes. Hand-label it for inspection; regenerate predictions from a current collected database before claiming accuracy for the new pipeline. No real labels or results have been supplied.

## Synthetic software check

`eval/synthetic-labels.csv` and `eval/synthetic-predictions.json` are six deliberately synthetic rows used by unit tests/CI to verify arithmetic and CLI safeguards. Their numbers are never results for this project. To exercise the CLI, run `npm run eval -- --labels eval/synthetic-labels.csv --predictions eval/synthetic-predictions.json --synthetic`; output goes only to ignored `.cache/eval-synthetic.md`, never this page or the README.

## Stored timelines

`npm run backtest -- --topic <slug>` reads actual non-fixture `topic_snapshots` and writes Markdown/CSV under `.cache/backtests/`. It never recomputes scores, fills gaps, merges algorithm versions or starts ingestion. Missing database/history is reported honestly. Use [the case-study template](case-study-template.md) for interpretation; an unfilled template is not a completed case study.
