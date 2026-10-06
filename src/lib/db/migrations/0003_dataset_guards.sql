CREATE TRIGGER items_topic_insert_guard BEFORE INSERT ON items
WHEN NEW.topic_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM topics WHERE id=NEW.topic_id AND is_fixture=NEW.is_fixture)
BEGIN SELECT RAISE(ABORT, 'Item topic must exist in the same dataset'); END;
CREATE TRIGGER items_topic_update_guard BEFORE UPDATE OF topic_id,is_fixture ON items
WHEN NEW.topic_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM topics WHERE id=NEW.topic_id AND is_fixture=NEW.is_fixture)
BEGIN SELECT RAISE(ABORT, 'Item topic must exist in the same dataset'); END;
CREATE TRIGGER items_run_insert_guard BEFORE INSERT ON items
WHEN NEW.ingestion_run_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ingestion_runs WHERE id=NEW.ingestion_run_id AND source=NEW.source AND is_fixture=NEW.is_fixture AND status='running')
BEGIN SELECT RAISE(ABORT, 'Item run must be open and match source and dataset'); END;
CREATE TRIGGER topic_snapshots_batch_insert_guard BEFORE INSERT ON topic_snapshots
WHEN NEW.batch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pulse_snapshots p JOIN topics t ON t.id=NEW.topic_id WHERE p.id=NEW.batch_id AND p.captured_at=NEW.captured_at AND (p.mode='demo')=t.is_fixture)
BEGIN SELECT RAISE(ABORT, 'Snapshot batch must match topic dataset and capture time'); END;
CREATE TRIGGER topic_snapshots_batch_update_guard BEFORE UPDATE OF batch_id,topic_id,captured_at ON topic_snapshots
WHEN NEW.batch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pulse_snapshots p JOIN topics t ON t.id=NEW.topic_id WHERE p.id=NEW.batch_id AND p.captured_at=NEW.captured_at AND (p.mode='demo')=t.is_fixture)
BEGIN SELECT RAISE(ABORT, 'Snapshot batch must match topic dataset and capture time'); END;
