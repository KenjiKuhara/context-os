-- parent_id / sibling_order のみの変更（D&D整理）ではupdated_atを更新しない。
-- コンテンツ列（title, context, status, temperature, tags, due_date）が変化した場合のみ now() にセット。
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    (OLD.title IS NOT DISTINCT FROM NEW.title) AND
    (OLD.context IS NOT DISTINCT FROM NEW.context) AND
    (OLD.status IS NOT DISTINCT FROM NEW.status) AND
    (OLD.temperature IS NOT DISTINCT FROM NEW.temperature) AND
    (OLD.tags IS NOT DISTINCT FROM NEW.tags) AND
    (OLD.due_date IS NOT DISTINCT FROM NEW.due_date)
  ) THEN
    -- 構造変更のみ（D&D移動など）: updated_at を保持
    NEW.updated_at = OLD.updated_at;
  ELSE
    -- コンテンツ変更あり: updated_at を現在時刻に更新
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
