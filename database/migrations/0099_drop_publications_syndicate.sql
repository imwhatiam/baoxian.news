-- Derived from sources.syndicate_fulltext for the RSS full-text feed, which is deleted with the other
-- RSS exits. Nothing reads it now.
ALTER TABLE publications DROP COLUMN IF EXISTS syndicate;
