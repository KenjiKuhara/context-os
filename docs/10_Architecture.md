# 10_Architecture.md
## Architecture Specification for context-os（外部ワーキングメモリOS）

---

## 0. この文書の目的

本ドキュメントは、context-osの  
**全体アーキテクチャ（構成要素・責務・接続関係）** を定義する。

目的は以下の通り。

- 「どこで何を判断するか」を明確にする
- AIがやりすぎない／足りなさすぎない境界を作る
- 将来拡張しても思想が壊れない構造を確保する

本ドキュメントは以下を前提とする。

- 00_Vision_NorthStar.md  
- 01_PRD.md  
- 04_Domain_Model.md  
- 05_State_Machine.md  
- 06_Temperature_Spec.md  
- 09_API_Contract.md  
- 14_Prompt_Pack.md  

---

## 1. 全体構成（レイヤー分離）

context-osは、以下の5レイヤーで構成される。

```

[ User ]
↓
[ ChatGPT / LLM ]
↓ (MCP)
[ Application Server ]
↓
[ Database / Storage ]
↓
[ External Services ]

```

---

## 2. 各コンポーネントの責務

### 2.1 User（人間）

**役割**
- 思考・愚痴・途中案を投げる
- AIの提案を読む
- 判断・修正を行う

**重要な前提**
- 人は「管理」しない
- 人は「再開」するだけ

---

### 2.2 ChatGPT / LLM（司令塔）

**役割**
- 会話インターフェース
- Prompt Pack に基づく判断
- API呼び出しの意思決定

**やること**
- Node化（Capture）
- 状態・温度の推定
- 再開支援・質問生成

**やらないこと**
- DBを直接触らない
- status / temperature を確定しない
- 永続データを持たない

---

### 2.3 MCP（外部操作ブリッジ）

**役割**
- LLMから外部世界への「手」

**特徴**
- ステートレス
- 単機能
- 副作用を持つ操作のみを担当

**代表的な操作**
- Node作成
- Node更新
- 子Node作成
- ダッシュボード取得
- ChatWork連携（将来）

---

### 2.4 Application Server（中枢）

**想定**
- Vercel + API Routes
- または軽量BFF

**役割**
- ビジネスルールの唯一の実行場所
- 状態遷移・温度確定
- 監査ログの保持

**責務（重要）**
- status / temperature の最終決定権を持つ
- 不正な遷移を防ぐ
- Domain Model を守る

---

### 2.5 Database / Storage（外部記憶）

**想定**
- Supabase（PostgreSQL）

**役割**
- Nodeの永続化
- 履歴・イベント保存
- 再開可能性の担保

**原則**
- DBは賢くならない
- 判断ロジックは持たない

---

### 2.6 External Services（外部世界）

**例**
- ChatWork
- Google Calendar
- メール
- Notion（将来）

**位置づけ**
- 通知
- トリガー
- 文脈の再点火

---

## 3. 責務分離の原則（超重要）

### 3.1 判断の所在

| 判断内容 | 担当 |
|---|---|
| 思考の意味づけ | AI |
| 状態の提案 | AI |
| 状態の確定 | App |
| 温度の算出 | App |
| 再開の提案 | AI |
| 実行 | 人 or AI |

---

### 3.2 なぜAIに確定させないか

- 説明責任が持てない
- 将来のルール変更に弱い
- 「なんとなく正しい」が積み重なる

context-osは  
**AIに考えさせるが、決めさせない**  
構造を取る。

---

## 4. 代表的な処理フロー

### 4.1 思考のCapture

1. 人が雑に入力
2. ChatGPTが Capture Prompt 実行
3. MCP経由で POST /nodes
4. Appが CAPTURED Node を保存

---

### 4.2 再開（今なにやる？）

1. 人が「今なにやる？」
2. ChatGPTが GET /dashboard/active
3. Resume Prompt 実行
4. 次の一手を提示

---

### 4.3 冷却確認

1. 定期バッチ or イベント
2. Appが temperature 低下検知
3. ChatGPTが Cooling Prompt 実行
4. 人に確認メッセージ提示

---

## 5. 将来拡張に耐える理由

- Nodeは1種類
- 状態と温度は別軸
- 判断と確定を分離
- 外部連携は周辺化

このため、

- AIを差し替えられる
- UIを増やせる
- 対象業務を変えられる

---

## 6. このアーキテクチャの思想

context-osは、

- AI中心でもなく
- 人中心でもなく

**「再開中心」** のアーキテクチャである。

この構成は、
思考を途中で止めても、
必ず続きを始められることを最優先する。

---

## 7. 本ドキュメントの位置づけ

本Architectureは、

- 実装時の責務分担の基準
- MCPツール設計の前提
- 障害・迷走時の立ち返り先

として使用される。

構成に迷った場合は、

**「それは再開に必要か？」**

を判断基準とする。

