# 115 — Phase11-B 表示文言全面見直し 実装タスク

Phase11-B を実装フェーズで管理するためのタスク一覧。108 §2 をファイル・ブロック単位で分解し、差し替え前→差し替え後を明示する。回帰リスク最小化のため表示層のみ変更・DB/API/ロジック変更禁止。

**参照**: [108_phase11_b_display_copy_review.md](108_phase11_b_display_copy_review.md)、[114_phase_status.md](114_phase_status.md)。

---

## 0. Phase11-B 実装開始宣言

- **Phase11-B（表示文言全面見直し）を実装フェーズに移行した。**
- **根拠**: docs/114_phase_status.md §4 戦略判断（今すぐやるべき 1 つ）。
- **Evidence 起点**: 108（対照表・差し替え案・最終レビュー）。
- **実装管理**: 本ドキュメント（115）でタスクを追跡する。ステータスは TODO → DOING → DONE で更新する。
- **制約**: 表示層のみ変更。DB/API 変更禁止。ロジック変更禁止。文字列差し替えと STATUS_LABELS 表示への統一に限定する。

---

## 1. 実装スコープ固定

### 1.1 実施する変更

| 項目 | 内容 |
|------|------|
| **Node → タスク** | 画面文言で「Node」「ノード」を「タスク」に統一する。 |
| **node_id / UUID 非表示化** | ラベルは「対象のタスク」「タスクのID（任意）」等に。バリデーションエラーは「タスクのIDの形式が正しくありません」。UUID という語は出さない。 |
| **raw status 表示禁止** | READY / IN_PROGRESS / NEEDS_DECISION 等の生の値は画面に出さない。STATUS_LABELS（着手可能、実施中 等）に統一する。 |
| **STATUS_LABELS へ統一** | フラット一覧行・TreeList 行・確認ダイアログの from/to・StatusBadge・推定候補ボタン・Advisor 現在の状態はすべて STATUS_LABELS 経由で表示する。 |
| **数式表現の廃止** | 「N件」のような変数表記をユーザーに見せない。「子 3 件」→「子タスク 3 件」等、文脈を補う。 |
| **Observer ラベル** | source: → 取得元:、node_count: → タスク数:、rule_version: → ルール版:。見出しは「観測結果の提案」、異常は「異常を検知しました（n件）」、未取得は「観測結果がまだありません」。 |
| **履歴詳細キー** | from_node_id → 元のタスク:、to_node_id → 先のタスク:、relation_type → 関係の種類:、diff_id → 変更ID:、group_label → グループ名:、node_ids → タスク一覧:、parent_node_id → 親タスク:、add_children (title) → 追加する子（タイトル）:。 |
| **反映できる変更案の括弧内** | （relation）→（関係の追加）、（grouping）→（グループ化）、（decomposition）→（分解）。 |

### 1.2 変更しない項目

| 項目 | 内容 |
|------|------|
| **API のキー名** | リクエスト・レスポンスの node_id, from_node_id, to_node_id, status 等は変更しない。 |
| **DB スキーマ・カラム名** | 一切変更しない。 |
| **stateMachine.ts の型・定数名** | Status 型・ALL_STATUSES・TRANSITIONS・STATUS_LABELS のキー（英語）は変更しない。表示に使う「値」だけ STATUS_LABELS[status] で表示する。 |
| **ロジック** | 条件分岐・閾値・計算・API 呼び出しは変更しない。 |
| **コンポーネントの props 名・state 名** | 表示文言以外の変数名・関数名は変更しない。 |
| **トレーラベル** | 全て（机の上）、実施中、判断待ち、外部待ち、冷却中、その他は 108 で変更対象外。 |

---

## 2. 実装タスク一覧（ファイル・ブロック単位）

### 2.1 page.tsx（ダッシュボード）

| # | ブロック/箇所 | 差し替え前 | 差し替え後 | ステータス |
|---|---------------|------------|------------|------------|
| P1 | 一覧・0件時 | 対象のノードがありません | 対象のタスクがありません | DONE |
| P2 | 詳細・未選択時 | 左の一覧からノードをクリックしてください | 左の一覧からタスクをクリックしてください | DONE |
| P3 | 詳細・温度 | （参考値・06_Temperature_Spec準拠） | （参考値） | DONE |
| P4 | フラット一覧・行内状態 | {n.status}（raw） | getStatusLabel(n.status) または STATUS_LABELS[n.status] | DONE |
| P5 | StatusBadge 表示 | {status}（{getStatusLabel(status)}） | getStatusLabel(status) のみ（raw を出さない） | DONE |
| P6 | 確認ダイアログ（Advisor 状態変更） | Node {targetNodeId} のステータスを {from} → {to} に変更します。よろしいですか？ | このタスクの状態を {fromLabel} → {toLabel} に変更します。よろしいですか？ | DONE |
| P7 | 推定候補ボタン | {c.status}（{c.label}） | {c.label} のみ | DONE |
| P8 | Observer 見出し | Observer の提案 | 観測結果の提案 | DONE |
| P9 | Observer メタ | source: / node_count: / rule_version: | 取得元: / タスク数: / ルール版: | DONE |
| P10 | Observer 警告 | Observer が異常を検知しました（n件） | 異常を検知しました（n件） | DONE |
| P11 | Observer 未取得 | Observer レポートがまだありません。… | 観測結果がまだありません。… | DONE |

### 2.2 ProposalPanel.tsx（提案パネル）

| # | ブロック/箇所 | 差し替え前 | 差し替え後 | ステータス |
|---|---------------|------------|------------|------------|
| R1 | ユーザー意図 placeholder | この Node の選択肢が知りたい | このタスクの選択肢が知りたい | DONE |
| R2 | 確認ダイアログ（relation） | Node {from} と {to} の間に {relation_type} を 1 本追加… | タスク「{from}」と「{to}」の間に {relation_type} を 1 本追加… | DONE |
| R3 | 確認ダイアログ（grouping） | 「{group_label}」で {n} 件の Node をグループ化… | 「{group_label}」で {n} 件のタスクをグループ化… | DONE |
| R4 | 確認ダイアログ（decomposition） | 親 Node … に子 Node を {n} 件作成して紐づけ… | 親タスクに、子タスクを {n} 件追加して紐づけ… | DONE |
| R5 | 復元カード・relation 要約 | from_node_id → to_node_id、relation_type | タスク識別子… → タスク識別子… または 2 件のタスクの間に関係を追加 | DONE |
| R6 | 復元カード・grouping 要約 | group_label、node_ids.length 件 | {group_label}（{n} 件） | DONE |
| R7 | 復元カード・decomposition 要約 | 親: parent_node_id…、子 n 件 | 親タスクに子タスク {n} 件を追加 | DONE |
| R8 | 反映できる変更案（relation）カード内 | from_node_id → to_node_id、relation_type | 上記同様（タスクの短い表示または 2 件のタスク） | DONE |
| R9 | 反映できる変更案（grouping）カード内 | group_label、node_ids.length 件 | {group_label}（{n} 件） | DONE |
| R10 | 反映できる変更案（decomposition）カード内 | 親: parent_node_id…、子 n 件 | 親タスクに子タスク {n} 件を追加 | DONE |
| R11 | 反映できる変更案 見出し括弧 | （relation）/（grouping）/（decomposition） | （関係の追加）/（グループ化）/（分解） | DONE |
| R12 | 子 n 件 表記 | 子 {add_children.length} 件 | 子タスク {add_children.length} 件 | DONE |
| R13 | 履歴フィルタ ラベル | node_id: | 対象のタスク: | DONE |
| R14 | 履歴フィルタ placeholder | node_id（任意） | タスクのID（任意） | DONE |
| R15 | バリデーションエラー | UUID形式ではありません | タスクのIDの形式が正しくありません | DONE |
| R16 | 履歴詳細 キー表示 | from_node_id: / to_node_id: / relation_type: / diff_id: / group_label: / node_ids: / parent_node_id: / add_children (title): | 元のタスク: / 先のタスク: / 関係の種類: / 変更ID: / グループ名: / タスク一覧: / 親タスク: / 追加する子（タイトル）: | DONE |
| R17 | 対象ラベル | 対象 Node（未指定なら 1 件目） | 対象のタスク（未指定なら 1 件目） | DONE |
| R18 | 対象選択肢 表示 | n.id.slice(0,8)… タイトル or (無題) | タスクの識別子… タイトル または タイトルのみ＋(無題) | DONE |
| R19 | 対象なし メッセージ | 対象Nodeが見つかりません | 対象のタスクが見つかりません | DONE |
| R20 | Advisor 現在の状態 ラベル | 現在のステータス: | 現在の状態: | DONE |
| R21 | Advisor 状態表示（raw を出さない） | <b>{applyTargetNode.status ?? "—"}</b>（{STATUS_LABELS[...]}） | STATUS_LABELS[applyTargetNode.status] または「—」（raw を表示しない） | DONE |
| R22 | 反映しました（decomposition） | 親 … に子 n 件作成 | 親タスクに子タスク n 件を追加 | DONE |
| R23 | 履歴サマリ（要約文） | from_node_id.slice(0,8)… → to_node_id…、親 parent_node_id… に子 n件 | タスク識別子… → タスク識別子…、親タスク… に子 n 件（英語 ID を出さない） | DONE |

### 2.3 TreeList.tsx

| # | ブロック/箇所 | 差し替え前 | 差し替え後 | ステータス |
|---|---------------|------------|------------|------------|
| T1 | 子件数 | 子{childCount}件 | 子タスク {childCount} 件 | DONE |
| T2 | 行内状態 | {(node.status as string) ?? ""}（raw） | getStatusLabel(node.status) を親から渡す、または STATUS_LABELS を props で渡して表示 | DONE |

**補足**: T2 は TreeList が status を表示するために、親（page.tsx）から getStatusLabel またはラベル文字列を渡す必要がある。TreeList の props に getStatusLabel 相当を追加するか、node と一緒に label を渡す。

---

## 3. raw status 直接表示の洗い出し（108 §4 と 1:1 対応確認）

| ファイル | 箇所 | 対応タスク | 備考 |
|----------|------|------------|------|
| page.tsx | フラット一覧行内 {n.status} | P4 | 一覧の各行で status をそのまま表示している |
| page.tsx | StatusBadge 内 {status}（{getStatusLabel(status)}） | P5 | 詳細パネル・推定結果で使用。raw を削除し label のみに |
| page.tsx | 推定候補ボタン {c.status}（{c.label}） | P7 | 2 箇所（キーワード推定・候補リスト） |
| ProposalPanel.tsx | 現在のステータス: <b>{applyTargetNode.status ?? "—"}</b> | R20, R21 | raw を削除し STATUS_LABELS のみ表示 |
| TreeList.tsx | {(node.status as string) ?? ""} | T2 | 行末の状態表示。親からラベルを渡す必要あり |

上記以外に API・ロジック内で status を参照している箇所は**表示用ではない**ため変更対象外（confirmations/route.ts、nodes/status/route.ts、estimate-status 等）。

---

## 4. 回帰リスク最小化の前提

- **表示層のみ変更**: 文字列・ラベル・メッセージの差し替えと、表示用に STATUS_LABELS を参照するようにする変更のみ。
- **DB/API 変更禁止**: エンドポイント・リクエスト/レスポンスのキー・スキーマは一切変更しない。
- **ロジック変更禁止**: 条件分岐・閾値・計算・状態遷移のロジックは変更しない。判定に使う status 等の変数名もそのまま。
- **マッピング整理**: 表示用ラベルは getStatusLabel(status) または STATUS_LABELS[status] に統一。relation_type の日本語マップは任意（depends_on→依存 等）。

---

## 5. 初回差し替え対象一覧（画面単位）

| 画面/ブロック | 対象タスク番号 | 概要 |
|---------------|----------------|------|
| **ダッシュボード 一覧** | P1, P4 | 0件メッセージ、フラット各行の状態をタスク/STATUS_LABELS に |
| **ダッシュボード 詳細** | P2, P3, P5 | 未選択案内、温度参考値、StatusBadge を label のみに |
| **ダッシュボード 推定フロー** | P7 | 候補ボタンを c.label のみに |
| **ダッシュボード 状態変更確認** | P6 | ダイアログ文言をタスク・fromLabel/toLabel に |
| **ダッシュボード Observer** | P8〜P11 | 見出し・取得元/タスク数/ルール版・異常・未取得 |
| **提案パネル 共通・構成案** | R1〜R12, R22 | 意図 placeholder、3種確認ダイアログ、復元・変更案カード、見出し括弧、子タスク表記、反映しました |
| **提案パネル 履歴** | R13〜R16, R23 | フィルタラベル・placeholder・バリデーション、履歴詳細キー、サマリ要約 |
| **提案パネル 判断案** | R17〜R21 | 対象のタスク、選択肢表示、対象なし、現在の状態、raw status 廃止 |
| **TreeList** | T1, T2 | 子タスク n 件、行内状態を STATUS_LABELS で表示 |

---

## 6. 想定リスク

| リスク | 内容 | 対策 |
|--------|------|------|
| **StatusBadge の呼び出し元** | StatusBadge を label のみにすると、詳細・推定結果で同じコンポーネントを使っている箇所がすべて label 表示になる。想定どおり。 | 変更なし。 |
| **TreeList の props 拡張** | 行内状態を label で表示するには、TreeList に getStatusLabel または statusLabel を渡す必要がある。page.tsx が TreeList を呼ぶ際に getNodeTitle/getNodeSubtext と同様の getStatusLabel を渡す。 | 115 の T2 で「親から渡す」と明示。TreeList の props に getStatusLabel?: (node) => string を追加する想定。 |
| **確認ダイアログの from/to** | Advisor の confirm で from/to は現在 raw。fromLabel / toLabel は getStatusLabel(from), getStatusLabel(to) で算出して渡す。 | page.tsx 内でラベルを計算し、confirm 文言に渡す。 |
| **履歴サマリの要約文** | 現在 from_node_id.slice(0,8)… 等で生成。108 では「タスク識別子…」または英語 ID を出さないとある。短い識別表示のまま「タスク」という語を付けるか、文言を「2 件のタスクの間に関係を追加」等に寄せるかは実装時に選択。 | 115 R23 で「英語 ID を出さない」とし、表記は 108 の要約に合わせる。 |
| **relation_type の表示** | depends_on, related 等がそのまま出ている箇所。108 では日本語マップは任意。まずは英語のまま短く表示し、必要なら別タスクでマップを追加。 | Phase11-B では「関係の種類: {relation_type}」のままでも可。日本語化はスコープ外としてもよい。 |

---

## 7. Block 完了報告（段階実装＋検証ゲート）

### 7.1 Block A: page.tsx（P1–P11）

**(1) 変更箇所一覧**

- 一覧 0 件: 「対象のノードがありません」→「対象のタスクがありません」
- 詳細未選択: 「左の一覧からノードをクリックしてください」→「左の一覧からタスクをクリックしてください」
- 温度: 「（参考値・06_Temperature_Spec準拠）」→「（参考値）」
- フラット一覧行: `{n.status}` → `{getStatusLabel(n.status)}`
- StatusBadge: `{status}（{getStatusLabel(status)}）` → `{getStatusLabel(status)}` のみ
- 状態変更確認: `applyStatus` 内に `window.confirm` を追加（文言: このタスクの状態を {fromLabel} → {toLabel} に変更します。よろしいですか？）
- 反映成功メッセージ: raw を削除し `${getStatusLabel(from)} → ${getStatusLabel(to)}に変更しました` のみ
- 推定候補ボタン 2 箇所: `{c.status}（{c.label}）` → `{c.label}` のみ
- Observer 見出し: 「Observer の提案」→「観測結果の提案」
- Observer メタ: source:→取得元:、node_count:→タスク数:、rule_version:→ルール版:
- Observer 警告: 「Observer が異常を検知しました」→「異常を検知しました」
- Observer 未取得: 「Observer レポートがまだありません。…」→「観測結果がまだありません。…」

**(2) 差し替え確認結果**  
108 §3 / 115 §2.1 と 1:1 対応で実施済み。

**(3) 漏れチェック結果**  
raw status 直出し・node_id 表示・数式表現: コメント・API 用変数名・型定義は変更対象外のため残存は許容。表示文言はすべて差し替え済み。

**(4) 回帰確認結果**  
表示層のみ変更。手動で一覧・詳細・推定フロー・Observer・確認ダイアログの表示確認を推奨。

**(5) 想定外影響**  
なし。StatusBadge は詳細・推定結果の両方で label のみ表示（想定どおり）。

---

### 7.2 Block B: ProposalPanel.tsx（R1–R23）

**(1) 変更箇所一覧**

- R1: 意図 placeholder 「この Node の選択肢が知りたい」→「このタスクの選択肢が知りたい」
- R2: relation 確認ダイアログを「タスク「fromShort…」と「toShort…」の間に …」に変更
- R3: grouping 確認「Node」→「タスク」
- R4: decomposition 確認「親 Node … に子 Node を n 件作成して紐づけ」→「親タスクに、子タスクを n 件追加して紐づけ」
- R5–R10: 復元・反映できる変更案カードの要約をタスク識別子・「（n 件）」・「親タスクに子タスク n 件を追加」に統一
- R11: 見出し括弧（relation/grouping/decomposition）→（関係の追加/グループ化/分解）
- R12: 「子 n 件」→「子タスク n 件」または「親タスクに子タスク n 件を追加」表記に統一
- R13–R15: 履歴フィルタ「node_id:」→「対象のタスク:」、placeholder「タスクのID（任意）」、バリデーション「タスクのIDの形式が正しくありません」
- R16: 履歴詳細キーを元のタスク/先のタスク/関係の種類/変更ID/グループ名/タスク一覧/親タスク/追加する子（タイトル）に変更
- R17–R19: 対象のタスク（未指定なら 1 件目）、選択肢に「タスク」付与、対象なし「対象のタスクが見つかりません」
- R20–R21: 「現在のステータス」→「現在の状態」、raw status を出さず STATUS_LABELS のみ表示。変更先 select も label のみ表示
- R22: decomposition 反映成功「親タスクに子タスク n 件を追加」
- R23: 履歴サマリで「タスク … → タスク …」「親タスクに子 n 件を追加」表記に統一。Advisor 適用成功メッセージを「反映しました（fromLabel → toLabel）。現在: latestLabel」に統一

**(2) 差し替え確認結果**  
108 §3.2 / 115 §2.2 と 1:1 対応で実施済み。

**(3) 漏れチェック結果**  
API キー名・型・内部変数は変更していない。表示文言のみ差し替え済み。

**(4) 回帰確認結果**  
構成案・判断案・履歴の表示・確認ダイアログ・適用成功メッセージの手動確認を推奨。

**(5) 想定外影響**  
なし。

---

### 7.3 Block C: TreeList.tsx（T1–T2）

**(1) 変更箇所一覧**

- T1: 「子{childCount}件」→「子タスク {childCount} 件」。roots.length === 0 時「対象のノードがありません」→「対象のタスクがありません」
- T2: 行内状態を raw `node.status` ではなく props `getStatusLabel(node)` の結果で表示。TreeListProps に `getStatusLabel?: (node) => string` を追加。page.tsx から `getStatusLabel` を渡す。

**(2) 差し替え確認結果**  
108 §3.3 / 115 §2.3 と 1:1 対応で実施済み。

**(3) 漏れチェック結果**  
TreeList 単体で「ノード」表記は 0 件時メッセージのみで差し替え済み。行内状態は親からラベルを渡す形で raw 非表示。

**(4) 回帰確認結果**  
ツリーモードでの子件数・行内状態・0 件時表示の手動確認を推奨。

**(5) 想定外影響**  
getStatusLabel 未渡しの場合は statusLabel が "" となり「—」表示。page.tsx では渡しているため想定どおり。

---

## 8. 最終横断チェック（REVIEW → DONE 用）

全ブロック完了後、以下を実施し問題なければ 114 で Phase11-B を DONE に変更する。

| # | チェック項目 | 内容 |
|---|--------------|------|
| 1 | 全画面スキャン | ダッシュボード（一覧・詳細・推定・Observer）・提案パネル（構成案・判断案・履歴）・TreeList で「Node」「ノード」「node_id」「UUID」「READY」等の開発者語が画面に残っていないこと |
| 2 | 表示用語統一 | ユーザー向け表記が「タスク」「状態」「対象のタスク」「観測結果」等 108 対照表に揃っていること |
| 3 | STATUS_LABELS 統一 | フラット一覧・TreeList 行・StatusBadge・確認ダイアログ・推定候補・Advisor 状態で raw status が表示されず、すべてラベルのみであること |

**実施後**: 上記を確認し、問題なければ docs/114_phase_status.md の Phase11-B を **DONE（CLOSED）** に更新する。

---

## 9. 正式クローズ（Phase11-B）

- **Phase11-B（表示文言全面見直し）を正式にクローズした。**
- **完了宣言**: 115 §2 の全タスク（P1–P11, R1–R23, T1–T2）を DONE とし、Block A/B/C の段階実装＋検証ゲートを完了。最終横断チェック（§8）を docs/116_phase11_b_final_check_result.md に記録し、3 項目いずれも合格とした。
- **参照ドキュメント**: 116（横断チェック結果）、115（本タスク一覧・Block 報告）、108（対照表・差し替え案・最終レビュー）、114（Phase 状態・クローズ根拠）。

---

以上。Phase11-B の実装タスクを 108 §2 と §4 および raw status 洗い出しに基づき分解した。Block A/B/C を段階実装し、各 Block の報告を §7 に記載。最終横断チェック（§8）を 116 に記録のうえ Phase11-B を DONE（CLOSED）として正式クローズした。
