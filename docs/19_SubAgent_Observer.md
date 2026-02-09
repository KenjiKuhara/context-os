# 19_SubAgent_Observer.md
## SubAgent 設計：Observer（観測・提案エージェント）

---

## 0. この文書の目的

本ドキュメントは、context-os における最初のサブエージェントである  
**Observer** の役割・制約・Skill 利用ルールを定義する。

Observer は **「考えるが、決めない」** エージェントである。

本ドキュメントは以下を前提とする。

- 00_Vision_NorthStar.md §5.4 — AI は管理者、人は最終責任者
- 10_Architecture.md §2.2 — LLM は status/temperature を確定しない
- 10_Architecture.md §3.2 — AI に考えさせるが、決めさせない
- 17_Skill_EstimateStatus.md — estimate-status Skill Contract
- 18_Skill_Governance.md — Skill ガバナンス共通ルール

---

## 1. Observer とは何か

### 1.1 一言での定義

Observer は、  
**Node の状態を観測し、人間が再開判断しやすい提案を構成する**  
サブエージェントである。

### 1.2 Observer がやること

- アクティブな Node 群の status と temperature を観測する
- 各 Node について「次の状態はこれでは？」という推定を行う
- 冷えている Node を検知し、人間に確認を促す
- 「今なにやる？」の回答材料を構成する

### 1.3 Observer が絶対にやらないこと

- **Apply を呼ばない**（status を確定しない）
- DB に直接書き込まない
- Node を作成・削除しない
- 人間に代わって判断を確定しない

### 1.4 なぜ Observer が必要か

00_Vision §4（北極星）は、context-os が以下を提示できることを求めている。

- 動いているもの
- 止まっている理由
- 確認待ち
- 冷えているが重要なもの
- 次にやる一手

これらは Node の現在状態を「見る」だけでは構成できない。  
**Node を観測し、分析し、意味づけし、整理する**存在が必要であり、  
それが Observer の役割である。

---

## 2. 18_Skill_Governance.md との対応

Observer は 18_Skill_Governance.md のルールに**完全に従う**。

| ガバナンスルール | Observer の振る舞い |
|----------------|-------------------|
| §2.1 Preview は無制限 | Observer は Skill の Preview のみを使用する |
| §2.2 Apply は人間確認必須 | Observer は Apply を**一切呼ばない** |
| §3 source + confirmation | Observer は Apply しないため source/confirmation を送信しない |
| §4.1 Preview 連鎖は許可 | Observer は複数 Skill の Preview を組み合わせてよい |
| §4.2 Apply 連鎖は禁止 | Observer は Skill の Apply を連鎖呼び出ししない |
| §4.3 提案の返却 | Observer の出力は常に「人間への提案」である |

Observer は 18 §2.2 の原則を最も純粋に体現するエージェントであり、  
**Apply 権限を持たないことが設計の中核**である。

---

## 3. 呼び出してよい Skill

### 3.1 許可される Skill 呼び出し

| Skill | モード | 用途 |
|-------|--------|------|
| `estimate-status` | **Preview のみ** | Node の現在 status に対して「次はこの状態では？」と推定候補を取得する |
| `GET /dashboard/active` | 読み取り | アクティブ Node の一覧を取得する |
| `GET /dashboard/cooling` | 読み取り（将来） | 冷却候補 Node を取得する |
| `GET /nodes/{id}` | 読み取り（将来） | 個別 Node の詳細（context / history / temperature）を取得する |

### 3.2 禁止される Skill 呼び出し

| 操作 | 禁止理由 |
|------|---------|
| `estimate-status` の **Apply mode** | status 確定は人間の責務（18 §2.2） |
| `POST /nodes` | Node 作成は Capture の責務。Observer は観測専門 |
| `PATCH /nodes/{id}` | Node 更新は人間または Capture の責務 |
| `POST /nodes/{id}/children` | Node 分解は人間の判断を経るべき |
| `POST /nodes/{id}/delegate` | 委任は人間の判断を経るべき |
| DB への直接クエリ | 10_Architecture §2.2「DB を直接触らない」 |

---

## 4. 入力と出力

### 4.1 Observer への入力

Observer は以下の情報を入力として受け取る。

| 入力 | 取得元 | 説明 |
|------|--------|------|
| アクティブ Node 一覧 | `GET /dashboard/active` | 机の上にある Node の snapshot |
| 各 Node の status 推定候補 | `estimate-status` Preview | 「次はこの状態では？」の候補と理由 |
| 各 Node の temperature | dashboard レスポンス内 | 冷却検知の材料 |
| 現在時刻 | システム | 経過日数の計算に使用 |

### 4.2 Observer の出力

Observer は **「提案」のみを出力する**。  
出力は人間に直接提示されるか、UI が整形して表示する。

```
ObserverReport {
  // 「今なにやる？」の回答材料（00_Vision §4）
  suggested_next: {
    node_id: string
    title: string
    reason: string         // なぜこれを今やるべきか
    next_action: string    // 次の一手（具体的・小さく）
  } | null

  // status 変更の提案一覧
  status_proposals: [
    {
      node_id: string
      title: string
      current_status: string
      suggested_status: string
      reason: string       // なぜこの遷移を提案するか
    }
  ]

  // 冷却確認が必要な Node
  cooling_alerts: [
    {
      node_id: string
      title: string
      temperature: number
      last_updated: string
      message: string      // 人間への確認メッセージ
    }
  ]

  // 観測サマリ（概況）
  summary: string          // 「机の上の全体像」の一文
}
```

### 4.3 出力は決して「確定」ではない

Observer の出力はすべて**提案（proposal）**である。

- `suggested_next` は「これをやるべき」ではなく「これがよさそう」
- `status_proposals` は「こう変えるべき」ではなく「こう変わったのでは？」
- `cooling_alerts` は「削除すべき」ではなく「止めていいですか？」

人間がこの提案を読み、判断し、必要なら Apply を行う。  
Observer は判断の結果を知る必要がない。

---

## 5. 処理フロー

### 5.1 基本フロー

```
1. GET /dashboard/active でアクティブ Node を取得
2. 各 Node に対して estimate-status Preview を呼ぶ
   → 推定候補と理由を取得
3. temperature と updated_at から冷却候補を検知
4. 全体を分析し、ObserverReport を構成
5. ObserverReport を人間 UI に返す
```

### 5.2 フローの中で「やらない」こと

| ステップ | やること | やらないこと |
|---------|---------|------------|
| 1. Node 取得 | 読み取り | フィルタ条件の独自追加 |
| 2. status 推定 | Preview 呼び出し | Apply 呼び出し |
| 3. 冷却検知 | temperature 観測 | temperature 更新 |
| 4. レポート構成 | 提案の文章化 | 判断の確定 |
| 5. UI に返す | 提案の提示 | 提案の自動実行 |

---

## 6. 人間 UI との関係

### 6.1 surfacing の方法

Observer の出力（ObserverReport）は、  
人間 UI（ダッシュボード）で以下の形で提示される。

| ObserverReport の要素 | UI での表示 |
|----------------------|-----------|
| `suggested_next` | 「次にやること」ブロック（North Star §4 対応） |
| `status_proposals` | 各 Node の詳細パネルに「提案」バッジとして表示 |
| `cooling_alerts` | 冷却トレーに「確認が必要」マークとして表示 |
| `summary` | ダッシュボード上部の概況テキスト |

### 6.2 人間の応答パターン

Observer の提案に対して、人間は以下の操作を行う。

| 提案 | 人間の操作 | 実行される Skill |
|------|-----------|----------------|
| status 変更提案を承認 | 「この状態にする」ボタン | estimate-status Apply（human_ui） |
| status 変更提案を却下 | 「違う」→ 別候補を選ぶ or 無視 | estimate-status Apply or なし |
| 冷却確認に回答 | 「止めていい」「まだ必要」 | estimate-status Apply (CANCELLED) or なし |
| suggested_next を受け入れ | 該当 Node をクリック | UI 遷移のみ（Skill 不要） |

**重要**：Observer の提案から Apply に至るまでに、  
必ず人間の UI 操作（ボタンクリック）が介在する。  
Observer → Apply の直接経路は**存在しない**。

---

## 7. 「考えるが、決めない」の構造的担保

Observer が「考えるが、決めない」を守る仕組みは、  
以下の 3 層で構造的に担保されている。

### Layer 1：Skill 呼び出し制限

Observer は estimate-status の **Preview のみ**を呼べる。  
Apply エンドポイントへのアクセスは設計上排除されている。  
（§3.2 の禁止リスト）

### Layer 2：出力形式の制約

Observer の出力は **ObserverReport 型** に限定される。  
この型は「提案」のフィールドのみを持ち、  
「確定」「適用」「実行」に対応するフィールドを持たない。  
（§4.2 / §4.3）

### Layer 3：UI 経由の確定フロー

Observer の提案が status 変更に至るには、  
必ず人間 UI での操作を経由する。  
Observer → estimate-status Apply の直接経路は設計上存在しない。  
（§6.2）

この 3 層のいずれが欠けても「AI が決める」経路が開くため、  
3 つすべてを維持することが設計上の要件である。

---

## 8. 将来の拡張

### 8.1 Observer が使える Skill が増えた場合

新しい Skill が追加された場合（estimate-temperature 等）、  
Observer は **Preview / 読み取りモードのみ** を利用してよい。  
18_Skill_Governance.md §4.1（Preview 連鎖許可）に従う。

### 8.2 Observer の出力を他のサブエージェントが使う場合

ObserverReport を別のサブエージェント（例：Resume Agent）が  
入力として使うことは許可する。  
ただし、そのエージェントも Apply を直接呼ぶことはできない。  
提案は最終的に人間に返す。

### 8.3 Observer の実行トリガー

| トリガー | 説明 | 優先度 |
|---------|------|--------|
| 人間が「今なにやる？」と聞いたとき | 明示的な起動 | MVP |
| ダッシュボードを開いたとき | 暗黙的な起動 | MVP |
| 定期バッチ（5分/15分/1時間等） | 自動的な観測 | Phase 2 |
| 外部イベント発生時 | 再燃トリガー | Phase 3 |

いずれのトリガーでも、Observer は観測と提案のみを行い、  
Apply は行わない。

---

## 9. 他のサブエージェント設計時の参考

本ドキュメントは、context-os における  
**サブエージェント設計のテンプレート**として使える。

新しいサブエージェントを設計する場合、  
以下のセクションを同じ構造で記述すること。

| セクション | 必須内容 |
|-----------|---------|
| §1 定義 | 一言での役割定義 / やること / やらないこと |
| §2 ガバナンス対応 | 18_Skill_Governance.md のどのルールに従うか |
| §3 Skill 利用 | 許可される Skill と禁止される Skill |
| §4 入出力 | 入力の取得元 / 出力の型 / 出力は提案であること |
| §5 処理フロー | 基本フローと「やらない」ことの明示 |
| §6 人間 UI との関係 | surfacing 方法と人間の応答パターン |
| §7 構造的担保 | 「考えるが、決めない」をどの層で守るか |

### 判断基準

新しいサブエージェントを追加するとき、必ず以下を問う。

> **「このエージェントは、人間がいなくても安全か？」**

- Yes → Preview / 読み取りのみ使う Observer 型
- No → Apply 経路がある。18 §3 のガードが必要

> **「このエージェントの出力は、そのまま確定されて困らないか？」**

- Yes → 出力が提案ではなく確定になっている。設計を見直す
- No → 正しい設計。提案として人間に返す

---

## 10. この文書の位置づけ

本ドキュメントは、

- context-os 初のサブエージェント設計書
- 将来のサブエージェント設計テンプレート
- 18_Skill_Governance.md の適用例

として機能する。

Observer に迷った場合は、  
**「これは提案か、確定か？」**  
を判断基準とする。  
Observer の出力に「確定」は存在しない。
