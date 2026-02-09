# 14_Prompt_Pack.md  
## Domain Model Specification for context-os

---
```md
# 14_Prompt_Pack.md
## Prompt Pack for context-os（外部ワーキングメモリOS）
---
## 0. この文書の目的
本ドキュメントは、context-osを構成・運用するための
**標準プロンプト集（Prompt Pack）**である。
プロンプトは以下の役割を担う。
- 思考の入口を作る
- 状態（status）を判断する
- 温度（temperature）を判断する
- 思考・作業の再開を支援する
- 分解・委任・判断を促進する
本ドキュメントは以下を前提とする。
- 00_Vision_NorthStar.md
- 01_PRD.md
- 04_Domain_Model.md
- 05_State_Machine.md
- 06_Temperature_Spec.md
---
## 1. プロンプト設計の基本原則
1. プロンプトは「命令」ではなく「役割定義」
2. 判断基準はすべて設計Markdownに委譲する
3. プロンプトは短く、再利用可能であること
4. AIは勝手に概念を増やさない
5. 迷った場合は「再開しやすさ」を最優先する
---
## 2. 思考の入口（Capture）
### 2.1 雑な入力をNode化する
**用途**
- 思いつき
- 愚痴
- 途中の考え
- 「あとで考える」系入力
**Prompt**
```
以下の入力を、context-osのNodeとして整理してください。
前提：
* /docs/00_Vision_NorthStar.md
* /docs/04_Domain_Model.md
* /docs/05_State_Machine.md
ルール：
* Nodeは1つだけ作成する
* status は CAPTURED にする
* 分解・判断・提案は行わない
* 思考の途中が分かるように context を残す
入力：
{{USER_INPUT}}
```
---
## 3. 状態推定（Status Estimation）
### 3.1 Nodeのstatusを推定する
**用途**
- Node新規作成時
- context更新時
- 定期的な再評価
**Prompt**
```
以下のNodeについて、最も適切な status を1つ推定してください。
参照：
* /docs/05_State_Machine.md
条件：
* status は必ず定義済みのものから選ぶ
* temperature とは混同しない
* 人が読んで納得できる状態名にする
* 迷った場合は CLARIFYING または READY を選ぶ
Node：
{{NODE_JSON}}
出力：
* status
* 理由（1〜2行）
```
---
## 4. 温度推定（Temperature Estimation）
### 4.1 temperature を更新する
**用途**
- 定期バッチ
- Node更新時
- 外部イベント発生時
**Prompt**
```
以下のNodeについて、temperature（0〜100）を推定してください。
参照：
* /docs/06_Temperature_Spec.md
考慮する要素：
* 最終更新日時
* 最近の言及・編集
* 現在の status
* 期限・予定の有無
* 外部イベントの有無
Node：
{{NODE_JSON}}
出力：
* temperature（数値）
* 上昇または低下の理由（簡潔に）
```
---
## 5. 再開支援（Resume）
### 5.1 「今なにやる？」に答える
**用途**
- 着席時
- 日次レビュー
- 思考が止まったとき
**Prompt**
```
以下のNode一覧をもとに、
「今なにやる？」に対する最適な答えを1つ提示してください。
参照：
* /docs/00_Vision_NorthStar.md
* /docs/05_State_Machine.md
* /docs/06_Temperature_Spec.md
条件：
* Nodeは1つだけ選ぶ
* なぜ今それなのかを説明する
* 次の一手は具体的・小さくする
Nodes：
{{ACTIVE_NODE_LIST}}
出力：
* 選んだNode
* 理由
* 次の一手
```
---
## 6. 冷却確認（Cooling Check）
### 6.1 冷えてきたNodeを確認する
**用途**
- temperature低下時
- 定期チェック
**Prompt**
```
以下のNodeは temperature が低下しています。
参照：
* /docs/06_Temperature_Spec.md
このNodeについて、
人に確認すべきかどうかを判断し、
適切な確認メッセージを生成してください。
Node：
{{NODE_JSON}}
出力：
* 確認が必要か（Yes / No）
* 確認メッセージ（1文）
```
---
## 7. 分解支援（Decomposition）
### 7.1 Nodeを子Nodeに分解する
**用途**
- 大きすぎて再開できないNode
- 次の一手が見えないNode
**Prompt**
```
以下のNodeを、再開しやすい最小単位に分解してください。
参照：
* /docs/04_Domain_Model.md
* /docs/05_State_Machine.md
条件：
* 子Nodeは3〜7個まで
* すべて Node として扱う
* 親Nodeは残す
* 実行順が分かるようにする
Node：
{{NODE_JSON}}
出力：
* 子Node一覧（title + 役割）
```
---
## 8. 委任判断（Delegation）
### 8.1 実行主体を判断する
**用途**
- 判断疲れ防止
- AI活用ポイント抽出
**Prompt**
```
以下のNodeについて、
実行主体として最も適切なものを選んでください。
選択肢：
* Human
* AI
* Self
参照：
* /docs/05_State_Machine.md
条件：
* 実行主体は1つだけ選ぶ
* 委任する場合は status を DELEGATED とする
Node：
{{NODE_JSON}}
出力：
* 実行主体
* 理由
```
---
## 9. 判断支援（Decision Support）
### 9.1 NEEDS_DECISION の整理
**用途**
- 判断停滞の解消
- 思考の再開
**Prompt**
```
以下のNodeは意思決定待ちです。
参照：
* /docs/05_State_Machine.md
このNodeについて、
判断を進めるための整理を行ってください。
Node：
{{NODE_JSON}}
出力：
* 選択肢
* 判断観点
* 次に決めるべきこと
```
---
## 10. 本プロンプト集の位置づけ
本Prompt Packは、
- 実装時の標準プロンプト
- MCPツール呼び出し前の判断
- context-osの思考インターフェース
として使用される。
プロンプトを変更する場合は、
必ず参照ドキュメントとの整合性を確認すること。
```
--- 


