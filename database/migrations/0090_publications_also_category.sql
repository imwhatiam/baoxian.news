-- A 大童 item also belongs to one topical category (industry or product), so the feed filter
-- can show it in both places. Every other item leaves it null.
ALTER TABLE publications ADD COLUMN IF NOT EXISTS also_category text;
