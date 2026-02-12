# 83 — Phase7 サマリ

Phase7 の狙い・Phase7-A で達成した価値・次に残るテーマを 1 枚で整理する。

**参照**: 76_phase7_scope.md、82_phase7_a_history_closeout.md。

---

## 1. Phase7 の狙い

| 項目 | 内容 |
|------|------|
| **位置づけ** | Phase6 までで「構造・差分・確定・UI・永続化」は実装済み。Phase7 は **UI 強化ではなく「OS の本質」** を進めるフェーズ。 |
| **目指した価値** | 「**意思決定を辿れる OS**」への第一歩。過去に適用した Diff や confirmation を一覧で見られるようにし、「なぜこの構造になったか」を後から追跡できるようにする。 |
| **第一テーマ** | Diff / Confirmation 履歴の可視化（Phase7-A）。DB 変更なし・既存 confirmation 構造の活用・読み取り専用 API と UI で実現。 |

---

## 2. Phase7-A で達成した価値

| 項目 | 内容 |
|------|------|
| **履歴の可視化** | Organizer タブに「適用済み Diff 履歴」を表示。いつ・どの種別（relation/grouping/decomposition）・どの対象で Apply したかが一覧で分かる。 |
| **詳細の追跡** | 1 行クリックで proposed_change の内容（from/to、group_label、parent_node_id と子タイトル等）を確認できる。 |
| **リロード不要** | Apply 成功直後に履歴を再取得するため、F5 なしで直前に適用した 1 件が一覧に追加される。Organizer 提案表示は消えない。 |
| **既存を壊さない** | Organizer の提案生成・Diff Apply、Phase6 ツリー表示はそのまま維持。 |

---

## 3. 次に残るテーマ

| テーマ | 概要 | 備考 |
|--------|------|------|
| **履歴のフィルタ UI** | type / node_id で絞り込む UI。API は対応済み。 | Phase7-B の有力候補。DB 変更なし。 |
| **reason の保存・表示** | 採用理由を confirmation に含め、履歴詳細で表示する。 | proposed_change の拡張で対応可能。 |
| **履歴とツリーの連携** | 履歴 1 件選択時に該当 Node をツリー/詳細でフォーカスする。 | UI 拡張。 |
| **ページネーション** | 履歴が多数の場合の「さらに読み込む」等。 | API の limit/offset は対応済み。 |
| **判断ログ・Undo・温度可視化** | 76 で挙げたその他候補。Phase7-B 以降で検討。 | 優先度は別 doc で整理。 |

---

## 4. 参照ドキュメント

| 番号 | ファイル名 |
|------|------------|
| 76 | 76_phase7_scope.md |
| 77 | 77_phase7_history_design.md |
| 78 | 78_phase7_history_mvp_plan.md |
| 81 | 81_phase7_a_history_no_reload_update.md |
| 82 | 82_phase7_a_history_closeout.md |
| 84 | 84_phase7_b_scope.md（Phase7-B スコープ案） |

---

以上。Phase7 の狙い・Phase7-A の到達点・残テーマを 1 枚でまとめた。
