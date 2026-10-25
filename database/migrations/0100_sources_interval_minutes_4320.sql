-- A WeChat account can be read every few days, not just daily: the paid list call is the site's
-- largest recurring cost, and one page of it still covers a quiet account's whole window.
ALTER TABLE sources ADD CONSTRAINT sources_interval_minutes_check_4320 CHECK (interval_minutes >= 1 AND interval_minutes <= 4320) NOT VALID;
