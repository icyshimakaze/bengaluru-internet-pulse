-- Add RSS, preserve all prior provenance/history, and retain filtered evidence.
-- Expand provider constraints without disabling foreign keys or dropping provenance.
-- New parents/children are copied first. Only then are the old children/parents
-- replaced. The migration runner wraps all DDL, copies and guards in one write transaction.
CREATE TABLE ingestion_runs_rss (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('gdelt','bluesky','hackernews','currents','rss')),
  started_at TEXT NOT NULL,
  finished_at TEXT CHECK(finished_at IS NULL OR finished_at >= started_at),
  discovered INTEGER NOT NULL DEFAULT 0 CHECK(discovered >= 0),
  inserted INTEGER NOT NULL DEFAULT 0 CHECK(inserted >= 0),
  duplicates INTEGER NOT NULL DEFAULT 0 CHECK(duplicates >= 0),
  errors INTEGER NOT NULL DEFAULT 0 CHECK(errors >= 0),
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','partial','failed','abandoned')),
  error_message TEXT,
  is_fixture INTEGER NOT NULL DEFAULT 0 CHECK(is_fixture IN (0,1)),
  CHECK((status = 'running' AND finished_at IS NULL) OR (status <> 'running' AND finished_at IS NOT NULL))
);
CREATE TABLE items_rss (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('gdelt','bluesky','hackernews','currents','rss')),
  source_id TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  original_url TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 300),
  excerpt TEXT NOT NULL CHECK(length(excerpt) BETWEEN 3 AND 4000),
  domain TEXT NOT NULL,
  published_at TEXT NOT NULL,
  collected_at TEXT NOT NULL CHECK(collected_at >= published_at),
  content_fingerprint TEXT NOT NULL,
  topic_id TEXT REFERENCES topics(id) ON DELETE RESTRICT,
  category TEXT CHECK(category IS NULL OR category IN ('Mobility','Weather','Technology','City life','Civic')),
  neighborhood TEXT,
  local_relevance REAL NOT NULL DEFAULT 0 CHECK(local_relevance BETWEEN 0 AND 1),
  enrichment_status TEXT NOT NULL DEFAULT 'pending' CHECK(enrichment_status IN ('pending','completed','irrelevant','failed')),
  time_kind TEXT NOT NULL DEFAULT 'published' CHECK(time_kind IN ('published','discovered')),
  ingestion_run_id TEXT REFERENCES ingestion_runs_rss(id) ON DELETE SET NULL,
  is_fixture INTEGER NOT NULL DEFAULT 0 CHECK(is_fixture IN (0,1)),
  enrichment_attempts INTEGER NOT NULL DEFAULT 0 CHECK(enrichment_attempts BETWEEN 0 AND 3),
  enrichment_attempted_at TEXT,
  enrichment_provider TEXT CHECK(enrichment_provider IS NULL OR enrichment_provider IN ('mock','openai','xkiro','heuristic')),
  UNIQUE(is_fixture, source, source_id),
  UNIQUE(is_fixture, canonical_url),
  UNIQUE(is_fixture, content_fingerprint),
  CHECK(enrichment_status <> 'completed' OR (topic_id IS NOT NULL AND category IS NOT NULL))
);
CREATE TABLE item_enrichments_rss (
  item_id TEXT PRIMARY KEY NOT NULL REFERENCES items_rss(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('mock','openai','xkiro','heuristic')),
  model TEXT CHECK(model IS NULL OR length(model) BETWEEN 1 AND 200),
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  classification_confidence REAL NOT NULL CHECK(classification_confidence BETWEEN 0 AND 1),
  enriched_at TEXT NOT NULL,
  CHECK((provider IN ('mock','heuristic') AND model IS NULL) OR
    (provider='openai' AND model IS NOT NULL) OR
    (provider='xkiro' AND model IS NOT NULL AND instr(model,'/')>1))
);
INSERT INTO ingestion_runs_rss SELECT * FROM ingestion_runs;
INSERT INTO items_rss SELECT * FROM items;
INSERT INTO item_enrichments_rss SELECT * FROM item_enrichments;
DROP TABLE item_enrichments;
DROP TABLE items;
DROP TABLE ingestion_runs;
ALTER TABLE ingestion_runs_rss RENAME TO ingestion_runs;
ALTER TABLE items_rss RENAME TO items;
ALTER TABLE item_enrichments_rss RENAME TO item_enrichments;
CREATE INDEX items_published_idx ON items(is_fixture, published_at DESC, id);
CREATE INDEX items_topic_time_idx ON items(topic_id, published_at DESC);
CREATE INDEX items_source_time_idx ON items(is_fixture, source, published_at DESC);
CREATE INDEX items_neighborhood_time_idx ON items(is_fixture, neighborhood, published_at DESC) WHERE neighborhood IS NOT NULL;
CREATE INDEX items_category_time_idx ON items(is_fixture, category, published_at DESC);
CREATE INDEX items_enrichment_time_idx ON items(is_fixture, enrichment_status, collected_at);
CREATE INDEX items_run_idx ON items(ingestion_run_id) WHERE ingestion_run_id IS NOT NULL;
CREATE INDEX items_domain_time_idx ON items(is_fixture, domain, published_at DESC);
CREATE INDEX ingestion_runs_source_time_idx ON ingestion_runs(is_fixture, source, started_at DESC);
CREATE INDEX ingestion_runs_finished_idx ON ingestion_runs(finished_at) WHERE finished_at IS NOT NULL;
CREATE INDEX ingestion_runs_running_idx ON ingestion_runs(started_at) WHERE status = 'running';
CREATE INDEX idx_items_enrichment_queue ON items(is_fixture,enrichment_status,enrichment_attempts,enrichment_attempted_at,published_at);
CREATE INDEX idx_items_enrichment_provider ON items(is_fixture,enrichment_provider,published_at);
CREATE TRIGGER items_topic_insert_guard BEFORE INSERT ON items
WHEN NEW.topic_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM topics WHERE id=NEW.topic_id AND is_fixture=NEW.is_fixture)
BEGIN SELECT RAISE(ABORT, 'Item topic must exist in the same dataset'); END;
CREATE TRIGGER items_topic_update_guard BEFORE UPDATE OF topic_id,is_fixture ON items
WHEN NEW.topic_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM topics WHERE id=NEW.topic_id AND is_fixture=NEW.is_fixture)
BEGIN SELECT RAISE(ABORT, 'Item topic must exist in the same dataset'); END;
CREATE TRIGGER items_run_insert_guard BEFORE INSERT ON items
WHEN NEW.ingestion_run_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ingestion_runs WHERE id=NEW.ingestion_run_id AND source=NEW.source AND is_fixture=NEW.is_fixture AND status='running')
BEGIN SELECT RAISE(ABORT, 'Item run must be open and match source and dataset'); END;

-- v3 keeps the three evidence channels while allowing four provider labels.
-- Historical v1/v2 snapshots retain their original versions and values.
CREATE TABLE topic_snapshots_rss (
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  captured_at TEXT NOT NULL,
  count_2h INTEGER NOT NULL CHECK(count_2h>=0),
  previous_count_2h INTEGER NOT NULL CHECK(previous_count_2h>=0),
  count_6h INTEGER NOT NULL CHECK(count_6h>=0),
  count_24h INTEGER NOT NULL CHECK(count_24h>=0),
  source_count INTEGER NOT NULL CHECK(source_count BETWEEN 0 AND 5),
  velocity_score REAL NOT NULL CHECK(velocity_score BETWEEN 0 AND 1),
  volume_score REAL NOT NULL CHECK(volume_score BETWEEN 0 AND 1),
  diversity_score REAL NOT NULL CHECK(diversity_score BETWEEN 0 AND 1),
  recency_score REAL NOT NULL CHECK(recency_score BETWEEN 0 AND 1),
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  pulse_score INTEGER NOT NULL CHECK(pulse_score BETWEEN 0 AND 100),
  lifecycle TEXT NOT NULL CHECK(lifecycle IN ('emerging','rising','steady','cooling','inactive')),
  count_3h INTEGER NOT NULL CHECK(count_3h>=0),
  previous_count_3h INTEGER NOT NULL CHECK(previous_count_3h>=0),
  scoring_source_count INTEGER NOT NULL CHECK(scoring_source_count BETWEEN 0 AND 3),
  algorithm_version TEXT NOT NULL CHECK(algorithm_version IN ('v1','v2','v3')),
  batch_id TEXT REFERENCES pulse_snapshots(id) ON DELETE SET NULL,
  lifecycle_v2 TEXT CHECK(lifecycle_v2 IS NULL OR lifecycle_v2 IN ('NEW','EMERGING','RISING','HOT','STABLE','COOLING')),
  growth_ratio REAL CHECK(growth_ratio IS NULL OR growth_ratio>0),
  latest_signal_age_hours REAL CHECK(latest_signal_age_hours IS NULL OR latest_signal_age_hours>=0),
  first_seen_at TEXT,
  cluster_consistency REAL CHECK(cluster_consistency IS NULL OR cluster_consistency BETWEEN 0 AND 1),
  evidence_confidence REAL CHECK(evidence_confidence IS NULL OR evidence_confidence BETWEEN 0 AND 1),
  diversity_confidence REAL CHECK(diversity_confidence IS NULL OR diversity_confidence BETWEEN 0 AND 1),
  source_balance REAL CHECK(source_balance IS NULL OR source_balance BETWEEN 0 AND 1),
  score_cap INTEGER CHECK(score_cap IS NULL OR score_cap BETWEEN 0 AND 100),
  change_percent INTEGER CHECK(change_percent IS NULL OR change_percent BETWEEN -100 AND 300),
  change_capped INTEGER CHECK(change_capped IS NULL OR change_capped IN (0,1)),
  PRIMARY KEY(topic_id,captured_at,algorithm_version),
  CHECK(count_2h<=count_6h AND count_6h<=count_24h),
  CHECK(algorithm_version='v1' OR (lifecycle_v2 IS NOT NULL AND growth_ratio IS NOT NULL AND cluster_consistency IS NOT NULL AND evidence_confidence IS NOT NULL AND diversity_confidence IS NOT NULL AND source_balance IS NOT NULL AND score_cap IS NOT NULL AND change_percent IS NOT NULL AND change_capped IS NOT NULL))
);
INSERT INTO topic_snapshots_rss SELECT * FROM topic_snapshots;
DROP TABLE topic_snapshots;
ALTER TABLE topic_snapshots_rss RENAME TO topic_snapshots;
CREATE INDEX topic_snapshots_capture_idx ON topic_snapshots(captured_at);
CREATE INDEX topic_snapshots_batch_idx ON topic_snapshots(batch_id) WHERE batch_id IS NOT NULL;
CREATE TRIGGER topic_snapshots_batch_insert_guard BEFORE INSERT ON topic_snapshots
WHEN NEW.batch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pulse_snapshots p JOIN topics t ON t.id=NEW.topic_id WHERE p.id=NEW.batch_id AND p.captured_at=NEW.captured_at AND (p.mode='demo')=t.is_fixture)
BEGIN SELECT RAISE(ABORT, 'Snapshot batch must match topic dataset and capture time'); END;
CREATE TRIGGER topic_snapshots_batch_update_guard BEFORE UPDATE OF batch_id,topic_id,captured_at ON topic_snapshots
WHEN NEW.batch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pulse_snapshots p JOIN topics t ON t.id=NEW.topic_id WHERE p.id=NEW.batch_id AND p.captured_at=NEW.captured_at AND (p.mode='demo')=t.is_fixture)
BEGIN SELECT RAISE(ABORT, 'Snapshot batch must match topic dataset and capture time'); END;

CREATE TABLE source_collections_rss (
  source TEXT NOT NULL CHECK(source IN ('gdelt','bluesky','hackernews','currents','rss')),
  is_fixture INTEGER NOT NULL CHECK(is_fixture IN (0,1)),
  last_attempt_at TEXT NOT NULL,
  last_success_at TEXT,
  last_item_at TEXT,
  last_error_at TEXT,
  last_error_type TEXT,
  items_last_run INTEGER NOT NULL CHECK(items_last_run>=0),
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK(consecutive_failures>=0),
  PRIMARY KEY(source,is_fixture)
);
INSERT INTO source_collections_rss SELECT * FROM source_collections;
DROP TABLE source_collections;
ALTER TABLE source_collections_rss RENAME TO source_collections;

ALTER TABLE items ADD COLUMN filter_reason TEXT CHECK(filter_reason IS NULL OR filter_reason IN ('job_posting','weather_bot','hashtag_spam','near_empty'));
ALTER TABLE items ADD COLUMN publisher_name TEXT;
CREATE INDEX items_filter_idx ON items(is_fixture,filter_reason,published_at);
CREATE TABLE topic_enrichments_jobs (topic_id TEXT PRIMARY KEY NOT NULL REFERENCES topics(id) ON DELETE CASCADE, semantic_category TEXT NOT NULL CHECK(semantic_category IN ('civic','traffic','technology','business','culture','food','events','weather','sports','other','jobs')));
INSERT INTO topic_enrichments_jobs SELECT * FROM topic_enrichments;
DROP TABLE topic_enrichments;
ALTER TABLE topic_enrichments_jobs RENAME TO topic_enrichments;
