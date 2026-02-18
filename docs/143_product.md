# 143 — プロダクト（Steering）

context-os が何を作っているか・誰のためのものかを示すステアリング用メモ。詳細は 00_Vision / 01_PRD 等を参照。

---

## プロダクトの位置づけ

- **名前**: context-os（外部ワーキングメモリ OS）
- **役割**: AI が提案し、アプリが検証し、人が決めるタスク管理。**「再開中心」** — 思考を止めても続きを始められることを最優先する。
- **中核原則**: AI suggests, App validates, humans decide。判断の確定権はアプリ側にあり、AI は提案まで。

## 誰のためか

- 思考・愚痴・途中案を投げ、AI の提案を読んで判断・修正するユーザー。
- 人は「管理」ではなく「再開」するだけ、という前提で設計されている。

## 関連ドキュメント

- ビジョン・北極星: [00_Vision_NorthStar.md](00_Vision_NorthStar.md)
- PRD: [01_PRD.md](01_PRD.md)
- アーキテクチャ: [10_Architecture.md](10_Architecture.md)
