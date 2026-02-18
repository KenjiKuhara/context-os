# 43 — Phase 4 完了サマリ

Phase 4 を「完了フェーズ」として整理し、何をやったか・何を保証したか・何をあえてやらなかったかを固定する。後から見て「なぜここで止めて次に進んだか」が分かるようにする。

---

## 1. Phase 4 の目的（Why）

### Organizer / Advisor を「使える形」にするとは何だったか

AI の出力を「それっぽいアドバイス」で終わらせず、**人間がそのまま判断・実行に結びつけられる提案**にすることだった。そのためには、

- **どの Node を指しているか** が一意に決まること
- **次の一手・必要情報・判断基準・リスク** が欠けていないこと
- **Must を満たさない出力はそのまま使わない** こと

が必要だった。Phase 4 では、40_proposal_quality.md で定義した「使える提案」を、**パイプライン（JSON → validator → 自己修正 → render）と UI・Apply まで一気通貫で実現する** ことを目的とした。

### なぜ validator / self-correction / Apply をここまでやったか

- **Validator**：Must 違反を機械判定し、「欠けている提案」を UI に渡さないゲートにするため。採点ではなく「通す／通さない」の線を引くため。
- **Self-correction**：LLM の一度きりの出力に頼らず、errors をプロンプトに戻して再生成させることで、**人間に何度もやり直させない**ため。
- **Apply**：Advisor の「この案で進める」が **画面だけの選択で終わらず、実際に Node の status が変わる** まで閉じるため。そのために confirmations → estimate-status の既存ゲートを使い、人間の Confirm を必須にした。

---

## 2. Phase 4 で実現したこと（What）

- **提案生成（Advisor / Organizer）**  
  POST /api/advisor/run、POST /api/organizer/run で dashboard を渡し、LLM 出力を JSON パースして返す。Advisor は focusNodeId 指定あり／未指定（サーバが 1 件目を自動選択）の両方に対応。
- **提案品質の保証（Must / Should / validator）**  
  40 で定義した Must を validator で機械判定。違反は errors で返し、Should は warnings。errors が 1 件以上なら「使わない」。
- **自己修正ループ**  
  errors がある場合、その内容をプロンプトに埋め込んで最大 2 回まで再生成。パース失敗時も同様。
- **UI での提案表示・案選択**  
  提案パネル（Organizer タブ / Advisor タブ）で rendered 表示、Advisor は複数案をカード表示し「この案で進める」で 1 案を選択。選択中の案は下部に sticky 表示（迷子防止）。
- **Advisor Apply（status 変更）**  
  選択中の案ブロック内で「変更先」を選び Apply。confirmations API で確認オブジェクト発行 → estimate-status API で遷移検証・適用・履歴記録。対象 Node は report.targetNodeId で一意に特定。
- **二重実行防止・confirm・refresh 反映**  
  クリック直後の ref による二重クリックブロック、confirm キャンセル時の解除、実行中は Apply UI 全体を disabled。成功後は onRefreshDashboard で一覧を更新し、成功メッセージに「現在: 最新 status」を表示。refresh 失敗時は「画面更新に失敗しました」を明示。
- **段階別エラー表示**  
  confirmations 失敗／estimate-status 失敗／ネットワークエラーを区別し、短いメッセージと折りたたみ詳細（endpoint・HTTP status・body 等）で切り分け可能にした。
- **E2E チェックリスト整備**  
  42_phase4_e2e_checklist.md で手順・期待結果・失敗時の切り分けを固定し、手動で再現確認できる台本を用意した。

---

## 3. Phase 4 で保証できること（Guarantees）

- **targetNodeId が必ず特定される**  
  Advisor の report にはサーバが必ず targetNodeId を設定する。focusNodeId 指定時はその Node、未指定時は dashboard から選んだ 1 件。validator で targetNodeId が validNodeIds に含まれることを Must で検証し、嘘の対象 ID を防ぐ。
- **valid transition 以外は Apply できない**  
  変更先ドロップダウンは状態マシンの getValidTransitions のみ。estimate-status API 側でも遷移ルールを検証するため、不正な遷移は通らない。
- **二重 Apply が起きない**  
  クリック直後に ref を立て、confirm 前でも二重クリックをブロック。confirm キャンセル時と API 完了後の finally で必ず ref を解除。
- **失敗時に「どこで落ちたか」が分かる**  
  confirmations / estimate-status / network の 3 段階でエラーを分け、短メッセージと折りたたみ詳細で endpoint・status・body や error 情報を表示。監査用に Apply 成功時の confirmation_id も折りたたみで表示。
- **手動 E2E で再現確認できる**  
  42 のチェックリストに沿えば、誰がやっても同じ手順で Phase 4 の範囲（Organizer 提案・Advisor 提案〜Apply〜refresh）を確認できる。

---

## 4. Phase 4 でやらなかったこと（Non-Goals）

- **Organizer の Apply**  
  分解案・グループ案・関連案は「差分プレビュー」や表示までで止め、DB への一括反映（子 Node 作成・relation 作成など）は実装していない。判断と実装コストを分離するため、ここでは「提案を見て人が判断する」までを完了とする。
- **status 以外の自動反映**  
  note の追記、relation の自動作成などは行わない。Phase 4 では「Advisor の 1 案を選ぶ → その Node の status だけを変える」にスコープを限定した。
- **完全自動化**  
  人間の Confirm（確認ダイアログと confirmations 経由の Apply）を必須にしている。AI の提案をそのまま DB に書かせず、「人が OK したときだけ」適用する設計を維持した。

---

## 5. 次フェーズ（Phase 5）への引き継ぎ

- **Organizer Apply をやる場合**  
  分解案の「子 Node 作成」、グループ案の「グループラベル付与」、関連案の「relation 作成」など、どの操作をどの API/トランザクションで行うかを設計する必要がある。confirmations と同様に「何を適用するか」を明示した確認オブジェクトを発行し、1 承認 1 適用に揃えるとよい。
- **判断ログ・履歴の扱い**  
  Phase 4 では node_status_history と confirmation_events で「誰がいつ何を承認したか」を残している。Phase 5 で Organizer や他機能の適用を増やす場合、同じ枠で履歴を残すか、別テーブルで「提案採用ログ」を扱うかを決める。
- **Advisor 提案から「次タスク生成」への拡張**  
  「この案で進める」の先に、選んだ案に応じた子タスクの自動作成や、次の Node の提案へつなぐフローを Phase 5 で検討できる。Phase 4 では「1 Node の status 変更」までで完了とした。

---

## 6. 完了宣言

**Phase 4 はここで完了とする。**

- 実現したこと：Organizer / Advisor の提案生成、品質保証（validator・自己修正）、UI での表示・案選択、Advisor Apply（status 変更）、二重実行防止・段階別エラー・refresh 反映、E2E チェックリストの整備。
- 保証したこと：targetNodeId の一意特定、valid transition のみの Apply、二重 Apply の防止、失敗時の切り分け、手動 E2E による再現確認。
- あえてやらなかったこと：Organizer Apply、status 以外の自動反映、完全自動化（人間の Confirm を必須に維持）。

以後、Organizer Apply・判断ログの拡張・Advisor からの次タスク生成などは **Phase 5** で扱う。Phase 4 の範囲の変更や不具合は、本サマリと 40 / 41 / 42 を参照して対応する。
