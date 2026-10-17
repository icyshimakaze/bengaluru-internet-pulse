ALTER TABLE source_collections ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK(consecutive_failures >= 0);
