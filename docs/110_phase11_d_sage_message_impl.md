# 110 — Phase11-D 滞留検知時のみ表示される大賢者型メッセージ 最小実装

**要件**
- READY が 3 件以上、または NEEDS_DECISION が 2 件以上、または IN_PROGRESS が一定時間以上更新されていない場合のみ表示
- 通常時は非表示
- DB・API 変更なし
- 画面上部に 1 ブロックのみ追加
- トーンは 109 に従う（感情なし・事実→推奨→理由）

**参照**: [109_phase11_c_os_philosophy.md](109_phase11_c_os_philosophy.md)、[107_phase11_c_personality_design.md](107_phase11_c_personality_design.md)

---

## 1. 実装設計（簡潔）

- **データソース**: 既存の `trays`（GET /api/dashboard のレスポンス）。追加 API なし。
- **判定**: クライアント側で `trays` と現在時刻から以下を計算する。
  - READY 件数: 全トレーを平坦化し `status === "READY"` の件数
  - NEEDS_DECISION 件数: `trays.needs_decision.length`
  - IN_PROGRESS の長期未更新: 各 node の `updated_at` が閾値（例: 60 分）より古いものが 1 件以上
- **表示優先**: 複数条件を満たす場合は 1 種類のみ表示する。優先順位は **NEEDS_DECISION → IN_PROGRESS 未更新 → READY**（判断待ち・実施中停滞を先に促す）。
- **配置**: ダッシュボードのエラーバナーの直下、トレーカードの直上。1 ブロックのみ。
- **文言**: 事実→推奨→理由の順。マスター呼称は使わない（最小実装では人格を薄くし、事実と推奨のみ）。

---

## 2. 表示ロジック

```
入力: trays (Trays | null), 現在時刻

定数:
  READY_THRESHOLD = 3
  NEEDS_DECISION_THRESHOLD = 2
  IN_PROGRESS_STALE_MINUTES = 60

1. trays が null なら非表示。
2. 全ノードを flatten（in_progress + needs_decision + waiting_external + cooling + other_active）。
3. readyCount = flatten のうち status === "READY" の件数。
4. needsDecisionCount = trays.needs_decision.length。
5. inProgressStaleCount = trays.in_progress のうち、
   updated_at が (現在 - IN_PROGRESS_STALE_MINUTES) より前 の件数。

6. 表示するメッセージ種別を決定（上から優先）:
   - needsDecisionCount >= 2 → "needs_decision"
   - inProgressStaleCount >= 1 → "in_progress_stale"
   - readyCount >= 3 → "ready"
   - いずれも満たさない → 非表示（null）

7. 種別に応じたメッセージ文を 1 件表示。
```

---

## 3. メッセージ文 3 例

| 種別 | メッセージ文（事実→推奨→理由） |
|------|--------------------------------|
| needs_decision | 判断待ちが 2 件以上あります。優先順位の確認を推奨します。滞留が長いと見落としの原因になります。 |
| in_progress_stale | 実施中のタスクのうち、60 分以上更新がないものが 1 件以上あります。再開または状態の変更を推奨します。 |
| ready | 着手可能なタスクが 3 件以上あります。どれから着手するか選ぶことを推奨します。 |

※ 最小実装では上記 3 パターンのみ。メッセージ文は定数または 1 関数で保持する。

---

## 4. 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `src/app/dashboard/page.tsx` | 滞留検知の useMemo（条件判定＋表示用メッセージ）、画面上部に 1 ブロック（エラー下・トレー上）を追加。定数 READY_THRESHOLD=3, NEEDS_DECISION_THRESHOLD=2, IN_PROGRESS_STALE_MINUTES=60。 |

**変更しないもの**: API、DB、ProposalPanel、TreeList、stateMachine。

---

## 5. 実装済み

- 上記に従い `src/app/dashboard/page.tsx` に滞留検知の useMemo と画面上部 1 ブロックを追加済み。閾値は READY_THRESHOLD=3, NEEDS_DECISION_THRESHOLD=2, IN_PROGRESS_STALE_MINUTES=60。表示優先は NEEDS_DECISION → IN_PROGRESS 未更新 → READY。

---

以上。設計・表示ロジック・メッセージ例・変更一覧を定義し、最小実装を完了した。
