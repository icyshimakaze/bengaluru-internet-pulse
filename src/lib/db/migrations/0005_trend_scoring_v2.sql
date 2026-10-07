ALTER TABLE topics ADD COLUMN lifecycle_v2 TEXT CHECK(lifecycle_v2 IS NULL OR lifecycle_v2 IN ('NEW','EMERGING','RISING','HOT','STABLE','COOLING','inactive'));
UPDATE topics SET lifecycle_v2=CASE lifecycle WHEN 'emerging' THEN 'EMERGING' WHEN 'rising' THEN 'RISING' WHEN 'steady' THEN 'STABLE' WHEN 'cooling' THEN 'COOLING' ELSE 'inactive' END;
CREATE INDEX topics_active_v2_idx ON topics(is_fixture,lifecycle_v2,pulse_score DESC,last_seen_at DESC);

-- This leaf table has no incoming foreign keys. Rebuild it to retain both
-- algorithm versions at the same capture time without altering historical scores.
CREATE TABLE topic_snapshots_v2 (
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  captured_at TEXT NOT NULL,
  count_2h INTEGER NOT NULL CHECK(count_2h>=0),
  previous_count_2h INTEGER NOT NULL CHECK(previous_count_2h>=0),
  count_6h INTEGER NOT NULL CHECK(count_6h>=0),
  count_24h INTEGER NOT NULL CHECK(count_24h>=0),
  source_count INTEGER NOT NULL CHECK(source_count BETWEEN 0 AND 3),
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
  algorithm_version TEXT NOT NULL CHECK(algorithm_version IN ('v1','v2')),
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
  CHECK(algorithm_version<>'v2' OR (lifecycle_v2 IS NOT NULL AND growth_ratio IS NOT NULL AND cluster_consistency IS NOT NULL AND evidence_confidence IS NOT NULL AND diversity_confidence IS NOT NULL AND source_balance IS NOT NULL AND score_cap IS NOT NULL AND change_percent IS NOT NULL AND change_capped IS NOT NULL))
);
INSERT INTO topic_snapshots_v2(topic_id,captured_at,count_2h,previous_count_2h,count_6h,count_24h,source_count,velocity_score,volume_score,diversity_score,recency_score,confidence,pulse_score,lifecycle,count_3h,previous_count_3h,scoring_source_count,algorithm_version,batch_id)
SELECT topic_id,captured_at,count_2h,previous_count_2h,count_6h,count_24h,source_count,velocity_score,volume_score,diversity_score,recency_score,confidence,pulse_score,lifecycle,count_3h,previous_count_3h,scoring_source_count,algorithm_version,batch_id FROM topic_snapshots;
DROP TABLE topic_snapshots;
ALTER TABLE topic_snapshots_v2 RENAME TO topic_snapshots;
CREATE INDEX topic_snapshots_capture_idx ON topic_snapshots(captured_at);
CREATE INDEX topic_snapshots_batch_idx ON topic_snapshots(batch_id) WHERE batch_id IS NOT NULL;
CREATE TRIGGER topic_snapshots_batch_insert_guard BEFORE INSERT ON topic_snapshots
WHEN NEW.batch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pulse_snapshots p JOIN topics t ON t.id=NEW.topic_id WHERE p.id=NEW.batch_id AND p.captured_at=NEW.captured_at AND (p.mode='demo')=t.is_fixture)
BEGIN SELECT RAISE(ABORT, 'Snapshot batch must match topic dataset and capture time'); END;
CREATE TRIGGER topic_snapshots_batch_update_guard BEFORE UPDATE OF batch_id,topic_id,captured_at ON topic_snapshots
WHEN NEW.batch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pulse_snapshots p JOIN topics t ON t.id=NEW.topic_id WHERE p.id=NEW.batch_id AND p.captured_at=NEW.captured_at AND (p.mode='demo')=t.is_fixture)
BEGIN SELECT RAISE(ABORT, 'Snapshot batch must match topic dataset and capture time'); END;
