# 21_SubAgent_Organizer.md
## SubAgent 設計：Organizer（整理・構造化エージェント）

---

## 0. この文書の目的

本ドキュメントは、context-os における Level 1 サブエージェントの  
代表例である **Organizer** の役割・制約・Skill 利用ルールを定義する。

Organizer は **「整理するが、決めない」** エージェントである。

Observer（19, Level 0）が「個々の Node を観測し、事実と推定を報告する」のに対し、  
Organizer は「**Node 群を横断的に分析し、構造・関連・分解を提案する**」。

本ドキュメントは以下を前提とする。

- 00_Vision_NorthStar.md §5.3 — ノードは 1 種類のみ（型で分けない）
- 04_Domain_Model.md §4-5 — 階層構造（ツリー）と参照関係（グラフ）
- 14_Prompt_Pack.md §7 — 分解支援（Decomposition）
- 18_Skill_Governance.md — Skill ガバナンス共通ルール
- 19_SubAgent_Observer.md — Level 0 の基準設計
- 20_SubAgent_Catalog.md §4 — Level 1 の定義

---

## 1. Organizer とは何か

### 1.1 一言での定義

Organizer は、  
**Node 群の関連を分析し、整理・要約・分解を人間に提案する**  
サブエージェントである。

### 1.2 Organizer がやること

- 複数の Node を横断的に分析し、**関連性**を検出する
- 大きすぎる Node に対して**分解案**を構成する
- 散在する Node を**グループ化**し、構造を提案する
- Node 群の全体を**要約**し、「机の上」の概観を伝える

### 1.3 Organizer が絶対にやらないこと

- **Apply を呼ばない**（status を確定しない）
- **Node を作成・更新・削除しない**（構造変更の提案はするが、実行はしない）
- **子 Node を作成しない**（`POST /nodes/{id}/children` は呼ばない）
- **参照関係を書き込まない**（relations の提案はするが、DB には触れない）
- 「こうすべき」と断言しない（「こう整理できそう」と提案する）

### 1.4 Observer（Level 0）との違い

| 観点 | Observer (Level 0) | Organizer (Level 1) |
|------|-------------------|---------------------|
| **分析の単位** | 個々の Node | Node 群の関係 |
| **主な処理** | 状態観測 + 推定候補の取得 | 関連検出 + 分類 + 分解案構成 |
| **出力の性質** | 「この Node はこう変わったのでは」 | 「これらの Node はこう整理できそう」 |
| **人間に伝えるもの** | 個別の状態変化・冷却 | 構造・全体像・分解の提案 |
| **ObserverReport を使うか** | 自分が生成する | 入力として受け取りうる |

**要約**：Observer は「点」を見る。Organizer は「線と面」を見る。

---

## 2. 18_Skill_Governance.md / 20_SubAgent_Catalog.md との対応

### 2.1 ガバナンスルール対応

Organizer は 18_Skill_Governance.md のルールに**完全に従う**。  
Level 0（Observer）と適用されるルールは同一である。

| ガバナンスルール | Organizer の振る舞い |
|----------------|---------------------|
| §2.1 Preview は無制限 | Organizer は Skill の Preview / 読み取りのみ使用する |
| §2.2 Apply は人間確認必須 | Organizer は Apply を**一切呼ばない** |
| §3 source + confirmation | Organizer は Apply しないため該当しない |
| §4.1 Preview 連鎖は許可 | Organizer は複数 Skill の Preview を組み合わせてよい |
| §4.2 Apply 連鎖は禁止 | Organizer は Skill の Apply を連鎖呼び出ししない |
| §4.3 提案の返却 | Organizer の出力は常に「人間への構造化提案」である |

### 2.2 カタログ上の位置

20_SubAgent_Catalog.md §4 で定義された Level 1 の代表例。

| 項目 | 20 §4 の定義 | Organizer の実装 |
|------|------------|-----------------|
| 役割 | Node 群の関連を分析し、整理・要約・再分類を提案する | 同左 |
| Skill 利用 | Preview / 読み取りのみ | 同左 |
| Apply | 禁止 | 禁止 |
| 判断への距離 | やや遠い（構造化の提示） | 同左 |

---

## 3. 呼び出してよい Skill

### 3.1 許可される Skill 呼び出し

| Skill | モード | 用途 |
|-------|--------|------|
| `estimate-status` | **Preview のみ** | 分解対象 Node の現在 status と遷移候補を確認する |
| `GET /dashboard/active` | 読み取り | アクティブ Node の一覧を取得する |
| `GET /dashboard/cooling` | 読み取り（将来） | 冷却候補を含めた全体像の構成 |
| `GET /nodes/{id}` | 読み取り（将来） | 個別 Node の context / history / 親子関係を取得する |

### 3.2 禁止される Skill 呼び出し

| 操作 | 禁止理由 |
|------|---------|
| `estimate-status` の **Apply mode** | status 確定は人間の責務（18 §2.2） |
| `POST /nodes` | Node 作成は人間または Capture の責務 |
| `PATCH /nodes/{id}` | Node 更新は人間の責務 |
| `POST /nodes/{id}/children` | 子 Node 作成は人間の承認を経るべき（04 §4.3 親子ルール） |
| `POST /nodes/{id}/delegate` | 委任は人間の判断 |
| DB への直接クエリ | 10_Architecture §2.2 |

---

## 4. 入力

### 4.1 直接入力（Skill / API 経由）

| 入力 | 取得元 | 説明 |
|------|--------|------|
| アクティブ Node 一覧 | `GET /dashboard/active` | 全トレーの Node snapshot |
| 個別 Node の詳細 | `GET /nodes/{id}`（将来） | context / history / parent_id / temperature |
| status 推定候補 | `estimate-status` Preview | 分解要否の判断材料 |

### 4.2 間接入力（他サブエージェントの出力）

| 入力 | 取得元 | 説明 |
|------|--------|------|
| ObserverReport | Observer (Level 0) | Observer が構成した観測結果。Organizer はこれを「整理の入力」として使える |

Observer → Organizer の連携は  
18 §4.1（Preview 連鎖許可）に該当する。  
Observer の出力は副作用のない提案であり、  
Organizer がそれを入力として受け取ることは安全である。

### 4.3 人間からの明示的指示

| 入力 | 説明 |
|------|------|
| 「この Node を分解して」 | 特定 Node の分解を依頼する |
| 「最近の Node を整理して」 | 机の上の全体整理を依頼する |
| 「この 3 件は関連ある？」 | 特定 Node 群の関連分析を依頼する |

Organizer は人間の指示に応じて動作する。  
自発的に（バッチ的に）動く場合もあるが、  
出力は常に提案であり、実行はしない。

---

## 5. 出力

### 5.1 OrganizerReport 型

Organizer の出力は **OrganizerReport** 型で統一する。

```
OrganizerReport {
  // 分解提案（大きな Node の子 Node 案）
  decomposition_proposals: [
    {
      target_node_id: string
      target_title: string
      reason: string              // なぜ分解が必要か
      suggested_children: [
        {
          title: string
          context: string         // 子 Node の途中内容
          suggested_status: string // 初期 status の提案
        }
      ]
    }
  ]

  // グループ化提案（関連する Node の集約案）
  grouping_proposals: [
    {
      group_label: string         // グループの名前（提案）
      reason: string              // なぜこのグループか
      node_ids: string[]          // 含まれる Node の ID
    }
  ]

  // 関連検出（Node 間の意味的つながり）
  relation_proposals: [
    {
      from_node_id: string
      to_node_id: string
      relation_type: string       // "same_topic" / "depends_on" / "related" 等
      reason: string              // なぜ関連があるか
    }
  ]

  // 全体要約
  summary: string                 // 机の上の構造的な概観
}
```

### 5.2 出力は「提案」であり「確定」ではない

OrganizerReport のすべてのフィールドは**提案（proposal）**である。

| フィールド | 提案であること | 確定ではないこと |
|-----------|-------------|----------------|
| `decomposition_proposals` | 「こう分けられそう」 | 子 Node は作成されていない |
| `grouping_proposals` | 「これらは近い」 | グループは DB に存在しない |
| `relation_proposals` | 「関連がありそう」 | relations は書き込まれていない |
| `summary` | 「全体像はこう見える」 | 事実の確定ではない |

### 5.3 「整理」と「判断」の境界

Organizer が出力してよいのは**構造の提案**であり、  
**行動の指示**ではない。

| OK（整理） | NG（判断） |
|-----------|-----------|
| 「この Node は 3 つに分けられそうです」 | 「この Node を 3 つに分けてください」 |
| 「A と B は同じ案件に関連しています」 | 「A と B をまとめるべきです」 |
| 「この 5 件は講演準備に関するものです」 | 「講演準備を優先してください」 |
| 「この Node は大きすぎて再開しにくいかもしれません」 | 「この Node は分解が必要です」 |

**基準**：出力に「〜べき」「〜してください」「〜が必要です」が含まれたら、  
それは判断であり、Organizer の責務を超えている。  
「〜かもしれません」「〜できそうです」「〜に見えます」に留める。

---

## 6. 処理フロー

### 6.1 分解提案フロー

```
1. GET /dashboard/active でアクティブ Node を取得
2. 各 Node の context 長・子 Node 数・status を分析
3. 「再開しにくそう」な Node を検出
   （context が長い / next_action が不明確 / CLARIFYING のまま長期間）
4. 該当 Node に対して分解案（3〜7 個の子 Node）を構成
   ※ 14_Prompt_Pack.md §7 の Decomposition Prompt の基準に準拠
5. OrganizerReport.decomposition_proposals に格納
6. 人間 UI に返す
```

### 6.2 グループ化・関連検出フロー

```
1. GET /dashboard/active でアクティブ Node を取得
2. 各 Node の title / context をもとに意味的な近さを分析
3. 近い Node をグループ化候補として検出
4. Node 間の依存・参照関係を推定
5. OrganizerReport.grouping_proposals / relation_proposals に格納
6. 人間 UI に返す
```

### 6.3 フローの中で「やらない」こと

| ステップ | やること | やらないこと |
|---------|---------|------------|
| Node 取得 | 読み取り | Node の作成・更新 |
| 分析 | context / status の比較 | status の変更 |
| 分解案構成 | 子 Node の title / context 案を生成 | `POST /nodes/{id}/children` の呼び出し |
| グループ化 | 関連の検出 | relations の DB 書き込み |
| 要約 | 全体像のテキスト構成 | 優先順位の確定 |

---

## 7. 人間 UI との関係

### 7.1 surfacing の方法

| OrganizerReport の要素 | UI での表示 |
|----------------------|-----------|
| `decomposition_proposals` | 該当 Node の詳細パネルに「分解提案あり」バッジ。展開すると子 Node 案が表示される |
| `grouping_proposals` | ダッシュボードに「グループ提案」セクション。関連する Node がハイライトされる |
| `relation_proposals` | Node 詳細パネルの「関連 Node」欄に「提案」マーク付きで表示 |
| `summary` | ダッシュボード上部の概況テキスト（Observer の summary を補完する位置） |

### 7.2 人間の応答パターン

| 提案 | 人間の操作 | 結果 |
|------|-----------|------|
| 分解提案を承認 | 「この分解で実行」ボタン | `POST /nodes/{id}/children` が人間操作として呼ばれる |
| 分解提案を修正 | 子 Node 案を編集してから承認 | 修正後の内容で children が作成される |
| 分解提案を却下 | 無視 or 「不要」ボタン | 何も起きない |
| グループ提案を承認 | 「グループ化」ボタン（将来） | Node にタグ or 親 Node を設定（将来実装） |
| 関連提案を承認 | 「関連づける」ボタン（将来） | relations に記録（将来実装） |

**重要**：Organizer の提案から DB 変更に至るまでに、  
必ず人間の UI 操作が介在する。  
Organizer → DB 書き込みの直接経路は**存在しない**。

---

## 8. 「整理」と「判断」の境界を担保する仕組み

Organizer が「整理するが、決めない」を守る仕組みは、  
Observer と同じ 3 層構造に加え、**出力の語調ルール**を持つ。

### Layer 1：Skill 呼び出し制限（Observer と同一）

Organizer は Preview / 読み取りのみ呼べる。  
Apply / POST / PATCH へのアクセスは設計上排除されている。

### Layer 2：出力型の制約

OrganizerReport 型は「提案（proposals）」フィールドのみを持つ。  
「実行（executions）」「確定（confirmations）」に対応するフィールドがない。  
すべての出力が proposals / suggested として表現され、  
人間が承認するまで DB に何も起きない。

### Layer 3：UI 経由の実行フロー

分解・グループ化・関連づけが DB に反映されるには、  
必ず人間の UI 操作（ボタンクリック）を経由する。

### Layer 4：語調ルール（Level 1 特有）

Observer は事実ベース（「冷えています」「推定は X です」）なので  
判断と混同されにくい。  
Organizer は構造を提案するため、  
出力が「それっぽい結論」に見えるリスクがある。

このリスクを抑えるための語調ルール：

| 使ってよい表現 | 使ってはいけない表現 |
|--------------|-------------------|
| 「〜に見えます」 | 「〜です」（断定） |
| 「〜できそうです」 | 「〜すべきです」（指示） |
| 「〜かもしれません」 | 「〜が必要です」（判断） |
| 「〜として整理できます」 | 「〜に決めました」（確定） |
| 「〜という関連がありそうです」 | 「〜は関連しています」（事実化） |

**判定基準**：  
出力テキストを読んだ人間が  
「もう整理は終わった」と感じたら、それは語調の越境。  
「こういう整理の仕方もある」と感じるなら、正しい語調。

---

## 9. Observer との連携パターン

Organizer は Observer の出力を入力として使えるが、  
Observer を「置き換える」ものではない。

### 9.1 協調パターン

```
Observer → ObserverReport（個別 Node の状態観測）
              ↓
Organizer → OrganizerReport（Node 群の構造整理）
              ↓
人間 UI → 両方を組み合わせて表示
```

### 9.2 役割の重複がない理由

| 出力 | Observer が出す | Organizer が出す |
|------|---------------|-----------------|
| 「この Node は COOLING では？」 | Yes | No |
| 「この 3 件は関連している」 | No | Yes |
| 「この Node は大きすぎる」 | No | Yes |
| 「次にやるのはこれ」 | Yes | No |
| 「こう分解できそう」 | No | Yes |
| 「全体の概況」 | Yes（状態ベース） | Yes（構造ベース） |

唯一重複しうるのは「全体の概況」だが、  
Observer は「何が動いて何が冷えているか」、  
Organizer は「何がまとまっていて何が散在しているか」  
と観点が異なるため、補完関係にある。

---

## 10. 将来の拡張

### 10.1 Organizer が使える Skill が増えた場合

新しい読み取り系 Skill（GET /nodes/{id}/context 等）が追加された場合、  
Organizer は読み取りモードで利用してよい。  
書き込み系 Skill は Level に関わらず禁止のまま。

### 10.2 Organizer の出力を他のサブエージェントが使う場合

OrganizerReport を Advisor（Level 2）が入力として使い、  
分解案をさらに詳細化することは許可する。  
ただし Advisor も Apply は呼べない。

### 10.3 他の Level 1 エージェントを設計するとき

本ドキュメントを**テンプレート**として使う。  
以下のセクションを同じ構造で記述すること。

| セクション | 必須内容 |
|-----------|---------|
| §1 定義 | 役割 / やること / やらないこと / Observer との違い |
| §2 ガバナンス対応 | 18 / 20 との対応表 |
| §3 Skill 利用 | 許可リスト / 禁止リスト |
| §4 入力 | 直接入力 / 間接入力 / 人間からの指示 |
| §5 出力 | 型定義 / 「提案であり確定ではない」の明示 / 語調ルール |
| §6 処理フロー | 基本フロー / 「やらないこと」 |
| §7 人間 UI との関係 | surfacing / 応答パターン |
| §8 境界の担保 | 3+1 層の構造的ガード |

---

## 11. この文書の位置づけ

本ドキュメントは、

- context-os 初の Level 1 サブエージェント設計書
- 将来の Level 1 エージェント設計テンプレート
- 20_SubAgent_Catalog.md §4 の具体化
- 19_SubAgent_Observer.md との差分定義

として機能する。

Organizer に迷った場合は、  
**「これは整理か、判断か？」**  
を判断基準とする。  
Organizer の出力に「判断」は存在しない。
