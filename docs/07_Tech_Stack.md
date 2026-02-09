# 07_Tech_Stack.md
## context-os 技術スタック（固定）

---

## 0. 目的
本ドキュメントは、context-osをバイブコーディングで実装する際の
**技術選定のブレを防ぐための固定スタック**を定義する。

迷ったらこの文書に従う。

---

## 1. 採用スタック（MVP）

### 1) Frontend / Hosting
- Vercel（Next.js）

### 2) Backend / DB
- Supabase（PostgreSQL / Auth / Storageは必要最小）

### 3) Agent Runtime（最小）
- MVPは「サーバー側のAPI + Prompt Pack + MCP」で成立させる
- ループ/状態遷移はまず **アプリ側（API）で確定**する

---

## 2. エージェント基盤の方針（段階導入）

### Phase 1（MVP）
- LangChain / LangGraph は必須にしない
- 理由：Node CRUD / status / temperature / resume が成立すれば価値が出るため

### Phase 2（循環フローが増えたら）
- LangGraph を導入検討
  - 長時間・状態あり・分岐/再試行/ループが必要になった段階で採用する
  - 目的：エージェントの「流れ」をグラフで固定する

### Phase 3（品質と運用が課題になったら）
- LangSmith を導入検討
  - 目的：トレース/評価/デバッグ/監視を仕組み化する

---

## 3. LLM / Provider（固定方針）
- Providerは差し替え可能にする（Vendor Lock-inを避ける）
- ただしMVPは「1社1モデル」で固定して進める（ブレ防止）

---

## 4. 非採用（MVPではやらない）
- マルチエージェント編成（複数人格・並列エージェント）
- 自動実行（勝手に送信、勝手に削除、勝手に完了）
- リッチUI（カンバン/ガント等）

※理由は 03_Non_Goals.md に従う

---

## 5. 判断基準
新技術を入れたくなったら必ず問う：

**「それは再開に必要か？」**

- Yes → 検討してよい
- No / 迷う → 今は入れない


