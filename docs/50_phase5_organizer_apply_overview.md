# 50 — Phase 5-A Organizer Apply 全体像

Phase 5 ルート A（Organizer Apply）の**入口**ドキュメント。Organizer の提案を「差分」として扱い、人間の Confirm を経て DB に安全に反映する仕組みの全体像を定義する。まだ実装には入らない。設計の土台を固める。

**前提**: 40_proposal_quality.md（OrganizerReport）、41_phase4_quality_pipeline.md、43_phase4_done_summary.md、44_phase5_route_options.md、00_naming_convention.md。

---

## 1. Phase5-A の目的（Why）

### なぜ Organizer Apply が必要か（OS としての価値）

- Organizer は「提案を生成し、品質を保証し、UI で表示する」まで Phase 4 で完了しているが、**反映** はしていない。ユーザーは提案を見て、手動で再現するかやらないかの二択だった。
- **Organizer Apply** により、「この案で反映する」を選んで Confirm すると、**机の上の構造（子 Node・関係・グループ等）が実際に変わる**。提案が「使える」ところまで閉じる。
- OS として、**「提案 → 人間が Confirm → 1 回の承認で 1 つの変更を反映」** というパターンを Organizer でも揃える。AI が勝手に DB を書かず、人が OK したときだけ反映する価値観を維持する。

### Phase 4（Advisor Apply）との違い（状態変更 vs 構造変更）

| 観点 | Phase 4：Advisor Apply | Phase 5-A：Organizer Apply |
|------|------------------------|----------------------------|
| **変えるもの** | 1 つの Node の **status（状態）** だけ。例：IN_PROGRESS → DONE。 | **構造**：子 Node の追加、Node 同士の relation、グループ付けなど。複数 Node や relation テーブルが変わる。 |
| **適用の単位** | 1 Node 1 status 変更。 | 1 つの「差分」（1 件の relation 追加、1 つの分解案で複数子追加、1 つのグループ案など）。 |
| **事故の影響** | 誤って status を変えても、原則 1 Node のみ。状態マシンで遷移も制限される。 | 誤適用すると、子 Node が大量にできたり、関係が意図と違う形で張られたりする。**取り消しが効きにくい**。 |
| **共通点** | 人間の Confirm 必須。confirmations で 1 承認 1 適用。 | 同じ。Confirm を省略せず、小さく確実に適用する。 |

---

## 2. 反映対象の“差分”の種類（What）

Organizer の提案を、**「何をどう変えるか」という差分** として 4 種類に整理する。それぞれ「反映の難易度」と「事故リスク」を一言で添える。

| 種類 | 説明 | 反映の難易度 | 事故リスク |
|------|------|----------------|------------|
| **A) status 差分** | 1 つの Node の status を変える（例：READY → IN_PROGRESS）。 | 低（既存の estimate-status で実現済み） | 低。1 Node のみ。遷移ルールで制限される。 |
| **B) relation 差分** | 2 つの Node の間に参照関係を 1 本追加する（親子・依存・関連リンクなど）。 | 中。relation テーブル 1 行追加。from/to/type の整合性を取る必要あり。 | 中。意図と違う Node 同士を繋げると後から分かりにくい。 |
| **C) grouping 差分** | 複数 Node を 1 つのグループとして扱う（トレイ移動・タグ付け等、仕様がある場合）。 | 中〜高。グループをどう DB に持つか（ラベル付与・グループエンティティ等）に依存。 | 中。まとめ間違いで Node が別グループに入ると混乱しうる。 |
| **D) decomposition 差分** | 1 つの Node を「子 Node を複数追加する」形で分解する。 | 高。子 Node を複数作成し、親子関係を張る。トランザクションとロールバックの設計が効く。 | 高。一度作ると取り消しが重い。文言や個数が意図と違うと机が散らかる。 |

**Phase5-A での扱い方**

- **status 差分**：**原則 Organizer では扱わない**。Advisor Apply で既に「1 Node の status 変更」ができる。Organizer が status を提案する例外条件を設けるかは、Phase 5 ではスコープ外とする。
- **relation / grouping / decomposition**：OrganizerReport の relation_proposals・grouping_proposals・decomposition_proposals から **Diff（変更提案）** に変換し、**1 件ずつ選択して Confirm → Apply** する。一括適用は初期ではやらない（事故防止のため）。

---

## 3. 差分の表現形式（How：データ構造の方針）

### OrganizerReport をそのまま Apply しない理由

- OrganizerReport は **LLM が返す生の提案の塊**（複数の分解案・グループ案・関連案が一度に入っている）。これをそのまま DB に書くと、「どの 1 つを採用したか」が曖昧になり、**部分採用** や **監査** がしづらい。
- また、実行時に「今から適用するのはこの 1 件」を明確にしないと、誤って別の案が適用されたり、二重適用されたりするリスクがある。

### “Diff（変更提案）”という中間表現を導入する方針

- **Diff**：OrganizerReport の各案を、「1 件の適用単位」に分解したもの。**「何を・どう変えるか」** を一意に指し示す。
- フロー：`OrganizerReport` → （サーバまたはクライアントで）**Diff のリストに変換** → UI で **プレビュー・選択** → ユーザーが選んだ **1 つの Diff** について Confirm → Apply。
- こうすることで、「今から適用するのはこの Diff だけ」を確認オブジェクトに紐づけられ、安全に 1 承認 1 適用にできる。

### Diff の最小スキーマ案（JSON 例）

以下は**方針レベル**の最小案。API の詳細は別 doc で定義する。

```json
{
  "diff_id": "uuid または run 内で一意な識別子",
  "type": "relation | grouping | decomposition",
  "target_node_id": "主に対象となる Node の ID（分解の親・グループの代表等）",
  "change": {
    "before": "変更前の状態（あれば）",
    "after": "変更後の状態（追加する子・relation・グループ内容など）"
  },
  "reason": "なぜこの変更を提案するか（Organizer の reason から）",
  "risk": "この変更で想定されるリスク（任意）",
  "generated_from": {
    "organizer_run_id": "どの Organizer 実行か",
    "attempt_id": "再生成の何回目か（あれば）"
  }
}
```

- **diff_id**：1 Diff を一意に指す。Confirm と Apply の紐づけに使う。
- **type**：上記 B/C/D のどれか（status は Phase5-A では扱わない）。
- **change**：before/after の代わりに、add/remove のように「何を足す・引くか」だけでもよい。最小では「何が変わるか」が分かればよい。
- **generated_from**：どの Organizer 実行のどの案から作られた Diff か。監査・トレース用。

---

## 4. UI フロー（Preview → Select → Confirm → Apply）

### 最小フロー（文章＋箇条書き）

1. **Organizer で提案を生成する**（既存の「Organizer提案を生成」）。OrganizerReport が返る。
2. **Diff の一覧を表示する**：report から Diff のリストに変換し、一覧またはカードで並べる。種類（relation / grouping / decomposition）が分かるようにする。
3. **プレビュー（差分プレビュー）**：ユーザーが 1 件の Diff を選ぶと、「この案を適用すると何が変わるか」を表示する。**必ず見せる項目**（下記）を満たす。
4. **選択**：「この案で反映する」などで、**1 件だけ** を選択する。初期は **一括適用はしない**（複数選択して一度に Apply は事故りやすいため、まずは 1 件ずつ）。
5. **Confirm**：確認ダイアログ（または confirmations API 経由）で、「この内容で反映してよいか」を明示的に OK してもらう。
6. **Apply**：Confirm が OK のときだけ、その 1 Diff を DB に反映する。成功したら dashboard を更新し、結果を表示する。

### “差分プレビュー”で必ず見せる項目

- **対象**：どの Node（id または title）が対象か。relation なら from / to の両方。
- **何が変わるか**：適用後に「何が追加されるか／どう変わるか」を短文または箇条書きで。例：「子 Node が 3 件追加されます」「A と B の間に "depends_on" が 1 本追加されます」。
- **理由**：Organizer が提案した reason（なぜこの変更か）。
- **リスク**：分かれば一言。例：「子を追加すると元 Node の文脈が分散します」。

---

## 5. Confirm の考え方（安全設計）

### Phase 4 同様 confirmations を使う方針（可能なら）

- Advisor Apply では、確認オブジェクトを **confirmation_events** に発行し、Apply 時にその confirmation を消費する形にしている。Organizer Apply も **可能なら同じ confirmations の仕組みを拡張** して使う。1 承認 1 適用・二重消費防止・監査の一貫性のため。

### Confirm に入れるべき情報

- **diff_id**：どの Diff を適用するか。
- **対象**：target_node_id、および type に応じた対象（from_node_id / to_node_id、node_ids など）。
- **変更内容**：change の要約（before → after や、add の内容）。人間が「何に OK したか」を後から見て分かるようにする。

これらを confirmation の `proposed_change` などに含め、Apply 時に「この confirmation の内容と一致する Diff だけ」を適用する。

### 取り消し（Undo）を Phase5 でやるか

- **Phase5-A では Undo（適用した Diff の取り消し）はやらない**。完了条件には含めない。
- 理由：取り消しは「どの変更をどう戻すか」の設計が重く、分解で作った子 Node の削除などは影響範囲が大きい。まずは **適用までを安全に閉じる** ことを優先し、Undo は Phase 6 以降で検討する。

---

## 6. Phase5-A のスコープ

### Phase5 で「やること」

- OrganizerReport から **Diff のリスト** を生成する仕様を決め、relation / grouping / decomposition の 3 種類を Diff として扱う。
- **差分プレビュー** で、対象・何が変わるか・理由・リスクを必ず表示する。
- **1 件選択 → Confirm → Apply** の最小フローを実装する。一括適用は含めない。
- **confirmations**（可能なら既存の拡張）で、Diff を明示した確認オブジェクトを発行し、1 承認 1 適用・二重適用防止を行う。
- Organizer タブに「この案で反映する」などの入口を設け、Preview → Select → Confirm → Apply をつなぐ。
- 各 Diff タイプ（relation / grouping / decomposition）について、「1 回の Apply で DB に何を書くか」を設計・実装する（詳細は別 doc）。

### Phase5 では「やらないこと」（Non-Goals）

- **完全自動 Apply**：人間が Confirm しない限り、どの Diff も反映しない。バッチ・スケジュールによる自動適用はやらない。
- **複数差分の自動最適化**：複数案をシステムが「良い組み合わせ」でまとめて適用するような機能はやらない。
- **Undo（取り消し）**：適用した Diff を取り消す機能は Phase5 では定義しない。
- **巨大な一括反映**：数十件の Diff を一度に選択して Apply する機能は初期ではやらない。まずは 1 件ずつの選択適用に限定する。
- **status 差分を Organizer で扱うこと**：原則として Advisor Apply に任せ、Organizer では status は扱わない（例外は Phase5 スコープ外）。
- **Advisor や他サブエージェントの既存動作の変更**：Organizer Apply に必要な共通部分（confirmations の拡張など）以外は触らない。

---

## 7. Phase5-A 完了条件（Definition of Done）

次の状態を **手動 E2E で確認できる** ことをもって、Phase5-A の完了とする。

1. **Organizer で提案を生成** し、OrganizerReport が返る。
2. 提案が **Diff の一覧として表示** され、種類（relation / grouping / decomposition）が分かる。
3. ユーザーが **1 件の Diff を選択** し、**差分プレビュー**（対象・何が変わるか・理由・リスク）が表示される。
4. 「この案で反映する」などで **Confirm** を実行し、確認ダイアログ（または confirmations 経由）で **OK** する。
5. **Apply** が実行され、該当する Diff が DB に反映される（子 Node 追加・relation 追加・グループ反映のいずれか）。
6. **dashboard が更新** され、反映結果（新規子 Node・relation 等）が一覧やツリー上で確認できる。

以上を、少なくとも **1 種類の Diff（例：relation だけ、または decomposition だけ）** で end-to-end で行える状態を Phase5-A の Definition of Done とする。3 種類すべてを同じリリースで揃えなくても、1 種類でフローが閉じていれば「Phase5-A 完了」とみなしてよい（残りは順次拡張）。

---

この文書で、Phase5-A の「何を反映対象にするか」「何は反映しないか」「Diff という中間表現」「Preview → Select → Confirm → Apply」「取り消しはやらない」と**スコープ・完了条件**を固定した。API の詳細やコード実装は次の md で定義する。
