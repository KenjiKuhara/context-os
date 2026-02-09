# 26_Agent_Observer_MVP.md
## Agent MVP：Observer（Level 0）起動・実行ガイド

---

## 0. この文書の目的

本ドキュメントは、context-os 初の Python Agent である  
**Observer（Level 0）** のセットアップ・起動方法・実行例を示す。

本 Agent は以下を前提とする。

- 19_SubAgent_Observer.md — Observer の設計 SSOT
- 25_Boundary_NextJS_PythonAgent.md — Next.js / Python の境界線
- 20_SubAgent_Catalog.md §3 — Level 0 の定義

---

## 1. ファイル構成

```
agent/observer/
  main.py            # Observer 本体
  .env.example       # 環境変数テンプレート
  .env               # 環境変数（git 対象外）
  requirements.txt   # Python 依存
```

---

## 2. セットアップ

### 2.1 前提

- Python 3.10+
- Next.js dev サーバーが起動済み（`http://localhost:3000`）
- Supabase に nodes データが 1 件以上存在

### 2.2 手順

```bash
cd agent/observer

# 依存インストール
pip install -r requirements.txt

# 環境変数を設定
cp .env.example .env
# 必要に応じて .env を編集（デフォルトは localhost:3000）
```

ベース URL は環境変数 **NEXT_BASE_URL** で統一（Phase 3-2.1 SSOT）。main.py / workflow / docs で同じ名前を使う。

---

## 3. 実行

```bash
cd agent/observer
python main.py
```

ObserverReport が JSON で標準出力に出力される。

---

## 4. 実行例

### 4.1 Node が存在する場合

```json
{
  "suggested_next": {
    "node_id": "abc-123",
    "title": "講演スライド作成",
    "reason": "実施中で最も温度が高いノードです",
    "next_action": "「講演スライド作成」の context を確認し、次の一手を決める"
  },
  "status_proposals": [
    {
      "node_id": "def-456",
      "title": "A社への提案書",
      "current_status": "IN_PROGRESS",
      "suggested_status": "WAITING_EXTERNAL",
      "reason": "「最終更新から3日経過、温度52、現在IN_PROGRESS」の内容から「外部待ち」と推定しました"
    }
  ],
  "cooling_alerts": [
    {
      "node_id": "ghi-789",
      "title": "新規事業アイデア整理",
      "temperature": 25,
      "last_updated": "2026-01-15T10:00:00Z",
      "message": "「新規事業アイデア整理」は温度が25に低下 / 24日間更新がありません。止めてよいですか？"
    }
  ],
  "summary": "机の上に 12 件のノードがあります。実施中 3 件。判断待ち 2 件。冷却確認 1 件。状態変更の提案 1 件。"
}
```

### 4.2 Node が存在しない場合

```json
{
  "suggested_next": null,
  "status_proposals": [],
  "cooling_alerts": [],
  "summary": "机の上にノードがありません。"
}
```

---

## 5. 安全性の担保

### 5.1 Observer が呼ぶ API

| API | モード | 副作用 |
|-----|--------|--------|
| `GET /api/dashboard` | 読み取り | なし |
| `POST /api/nodes/{id}/estimate-status` | **Preview のみ** | なし |

### 5.2 Observer が絶対にやらないこと

- `confirm_status` を送らない（= Apply しない）
- `POST /api/confirmations` を呼ばない
- DB に直接アクセスしない
- Node を作成・更新・削除しない

### 5.3 コードレベルでの担保

`main.py` の `preview_status` 関数を参照：

```python
resp = await client.post(
    f"{BASE_URL}/api/nodes/{node_id}/estimate-status",
    json={"intent": intent},
    # confirm_status を送らない = Preview mode
)
```

`confirm_status` キーが JSON に含まれないため、  
API は必ず Preview mode で動作する（17 §2.1）。  
万が一 `confirm_status` が混入しても、  
`source` と `confirmation_id` がないため 403 で拒否される（18 §3.6）。

---

## 6. ObserverReport の構造

19_SubAgent_Observer.md §4.2 に準拠。

| フィールド | 型 | 意味 |
|-----------|-----|------|
| `suggested_next` | object / null | 「今なにやる？」の回答。1 件のみ |
| `status_proposals` | array | status 変更の提案一覧 |
| `cooling_alerts` | array | 冷却確認が必要な Node 一覧 |
| `summary` | string | 机の上の全体像の一文 |

**すべて提案であり、確定ではない。**

---

## 7. カスタマイズ

### 7.1 冷却閾値の変更

`.env` で変更可能：

```
COOLING_THRESHOLD=30   # temperature 閾値（デフォルト: 40）
COOLING_DAYS=14        # 経過日数閾値（デフォルト: 7）
```

### 7.2 suggested_next の優先順位

`main.py` の `priority_order` を変更：

```python
priority_order = [
    "IN_PROGRESS",      # 1. まず動いているもの
    "NEEDS_DECISION",   # 2. 次に判断待ち
    "READY",            # 3. 着手可能
    "BLOCKED",          # 4. 障害あり
    "WAITING_EXTERNAL", # 5. 外部待ち
]
```

---

## 8. レポートの保存と表示（Phase 3-0）

### 8.1 保存先

ObserverReport は `observer_reports` テーブルに保存される。

| カラム | 型 | 説明 |
|--------|-----|------|
| report_id | UUID | 自動生成 |
| created_at | TIMESTAMPTZ | 生成日時 |
| generated_by | TEXT | 生成元（`observer_cli` 等） |
| payload | JSONB | ObserverReport JSON |
| node_count | INTEGER | 観測した Node 数 |
| source | TEXT | 送信元識別（Phase 3-1、例: `observer_python`） |
| received_at | TIMESTAMPTZ | API がリクエストを受信した時刻（監査用） |

### 8.2 保存方法

```bash
# --save を付けると POST /api/observer/reports に保存される
python main.py --save
```

`--save` なしの場合は stdout のみ（保存しない）。

### 8.3 Phase 3-1：Token 認証（Bearer）

POST /api/observer/reports は **Bearer token 認証**が必須です。

#### Token の設定方法

- **Next.js（API 側）**: プロジェクトルートの `.env.local` に以下を追加する。

  ```bash
  # 長いランダム文字列（例: openssl rand -hex 32）
  OBSERVER_TOKEN=あなたのトークン文字列
  ```

- **Python Observer 側**: `agent/observer/.env` に同じ値を設定する。

  ```bash
  OBSERVER_TOKEN=あなたのトークン文字列
  ```

両方に **同じ OBSERVER_TOKEN** を設定すること。Next.js を再起動してから `python main.py --save` を実行する。

#### 送信ヘッダ

`--save` 時に Python Observer は次のヘッダを付与する。

```
Authorization: Bearer <OBSERVER_TOKEN>
```

#### 失敗時の挙動

| 状況 | API の応答 |
|------|------------|
| ヘッダなし / `Authorization` 欠け | HTTP 401 `{"ok":false,"error":"unauthorized"}` |
| 形式不正（例: `Bearer` でない） | HTTP 401 |
| トークン不一致 | HTTP 401 |

401 のときは、Next.js の OBSERVER_TOKEN と Observer の .env の OBSERVER_TOKEN が一致しているか確認する。

### 8.4 パイプでも保存可能

```bash
# main.py の出力を curl でパイプして保存
python main.py | curl -s -X POST http://localhost:3000/api/observer/reports \
  -H "Content-Type: application/json" \
  -d "$(jq -n --argjson p "$(cat -)" '{payload: $p, generated_by: "observer_cli"}')"
```

### 8.5 表示先

ダッシュボード（`/dashboard`）の下部に **「Observer の提案」パネル** として表示される。

| ObserverReport の要素 | 表示 |
|----------------------|------|
| `summary` | 概況テキスト |
| `suggested_next` | 「今やるとよさそうなこと」ブロック（青枠） |
| `status_proposals` | 状態変更の提案一覧 |
| `cooling_alerts` | 冷却確認（黄色背景） |

**Apply ボタンは付いていない。** 提案を読み、判断し、Apply するのは人間の責務。

### 8.6 運用フロー

```
1. python agent/observer/main.py --save    # Observer を実行し保存
2. ダッシュボード（/dashboard）を開く       # 最新レポートが表示される
3. 提案を読む                               # suggested_next / proposals / alerts
4. 必要に応じて Node を選び Apply する       # human_ui フロー（estimate-status）
```

Observer 自身は Apply しない。提案と実行は完全に分離されている。

### 8.7 定期実行の入口（Phase 3-2）

**運用は 27_Observer_Operations.md を参照すること。**

Phase 3-2 では **GitHub Actions** で Observer を定期実行する（cron + workflow_dispatch）。  
Vercel には Python を載せず、Observer は外部ジョブとして `python agent/observer/main.py --save` を実行し、`POST /api/observer/reports` に保存する。

`POST /api/observer/run` は将来の実行トリガー用に予約されており、現時点では 501 を返す空実装。

---

## 9. 将来の拡張

| 拡張 | 方法 |
|------|------|
| LLM による推定強化 | `preview_status` の intent を LLM が構成する |
| 定期実行 | Phase 3-2 で GitHub Actions により実装済み（27 参照） |
| Vercel Cron | `/api/observer/run` を実装し Vercel Cron から呼び出す |
| LangChain 化 | `observe()` を LangChain の Chain として実装する |

---

## 10. この文書の位置づけ

本ドキュメントは、

- Observer Agent の**起動・運用ガイド**
- 19_SubAgent_Observer.md の**実装対応**
- 25_Boundary_NextJS_PythonAgent.md の**最初の実例**

として機能する。
