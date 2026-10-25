-- 按热度回看哪些新闻被别家报得最多（后台与排查用）。
CREATE INDEX CONCURRENTLY IF NOT EXISTS heat_probes_hits_idx ON heat_probes (hits DESC)
