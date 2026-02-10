# 42 — Phase 4 E2E 動作確認チェックリスト

## 1. 概要

このチェックリストは **Phase 4**（Organizer / Advisor の提案生成から、Advisor の Apply（ステータス変更）まで）を、**E2E（End-to-End＝最初から最後まで一連の流れで）** 手動で確認するための台本です。誰が実行しても同じ手順で再現でき、失敗したときに「どこで落ちたか」を切り分けられることを目的としています。

**対象範囲**

- 提案パネル（Proposal Panel）の **Organizer タブ**：提案生成・rendered 表示・warnings/errors 表示
- 提案パネルの **Advisor タブ**：提案生成（focusNode 指定あり/なし）、案選択、選択中の案の sticky 表示、**Apply**（confirmations → estimate-status）、refresh 後の最新 status 表示、二重実行防止、段階別エラー表示
- **Organizer の Apply**：現時点では **未実装** のため、本チェックリストの対象外です。

**前提条件**

- **OPENAI_API_KEY** が設定されている（Organizer/Advisor の LLM 呼び出しに必須）
- ダッシュボードに **1 件以上 Node が存在**する（Advisor は「対象 Node」がないと errors になる）
- 利用するユーザーに、ダッシュボード閲覧・Node 操作・API 呼び出しの **権限** がある
- **ネットワーク** が利用可能（API とフロントが通信できること）

---

## 2. 事前準備（Prerequisites）

### 環境変数

| 環境     | 設定場所・例 |
|----------|----------------|
| ローカル | プロジェクトルートの `.env.local` に `OPENAI_API_KEY=sk-...` を記載 |
| 本番等   | Vercel の Dashboard → Project → Settings → Environment Variables で `OPENAI_API_KEY` を設定 |

- 未設定の場合：Organizer/Advisor の「提案を生成」で API エラーになり、errors 表示や「Request failed」などが出ます。

### データ前提

- **対象 Node が 1 件もない** 状態で Advisor を実行すると、`validNodeIds` が空になり、validator で errors になるか、サーバ側で「対象がありません」に近い結果になります。**事前にダッシュボードに少なくとも 1 件は Node がある状態**にしてください。
- Apply を試す場合は、**状態マシンで遷移可能な status** の Node を対象にするとよいです（例：IN_PROGRESS → DONE など）。

---

## 3. チェック対象機能一覧

- **Advisor 提案生成**：focusNodeId 指定あり（ドロップダウンで Node を選ぶ）／未指定（サーバが 1 件目を自動選択）
- **Advisor 案選択**：カードの「この案で進める」で 1 案を選択
- **選択中の案**：下部の緑枠で sticky 表示（迷子防止）
- **Apply**：confirmations API → estimate-status API の順で実行し、Node の status を変更
- **Apply 後の refresh**：`onRefreshDashboard()` で一覧更新し、成功メッセージに「現在: 最新status」を表示
- **二重実行防止**：`applyInFlightRef` により Apply 連打・二重クリックで二重実行されない
- **warnings / errors 表示**：Organizer/Advisor ともに warnings は折りたたみ、errors はリスト表示
- **段階別エラー表示**：confirmations 失敗／estimate-status 失敗／ネットワークエラーを区別して表示

---

## 4. E2E テストケース

以下の表は、**Case ID・シナリオ・手順・期待結果・失敗時の切り分け** をセットで記載しています。

| Case ID | シナリオ | 手順（番号付き） | 期待結果 | 失敗したときの切り分け |
|---------|----------|------------------|----------|------------------------|
| **TC-A1** | Advisor 提案生成（focusNodeId 指定あり） | 1. ダッシュボードを開き、提案パネルを表示する<br>2. **Advisor** タブをクリックする<br>3. 「対象 Node」ドロップダウンで **特定の 1 件** を選ぶ<br>4. （任意）ユーザー意図を入力する<br>5. **「Advisor提案を生成」** ボタンをクリックする | ローディング後、提案が表示される（summary・まず決めること・複数案のカード）。検証エラーがなければ errors は出ず、rendered またはカードが表示される。 | ブラウザのネットワークタブで `POST /api/advisor/run` のレスポンスを確認。`ok: false` なら `errors` の中身を確認。サーバログで `runAdvisorPipeline` の attempt/final を確認。 |
| **TC-A2** | Advisor 提案生成（focusNodeId 未指定→自動選択） | 1. Advisor タブを開く<br>2. 「対象 Node」を **「— 未指定 —」** のままにする<br>3. **「Advisor提案を生成」** をクリックする | サーバが dashboard から 1 件目（または先頭）を自動で対象に選び、その Node 向けの提案が表示される。report の `targetNodeId` がその Node の id になっている。 | 同上。`targetNodeId` がレスポンスの report に含まれているか確認。対象 Node が 0 件だと errors になり得る。 |
| **TC-A3** | Advisor 案選択→選択中の案が sticky 表示される | 1. TC-A1 または TC-A2 で提案を表示した状態にする<br>2. いずれかの案カードの **「この案で進める」** をクリックする | 画面下部に緑枠の **「選択中の案」** が表示され、選んだ案のラベル・次の一手・必要情報・判断基準・リスクが固定表示される。スクロールしても下部に張り付く（sticky）。 | ProposalPanel の「選択中の案」ブロックがレンダーされているか確認。`selectedAdvisorOption` が設定されている状態。 |
| **TC-A4** | Advisor Apply（confirm OK）→ status が from→to に変わり、更新後に「現在: 最新status」が表示される | 1. 選択中の案が表示されている状態にする<br>2. 「Apply（ステータス変更）」内で **現在のステータス** を確認する<br>3. **変更先** ドロップダウンで別の status を選ぶ<br>4. **「Apply」** ボタンをクリックする<br>5. 確認ダイアログで **OK** を押す | ダイアログ：「Node {id} のステータスを {from} → {to} に変更します。よろしいですか？」で OK 後、処理中は「適用中…」となり、完了後に「適用しました（fromラベル→toラベル）。現在: 最新status（ラベル）」が表示される。ダッシュボードの一覧が更新され、該当 Node の status が変更後の値になっている。 | ネットワークで `POST /api/confirmations` と `POST /api/nodes/{id}/estimate-status` が 200/ok か確認。成功メッセージに「現在:」が出ない場合は refresh 失敗の可能性（「適用は成功しましたが、画面更新に失敗しました」が出る場合あり）。 |
| **TC-A5** | Advisor Apply（confirm キャンセル）→ 何も変わらない | 1. 選択中の案を表示し、変更先を選んで **「Apply」** をクリックする<br>2. 確認ダイアログで **キャンセル** を押す | Node の status は変わらない。成功メッセージは出ない。再度 Apply を押せる（inFlight が解除されている）。 | キャンセル後に Apply が再度押せること、およびネットワークタブで confirmations/estimate-status が呼ばれていないことを確認。 |
| **TC-A6** | Apply 連打／二重クリックしても二重実行されない | 1. 選択中の案を表示し、変更先を選ぶ<br>2. **「Apply」** を素早く **2 回以上** クリックする | 1 回目で確認ダイアログが出る。OK すれば 1 回だけ API が実行され、confirmation も 1 回だけ発行される。連打しても「適用中…」の間はボタンとドロップダウンが disabled で、二重に confirmations が飛ばない。 | ネットワークタブで `/api/confirmations` のリクエストが **1 回だけ** であることを確認。複数回出る場合は `applyInFlightRef` の二重ガードを確認。 |
| **TC-A7** | valid transitions のみがドロップダウン候補に出る | 1. 選択中の案を表示する<br>2. 「変更先」ドロップダウンを開く | 現在の status から **状態マシンで遷移可能な status だけ** が候補に出る（`getValidTransitions` の結果）。不正な遷移先はリストに含まれない。 | 05_State_Machine.md の遷移表と照合。`src/lib/status.ts`（stateMachine）の `getValidTransitions` と一致しているか確認。 |
| **TC-A8** | /api/confirmations が失敗した場合の表示（段階別エラー） | 1. confirmations が失敗する条件を用意する（例：サーバを止める、不正な body を送る、またはモックで 4xx/5xx を返す）<br>2. Apply を実行し、confirm で OK する | 短いメッセージとして **「確認IDの発行に失敗しました」** が表示される。「エラー詳細」を開くと、endpoint: `/api/confirmations`、HTTP status、response body（message/errors 等を整形したもの）が表示される。 | ProposalPanel の `applyError.stage === "confirmations"` の分岐。表示文言と折りたたみ内容が要件どおりか確認。 |
| **TC-A9** | /api/nodes/{id}/estimate-status が失敗した場合の表示（段階別エラー） | 1. estimate-status が失敗する条件を用意する（例：遷移不可の to を送る、サーバで 422 を返す）<br>2. Apply を実行し、confirm で OK する | 短いメッセージとして **「ステータス変更に失敗しました」** が表示される。「エラー詳細」を開くと、endpoint: `/api/nodes/{id}/estimate-status`、HTTP status、response body が表示される。 | `applyError.stage === "estimate"` の分岐。API のエラーレスポンスと表示が一致しているか確認。 |
| **TC-A10** | ネットワークエラー（fetch 失敗）時の表示 | 1. オフラインにする、または存在しない URL に飛ぶようにするなど、fetch が例外で落ちる状態にする<br>2. Apply を実行し、confirm で OK する | 短いメッセージとして **「通信に失敗しました。ネットワークを確認して再実行してください」** が表示される。「エラー詳細」を開くと、error.name・error.message・stack（あれば）が表示される。 | `applyError.stage === "network"` と `rawError` の表示。TypeError: Failed to fetch 等が詳細に出るか確認。 |
| **TC-G1** | Organizer 提案生成（ok=true で rendered 表示、warnings 折りたたみ） | 1. **Organizer** タブを開く<br>2. （任意）ユーザー意図を入力する<br>3. **「Organizer提案を生成」** をクリックする | 検証通過時、rendered テキストが表示される。warnings がある場合は「⚠ 警告 N 件（開く）」が表示され、開くと警告一覧が表示される。 | `POST /api/organizer/run` のレスポンスで `ok: true`、`warnings` の有無と UI の折りたたみが連動しているか確認。 |
| **TC-G2** | Organizer 提案生成（ok=false で errors 表示） | 1. Organizer タブで、validator が NG を返す条件（例：存在しない node_id を含む提案を返す LLM）で実行する、または API を直接叩いて `ok: false` のレスポンスを返す | パネルに **「検証エラー（不足している項目）」** と errors のリストが表示される。rendered は表示されない。 | `errors` 配列の内容がそのままリスト表示されているか。サーバログの validator 結果と一致するか確認。 |

**補足**

- Organizer の **Apply（ステータス変更）** は現時点では **未実装** です。上記ケースには含めていません。

---

## 5. 付録：確認に使うポイント

### UI で見る場所（ProposalPanel）

| 場所 | 内容 |
|------|------|
| タブ | 「Organizer」「Advisor」切り替え |
| Advisor タブ | 「対象 Node」ドロップダウン、「Advisor提案を生成」ボタン |
| 提案結果エリア | Organizer：rendered 本文 / 検証エラーリスト。Advisor：summary・next_decision・案カード（「この案で進める」） |
| 警告 | 「⚠ 警告 N 件（開く/閉じる）」で折りたたみ |
| 選択中の案（緑枠） | 選んだ案の要約。「Apply（ステータス変更）」ブロック：現在ステータス、変更先ドロップダウン、Apply ボタン、成功メッセージ／監査用詳細、エラー短メッセージ／エラー詳細（折りたたみ） |

### サーバログで見る場所

- **Organizer / Advisor run**：`runPipeline` の attempt ログ（何回目か）、final ログ（成功/失敗）、`retryCount`。
- **Apply**：`/api/confirmations` と `/api/nodes/{id}/estimate-status` のアクセスログ、estimate-status 内の遷移検証・history 記録。

### 重要なキー

- **report.targetNodeId**：Advisor の対象 Node ID。Apply はこの ID の Node に対して実行する。UI の focusNodeId よりこちらを正とする。
- **confirmation_id**：Apply 時に confirmations API で発行され、estimate-status に渡す。成功時は「監査用詳細」の折りたたみに表示される（追跡・監査用）。

---

## セルフレビュー（抜け漏れ確認）

- [x] 概要で Phase4 の範囲と前提を明記した
- [x] 事前準備で環境変数・データ前提を書いた
- [x] チェック対象機能を箇条書きで列挙した
- [x] E2E テストケースをテーブル形式（Case ID・シナリオ・手順・期待結果・切り分け）で書いた
- [x] TC-A1～TC-A10、TC-G1、TC-G2 をすべて含めた
- [x] Organizer Apply は未実装であることを明記した
- [x] 付録で UI・ログ・重要キーを記載した
- [x] 手順と期待結果をセットにし、表示文言の例を入れた

---

## このチェックリストで Phase4 の何が保証できるか（3 行まとめ）

1. **Organizer / Advisor の提案生成から表示まで**（focusNode 指定あり・なし、rendered・errors・warnings）が、手順どおりに動作し、失敗時にどこで止まったかを切り分けられる。
2. **Advisor の「案選択 → Apply → refresh → 最新 status 表示」** と、**二重実行防止・段階別エラー表示** が、意図した文言と挙動で確認できる。
3. **確認ポイント（UI・ログ・targetNodeId / confirmation_id）** を共有することで、誰でも同じ観点で再現テストと障害切り分けができる。
