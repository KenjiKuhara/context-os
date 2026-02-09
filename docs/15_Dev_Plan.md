# 15_Dev_Plan.md
## 7日間で「最終形のミニチュア」を作る開発計画（context-os）

---

## 0. この文書の目的

本ドキュメントは、context-osを **バイブコーディングで最短実装**するための  
**最初の7日間の開発計画**（Dev Plan）である。

目的は以下の通り。

- いきなり「最終形っぽい体験」を作る（＝ミニチュア最終形）
- 迷いどころ（仕様・設計・境界）を先に固定する
- 7日後に「使える／使えない」を判断できる状態にする

前提ドキュメント：

- 00_Vision_NorthStar.md
- 01_PRD.md
- 04_Domain_Model.md
- 05_State_Machine.md
- 06_Temperature_Spec.md
- 09_API_Contract.md
- 10_Architecture.md
- 14_Prompt_Pack.md

---

## 1. 7日後のゴール（完成の定義）

### 1.1 7日後に必ず成立させる体験

ユーザーが、以下を **ChatGPT入口だけで**できること。

1. 雑な入力を投げる → Nodeとして保存される（CAPTURED）
2. Nodeを一覧で見られる（Active Dashboard）
3. 「今なにやる？」で、次の一手が1つ返る
4. Nodeの status を推定・適用できる（State Machine適用）
5. temperature が更新され、冷却対象を抽出できる
6. 大きいNodeを3〜7個に分解できる（子Node作成）
7. status履歴が残り、いつ変わったか追える

---

### 1.2 7日後に「やらない」こと（守る）

- 自動実行（メール送信、勝手に完了、勝手に削除）
- 権限管理（チーム・組織）
- 高度なUI（カンバン、ガント、複雑なフィルタ）
- 連携乱立（ChatWorkやカレンダー連携は後半）

---

## 2. 開発の順序（おすすめの理由）

context-osはUIで勝つのではなく、  
**状態と温度で勝つOS**である。

したがって、開発は以下の順序で進める。

1. DBスキーマ（外部記憶の確立）
2. API（責務の固定）
3. 状態遷移（心臓①）
4. 温度算出（心臓②）
5. 再開体験（North Star）
6. 分解（思考の粒度調整）
7. MCP/ChatGPT運用（司令塔）

---

## 3. リポジトリ構成（推奨）

```

/docs
00_Vision_NorthStar.md
01_PRD.md
04_Domain_Model.md
05_State_Machine.md
06_Temperature_Spec.md
09_API_Contract.md
10_Architecture.md
14_Prompt_Pack.md
15_Dev_Plan.md

/app   (Vercel / Next.js 推奨)
/api
/lib
/db

/mcp   (MCP server, tools)

```

※最初の7日間は UI を最小にし、API中心で作る。

---

## 4. Day別計画（7日）

### Day1：DBスキーマ確定 + Supabase初期化

**目的**
- Nodeが永続化される「外部記憶」を先に作る

**作業**
- Supabaseプロジェクト作成
- テーブル作成（最低限）
  - nodes
  - node_status_history（必須）
  - node_events（温度算出の観測ログ）
  - relations（参照関係：今回は作るだけで運用は後回し）
- RLS方針は最小（個人利用前提、後で強化）
- seedデータ投入（サンプルNode 10件）

**完了条件**
- SQLで nodes のCRUDができる
- status履歴が insert される

---

### Day2：APIの骨格（09_API_Contract）を実装

**目的**
- ChatGPT/MCPが触る「唯一の入口」を作る

**作業**
- Vercel/Next.jsでAPIルート実装
- 以下を最低限動かす
  - POST /nodes
  - GET /nodes/{id}
  - PATCH /nodes/{id}
  - POST /nodes/{id}/children
  - GET /dashboard/active
- status/temperatureはサーバーで初期値を付与

**完了条件**
- Postman/curlでAPIが動作
- ノードを作る→一覧で取れる

---

### Day3：状態（status）推定と適用（心臓①）

**目的**
- State Machineを実装し「再開可能性」を担保する

**作業**
- 05_State_Machine.md をコード化（定数・Enum）
- status変更は必ず履歴に残す
- POST /nodes/{id}/estimate-status を実装
  - AIが提案したstatusを受け取り
  - 遷移の妥当性を検証
  - 適用したら履歴に記録

**完了条件**
- statusが変わり、履歴が残る
- 不正遷移が弾かれる or 補正される

---

### Day4：温度（temperature）算出（心臓②）

**目的**
- 「冷えてきた」を検知し、机の整理ができるようにする

**作業**
- 06_Temperature_Spec.md を実装に落とす（最小ロジック）
- 温度の初期仕様（MVP）
  - last_updated からの経過日数
  - status による補正
  - 期限（任意）による上昇
  - 外部イベント（node_events）による上昇
- POST /nodes/{id}/estimate-temperature を実装
- GET /dashboard/cooling を実装（閾値以下を抽出）

**完了条件**
- temperature が 0〜100 で更新される
- cooling対象が抽出できる

---

### Day5：North Star（「今なにやる？」）を成立させる

**目的**
- context-osの価値の核を最短で体験できるようにする

**作業**
- GET /dashboard/active の抽出条件を固める
  - DONE / CANCELLED を除外
  - status別に優先ロジック
  - temperature が高いものを上位に
- POST /resume/next を実装
  - 候補Node IDs を受け取る
  - AIの選定理由と next_action を返す（最初はダミー可）
- “次の一手” を文字列として保存するか検討（MVPは返すだけでOK）

**完了条件**
- 「今なにやる？」で1件選べる
- next_action が具体的に返る

---

### Day6：分解（Decomposition）を成立させる

**目的**
- 思考の粒度を「再開しやすい最小単位」に落とす

**作業**
- POST /nodes/{id}/children を強化
  - sibling_order の付与
  - 子Node作成時のstatus初期化（READY or CAPTURED方針）
- Node詳細取得に children の取得を追加（API設計上は別でもOK）
- 分解後の親Node status をどうするか決める
  - 原則：親は CLARIFYING または READY に戻す

**完了条件**
- 大きいNodeを3〜7個に分解してツリー化できる
- 親子のstatusが破綻しない

---

### Day7：MCP/ChatGPT運用の最小統合（体験の固定）

**目的**
- 実運用の入口を「会話」に統一する

**作業**
- MCPツールを最小セット実装
  - create_node
  - update_node
  - list_active_nodes
  - get_node
  - create_children
  - list_cooling_nodes
- 14_Prompt_Pack.md を運用テンプレとして固める
- デモシナリオを作成（5分デモ）
  - 雑な思考→Node化→再開→分解→冷却確認

**完了条件**
- ChatGPTで「今なにやる？」が成立
- “机OS”としての手触りが出る

---

## 5. MVP評価（7日後の合否判定）

### 5.1 「使えた」判定

- 中断しても再開できる
- 机の上が整理される感覚がある
- 「止まってる理由」が見える
- 冷えたものを放置し続けずに済む

### 5.2 「失敗」判定（危険サイン）

- statusが増えすぎる
- temperatureがstatusの代わりになっている
- 「今なにやる？」が複数提示になり迷う
- UI作りに逃げてしまう

---

## 6. 7日後の次の一手（Week2の方向性）

### Option A：ChatWork連携（通知と再燃）
- タスク更新をChatWork側に同期
- 外部イベントで温度再燃

### Option B：決裁・判断支援（NEEDS_DECISION強化）
- 選択肢整理と質問生成の精度向上

### Option C：タイムライン（思考の履歴の可視化）
- status履歴とイベントから「思考の流れ」を出す

---

## 7. このDev Planの運用ルール

- 迷ったら Vision と North Star に戻る
- 仕様を増やすより「再開体験」を優先する
- “机が広がる感覚”が出なければ設計を疑う

---

## 8. 最後に（合言葉）

context-osはタスクを管理するのではない。  
**思考を再開するOS**である。

判断基準は常にこれ：

**「それは、再開に必要か？」**


