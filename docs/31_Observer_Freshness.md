# 31 — Observer 提案の鮮度（Freshness）

## 目的

Observer の提案が「今さっきの判断」か「数時間前」かを人が即判断できるようにし、本番運用での安心感を高める。

## 定義

- **鮮度（freshness）**: その提案が「いつ時点の観測に基づいているか」を示す情報。
- **observed_at**: 観測が完了した時点の UTC 日時（ISO 8601）。
- **freshness_minutes**: 表示時点から observed_at までの経過分数（表示側で「現在時刻 − observed_at」から計算する。payload に保存する場合はレポート作成時点では 0）。

## payload.meta

Observer が返すレポートの `payload` に `meta` を追加する。

```json
"meta": {
  "observed_at": "2026-02-10T07:24:04Z",
  "freshness_minutes": 0
}
```

- **observed_at**: 必須。観測完了時点の UTC ISO datetime。
- **freshness_minutes**: レポート作成時は 0。ダッシュボード等では表示時に「現在時刻 − observed_at」から再計算して表示に使う。

## 表示ルール（ダッシュボード）

| 経過時間           | 表示例       |
|--------------------|--------------|
| 0〜59 分           | 「最終観測：N分前」 |
| 1 時間〜24 時間未満 | 「最終観測：N時間前」 |
| 24 時間以上        | 「最終観測：N日以上前」 |

- 60 分以上の場合、メタ行に **「⚠ 少し古い提案です」** を薄いスタイル（グレー・イタリック）で追加表示する。
- この表示は **warnings とは別物**。warnings ブロックには含めず、判断ロジック（strict / 異常検知）にも使わない。あくまで「人が見て古さを把握するため」の表示である。

## warnings との関係

- **warnings**（29_Observer_Warnings.md）: 観測結果の整合性異常（COUNT_MISMATCH / SUMMARY_MISMATCH 等）。strict 時や healthcheck で検知し、提案の信頼性に影響する。
- **鮮度**: 提案が「いつ時点の観測か」を示すのみ。異常ではない。60 分以上で「少し古い提案です」と表示するが、warnings の一種ではなく、既存の strict / warnings ロジックには影響を与えない。
- 現時点では **表示のみ**。鮮度に基づく自動判断・ブロックは行わない。

## 参照

- 19_SubAgent_Observer.md — Observer の設計
- 29_Observer_Warnings.md — warnings の定義（鮮度とは別）
