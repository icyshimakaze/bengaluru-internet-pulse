ALTER TABLE items ADD COLUMN enrichment_provider TEXT CHECK(enrichment_provider IS NULL OR enrichment_provider IN ('mock','openai','xkiro','heuristic'));

CREATE TABLE item_enrichments_v2 (
  item_id TEXT PRIMARY KEY NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('mock','openai','xkiro','heuristic')),
  model TEXT CHECK(model IS NULL OR length(model) BETWEEN 1 AND 200),
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  classification_confidence REAL NOT NULL CHECK(classification_confidence BETWEEN 0 AND 1),
  enriched_at TEXT NOT NULL,
  CHECK((provider IN ('mock','heuristic') AND model IS NULL) OR
    (provider='openai' AND model IS NOT NULL) OR
    (provider='xkiro' AND model IS NOT NULL AND instr(model,'/')>1))
);
INSERT INTO item_enrichments_v2 SELECT * FROM item_enrichments;
DROP TABLE item_enrichments;
ALTER TABLE item_enrichments_v2 RENAME TO item_enrichments;
UPDATE items SET enrichment_provider=(SELECT provider FROM item_enrichments WHERE item_id=items.id);
CREATE INDEX idx_items_enrichment_provider ON items(is_fixture,enrichment_provider,published_at);

CREATE TABLE enrichment_runs (
  id TEXT PRIMARY KEY NOT NULL,
  pulse_snapshot_id TEXT NOT NULL REFERENCES pulse_snapshots(id) ON DELETE CASCADE,
  captured_at TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('demo','live')),
  payload TEXT NOT NULL CHECK(json_valid(payload))
);
CREATE INDEX idx_enrichment_runs_history ON enrichment_runs(mode,captured_at DESC);
CREATE INDEX idx_enrichment_runs_snapshot ON enrichment_runs(pulse_snapshot_id);
