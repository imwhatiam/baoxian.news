-- 列表排序用：同一天之内被别家报道得多的排在前面。0 表示还没探查过。
ALTER TABLE publications ADD COLUMN heat integer NOT NULL DEFAULT 0
