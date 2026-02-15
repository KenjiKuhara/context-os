-- ノード詳細：外部リンク/メモ（1ノード複数）。並び順は created_at のみ。

CREATE TABLE IF NOT EXISTS public.node_links (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id    UUID         NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  label      TEXT         NOT NULL,
  url        TEXT         NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_node_links_node_id ON public.node_links (node_id);

COMMENT ON TABLE public.node_links IS 'ノードに紐づくリンク/メモ（表示名 + URL 任意）。RLS で nodes の所有者のみアクセス可。';
COMMENT ON COLUMN public.node_links.label IS '表示名';
COMMENT ON COLUMN public.node_links.url IS 'リンク先。NULL の場合はメモ扱い。http(s) のみ許可。';
