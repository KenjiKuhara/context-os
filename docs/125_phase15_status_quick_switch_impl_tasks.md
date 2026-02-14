# 125 — Phase15-StatusQuickSwitch 実装タスク

124 設計に基づく実装タスク一覧。順序どおりに実施する。

**参照**: docs/124_phase15_status_quick_switch_design.md。

---

## Block A: UI 追加

| # | タスク | 内容 | 完了 |
|---|--------|------|------|
| A1 | 全状態ボタン群コンポーネント | 詳細パネル内「状態：」直下に、ALL_STATUSES を横並びで表示するボタン群を追加。各ボタンは STATUS_LABELS のラベルを表示。 |  |
| A2 | active / inactive / disabled スタイル | 現在状態 = active（強調・セマンティックトークン）。他 = inactive（アウトライン）。現在状態のボタンは disabled。トークンのみ使用（直書き禁止）。 |  |
| A3 | 配置 | 「状態： \<StatusBadge\>」の直下に配置。既存の温度・途中内容・更新・履歴・推定ブロックは変更しない。 |  |

---

## Block B: 送信・optimistic・ガード

| # | タスク | 内容 | 完了 |
|---|--------|------|------|
| B1 | クリックハンドラ | ボタン押下で対象 status を引数にハンドラを呼ぶ。現在状態のボタンは disabled のため発火しない。 |  |
| B2 | optimistic 更新 | 押下直後にローカル state で選択中ノードの status を切り替え（一覧・詳細の両方で即反映）。 |  |
| B3 | API 呼び出し（非同期） | POST /api/nodes/{id}/estimate-status を Apply モードで呼ぶ（confirm_status, intent 最小、confirmation 付き）。await せず then/catch で処理。 |  |
| B4 | 成功時 | refreshDashboard で一覧を再取得。optimistic のままでも可。必要なら選択中ノードを最新に差し替え。 |  |
| B5 | 失敗時 | 元の status に戻し、失敗メッセージを表示（トーストまたは詳細内の小さなエラー表示）。 |  |
| B6 | last-write-wins | 同一ノードに連続で別状態を押した場合、最後の request の結果で UI を確定。途中のレスポンスで上書きしない（requestId または送信順で破棄判定）。 |  |

---

## Block C: 確認

| # | タスク | 内容 | 完了 |
|---|--------|------|------|
| C1 | 既存ブロックの確認 | 推定（「何が起きた？」）・履歴・温度・文言が従来どおり動作することを確認。 |  |
| C2 | ダーク/ライト | ボタン群の active/inactive/disabled が両テーマで判別できることを確認。 |  |

---

## 変更ファイル（想定）

- `src/app/dashboard/page.tsx` … 詳細パネル内に状態ボタン群を追加、クリック→optimistic＋API 呼び出し、失敗時ロールバック・メッセージ
- 必要なら `src/components/StatusQuickSwitch.tsx` を新規作成（ボタン群のみ切り出し）

---

以上。Phase15-StatusQuickSwitch の実装タスクとする。
