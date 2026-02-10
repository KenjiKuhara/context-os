/**
 * Phase 4: 自己修正ループ用 — 検証エラーを再生成プロンプトに埋め込む
 * 41_phase4_quality_pipeline.md §4 に準拠。
 */

/**
 * Validator が返した errors と（任意で）validNodeIds から、
 * AI への再生成依頼プロンプト文字列を組み立てる。
 */
export function buildCorrectionPrompt(
  errors: string[],
  validNodeIds?: string[]
): string {
  const lines: string[] = [
    "【検証エラー】以下の項目を満たすように、同じ形式の JSON だけを再出力してください。",
    ...errors.map((e) => `- ${e}`),
  ];
  if (validNodeIds && validNodeIds.length > 0)
    lines.push(`利用可能な node_id の例: ${validNodeIds.slice(0, 20).join(", ")}${validNodeIds.length > 20 ? " ..." : ""}`);
  return lines.join("\n");
}
