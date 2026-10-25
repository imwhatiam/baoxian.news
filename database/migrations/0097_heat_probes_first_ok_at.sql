-- 统一热度：探查命中要作为事件参与方进入热门榜，观测时刻必须是第一次探查成功的时刻——
-- attempted_at 每次重探都会被覆盖，重算小时快照就会漂移。旧行留空，读取时回落到 attempted_at。
ALTER TABLE heat_probes ADD COLUMN IF NOT EXISTS first_ok_at timestamptz
