-- The RSS exits are gone, so the full-text redistribution flag no longer has a reader: the site's own
-- pages decide full text by sources.site_fulltext. Dropping it removes a switch that reached nothing.
ALTER TABLE sources DROP COLUMN IF EXISTS syndicate_fulltext;
