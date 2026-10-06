CREATE TABLE topics (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  canonical_label TEXT NOT NULL CHECK(length(canonical_label) BETWEEN 3 AND 100),
  category TEXT NOT NULL CHECK(category IN ('Mobility','Weather','Technology','City life','Civic')),
  neighborhood TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL CHECK(last_seen_at >= first_seen_at),
  lifecycle TEXT NOT NULL DEFAULT 'inactive' CHECK(lifecycle IN ('emerging','rising','steady','cooling','inactive')),
  pulse_score INTEGER NOT NULL DEFAULT 0 CHECK(pulse_score BETWEEN 0 AND 100),
  confidence REAL NOT NULL DEFAULT 0 CHECK(confidence BETWEEN 0 AND 1),
  summary TEXT NOT NULL CHECK(length(summary) BETWEEN 1 AND 280),
  enrichment_method TEXT NOT NULL DEFAULT 'rules' CHECK(enrichment_method IN ('rules','ai')),
  is_fixture INTEGER NOT NULL DEFAULT 0 CHECK(is_fixture IN (0,1)),
  UNIQUE(is_fixture, slug)
);

CREATE TABLE ingestion_runs (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('gdelt','bluesky','hackernews')),
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

CREATE TABLE items (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('gdelt','bluesky','hackernews')),
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
  ingestion_run_id TEXT REFERENCES ingestion_runs(id) ON DELETE SET NULL,
  is_fixture INTEGER NOT NULL DEFAULT 0 CHECK(is_fixture IN (0,1)),
  UNIQUE(is_fixture, source, source_id),
  UNIQUE(is_fixture, canonical_url),
  UNIQUE(is_fixture, content_fingerprint),
  CHECK(enrichment_status <> 'completed' OR (topic_id IS NOT NULL AND category IS NOT NULL))
);

CREATE TABLE pulse_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  captured_at TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('live','demo')),
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  UNIQUE(mode, captured_at)
);

CREATE TABLE topic_snapshots (
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  captured_at TEXT NOT NULL,
  count_2h INTEGER NOT NULL CHECK(count_2h >= 0),
  previous_count_2h INTEGER NOT NULL CHECK(previous_count_2h >= 0),
  count_6h INTEGER NOT NULL CHECK(count_6h >= 0),
  count_24h INTEGER NOT NULL CHECK(count_24h >= 0),
  source_count INTEGER NOT NULL CHECK(source_count BETWEEN 0 AND 3),
  velocity_score REAL NOT NULL CHECK(velocity_score BETWEEN 0 AND 1),
  volume_score REAL NOT NULL CHECK(volume_score BETWEEN 0 AND 1),
  diversity_score REAL NOT NULL CHECK(diversity_score BETWEEN 0 AND 1),
  recency_score REAL NOT NULL CHECK(recency_score BETWEEN 0 AND 1),
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  pulse_score INTEGER NOT NULL CHECK(pulse_score BETWEEN 0 AND 100),
  lifecycle TEXT NOT NULL CHECK(lifecycle IN ('emerging','rising','steady','cooling','inactive')),
  count_3h INTEGER NOT NULL CHECK(count_3h >= 0),
  previous_count_3h INTEGER NOT NULL CHECK(previous_count_3h >= 0),
  scoring_source_count INTEGER NOT NULL CHECK(scoring_source_count BETWEEN 0 AND 3),
  algorithm_version TEXT NOT NULL DEFAULT 'v1',
  batch_id TEXT REFERENCES pulse_snapshots(id) ON DELETE SET NULL,
  PRIMARY KEY(topic_id, captured_at),
  CHECK(count_2h <= count_6h AND count_6h <= count_24h)
);

CREATE TABLE IF NOT EXISTS leases (
  name TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
