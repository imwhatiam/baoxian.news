-- 二次热度探查：一条新闻落地后，用它的标题在 Bing 上再搜一次，看「官方来源与媒体报道」
-- 里有多少家也在报同一件事。命中家数记在 publications.heat，供列表排序使用。
CREATE TABLE heat_probes (
  article_id   text PRIMARY KEY REFERENCES articles (id) ON DELETE CASCADE,
  query        text NOT NULL,
  status       text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'failed')),
  -- 命中白名单的机构数（同一机构报多条只算一家，本站已采的源不计）。
  hits         integer NOT NULL DEFAULT 0,
  -- 搜索结果总条数，用来区分「全网没人报」和「有结果但都不在白名单里」。
  total        integer NOT NULL DEFAULT 0,
  matches      jsonb NOT NULL DEFAULT '[]'::jsonb,
  error        text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz NOT NULL DEFAULT now()
)
