# 111 — Phase11-E 大賢者助言 再出現制御 手動 E2E 計画

Phase11-E（大賢者メッセージの再出現制御）を手動 E2E で検証するための計画。確認観点に基づく DoD を整理する。

**参照**: [110_phase11_d_sage_message_impl.md](110_phase11_d_sage_message_impl.md)、[src/app/dashboard/page.tsx](../src/app/dashboard/page.tsx)（SAGE_LAST_HANDLED_KEY、stagnationMessage の lastHandled 判定、handleSageActionClick での localStorage 保存）。

---

## 1. 対象

Phase11-E で追加した「再出現制御」を手動 E2E で確認する。滞留検知のロジック・閾値・優先順位は変更していない。

| 項目 | 内容 |
|------|------|
| **同じ kind の助言を直前に対応した場合は再表示しない** | 推奨アクション行をクリックしたとき、localStorage に lastHandledSageKind（と timestamp）を保存する。同一 kind の候補が再計算されても、lastHandledSageKind と一致する間は表示しない。 |
| **状態が改善した場合のみ再出現を許可** | 滞留が解消（いずれの条件も閾値未満）したとき、localStorage の lastHandled を削除する。その後、再度閾値を超えたときに同じ kind の助言が再表示される。 |
| **localStorage が空／壊れていても落ちない** | getItem / setItem / removeItem / JSON.parse を try-catch で囲み、異常時は無視して表示判定・保存を行わない。 |

---

## 2. DoD（手動 E2E チェックリスト）

| # | 確認観点 | 手順・期待結果 |
|---|----------|----------------|
| 1 | **同じ kind はクリック後に再表示されない** | 助言が表示されている状態（例: 判断待ち 2 件以上で「判断待ち」助言）で、推奨アクション行をクリックする。→ トレー切替・フォーカス・ハイライトが行われる。ページをリロードせず、そのままダッシュボードを再取得（例: 他タブで戻る／F5 しない）しても、同じ kind の助言は再表示されない（条件がまだ満たされていても非表示のまま）。 |
| 2 | **滞留が解消すると lastHandled が削除され再出現が許可される** | 上記のあと、状態を改善する（判断待ちを 1 件以下に減らす、実施中停滞を解消する、READY を 2 件以下に減らすなど）。→ 助言が消え、localStorage の `kuharaos.sage.lastHandled` が削除される。再度同じ条件を満たす状態に戻す（判断待ちを 2 件以上にする等）。→ 同じ kind の助言が再表示される。 |
| 3 | **別 kind に切り替わるケース** | 複数条件を満たす場合は優先順位（needs_decision → in_progress_stale → ready）で 1 種類のみ表示される。いま表示されている kind のアクションをクリックして lastHandled を記録したあと、状態を変えて**別の kind** が候補になるようにする（例: 判断待ちを解消し、実施中停滞のみ残す）。→ 別 kind の助言が表示される。lastHandled は「同じ kind」のときだけ抑制するため、別 kind は表示されてよい。 |
| 4 | **localStorage が空／壊れていても落ちない** | DevTools で `kuharaos.sage.lastHandled` を removeItem する、または不正な JSON を setItem する。→ ページをリロードし、滞留条件を満たす状態にする。→ 助言が表示され、コンソールにエラーが出ず、クリックでトレー切替・フォーカスが動作する。 |
| 5 | **既存のトレー切替・フォーカス・ハイライトが壊れていない** | 助言の推奨アクションをクリックしたとき、該当トレーに切替わり、最上位の対象タスクが選択され、ツリー表示時は祖先が展開され、該当ノードがハイライトされる。Phase11-D の導線と同じ挙動であること。また、通常のトレーカードクリック・一覧のノードクリックで、従来どおりトレー切替・詳細表示・ハイライトが動作する。 |

---

## 3. 本 Phase で行わないこと

| 項目 | 内容 |
|------|------|
| **実装の拡張** | 再出現制御の仕様（「同じ kind は再表示しない」「状態改善で lastHandled 削除」）を超えた機能追加は行わない。 |
| **閾値変更** | READY_THRESHOLD / NEEDS_DECISION_THRESHOLD / IN_PROGRESS_STALE_MINUTES は変更しない。 |
| **timestamp の利用** | localStorage に timestamp を保存するが、現仕様では「経過時間で自動解除」等には使わない。状態改善でのみ削除する。 |

---

## 4. 参照ドキュメント

| 番号 | ファイル名 |
|------|------------|
| 110 | 110_phase11_d_sage_message_impl.md |
| 107 | 107_phase11_c_personality_design.md |
| 109 | 109_phase11_c_os_philosophy.md |

---

以上。Phase11-E 大賢者助言の再出現制御は本計画の DoD に沿って手動 E2E を実施し、結果は 112 に記録する。
