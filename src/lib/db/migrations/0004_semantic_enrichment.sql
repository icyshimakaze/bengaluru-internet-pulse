ALTER TABLE items ADD COLUMN enrichment_attempts INTEGER NOT NULL DEFAULT 0 CHECK(enrichment_attempts BETWEEN 0 AND 3);
ALTER TABLE items ADD COLUMN enrichment_attempted_at TEXT;

CREATE TABLE item_enrichments (
  item_id TEXT PRIMARY KEY NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('mock','openai')),
  model TEXT CHECK(model IS NULL OR model='gpt-6-luna'),
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  classification_confidence REAL NOT NULL CHECK(classification_confidence BETWEEN 0 AND 1),
  enriched_at TEXT NOT NULL,
  CHECK((provider='mock' AND model IS NULL) OR (provider='openai' AND model='gpt-6-luna'))
);

CREATE TABLE topic_enrichments (
  topic_id TEXT PRIMARY KEY NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  semantic_category TEXT NOT NULL CHECK(semantic_category IN ('civic','traffic','technology','business','culture','food','events','weather','sports','other'))
);

CREATE INDEX idx_items_enrichment_queue ON items(is_fixture,enrichment_status,enrichment_attempts,enrichment_attempted_at,published_at);
CREATE INDEX idx_topics_enrichment_catalog ON topics(is_fixture,last_seen_at,slug);
