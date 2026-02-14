-- 期日（Due Date）: nodes に日付のみのカラムを追加
-- 詳細画面でカレンダー入力し、DATE 型で保存する

ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS due_date DATE NULL;

COMMENT ON COLUMN nodes.due_date IS '期日（日付のみ、未設定は NULL）';
