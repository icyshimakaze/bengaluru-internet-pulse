-- Collection survives enrichment/publication failure. A successful empty poll
-- updates last_success_at; repeated polling never changes last_item_at.
CREATE TABLE source_collections (
  source TEXT NOT NULL CHECK(source IN ('gdelt','bluesky','hackernews')),
  is_fixture INTEGER NOT NULL CHECK(is_fixture IN (0,1)),
  last_attempt_at TEXT NOT NULL,
  last_success_at TEXT,
  last_item_at TEXT,
  last_error_at TEXT,
  last_error_type TEXT,
  items_last_run INTEGER NOT NULL CHECK(items_last_run>=0),
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  PRIMARY KEY(source,is_fixture)
);

-- Preserve known pre-upgrade success when the first new poll fails. Historical
-- runs are the old collection proxy; do not invent a more precise timestamp.
INSERT INTO source_collections
  (source,is_fixture,last_attempt_at,last_success_at,last_item_at,last_error_at,last_error_type,items_last_run,payload)
SELECT r.source,r.is_fixture,r.started_at,
  (SELECT max(previous.finished_at) FROM ingestion_runs previous
    WHERE previous.source=r.source AND previous.is_fixture=r.is_fixture
      AND (previous.status='completed' OR (previous.status='partial' AND previous.discovered>previous.errors))),
  (SELECT max(i.published_at) FROM items i WHERE i.source=r.source AND i.is_fixture=r.is_fixture AND i.published_at<=r.finished_at),
  CASE WHEN r.status IN ('failed','partial','abandoned') THEN r.finished_at ELSE NULL END,
  CASE WHEN r.status='partial' THEN 'PARTIAL_QUERY_FAILURE'
    WHEN r.status IN ('failed','abandoned') THEN 'SOURCE_UNAVAILABLE' ELSE NULL END,
  r.inserted+r.duplicates,
  json_object('source',r.source,'status',CASE WHEN r.status='completed' THEN CASE WHEN r.is_fixture=1 THEN 'demo' ELSE 'ok' END
    WHEN r.status='partial' THEN 'partial' ELSE 'error' END,
    'fetched',r.discovered,'accepted',r.inserted+r.duplicates,'rejected',r.errors,
    'durationMs',max(0,CAST((julianday(r.finished_at)-julianday(r.started_at))*86400000 AS INTEGER)),
    'checkedAt',r.finished_at)
FROM ingestion_runs r WHERE r.finished_at IS NOT NULL AND r.rowid=(
  SELECT latest.rowid FROM ingestion_runs latest WHERE latest.source=r.source AND latest.is_fixture=r.is_fixture
    AND latest.finished_at IS NOT NULL ORDER BY latest.started_at DESC,latest.rowid DESC LIMIT 1
);
