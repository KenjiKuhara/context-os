/**
 * Phase 4: LLM 呼び出し（JSON のみ出力させる）。
 * 環境変数 OPENAI_API_KEY 必須。未設定時は throw。
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * メッセージを送り、応答テキストを 1 件返す。JSON 出力を指示している場合は parse は呼び出し側で行う。
 */
export async function callLlm(messages: LlmMessage[], model = DEFAULT_MODEL): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" as const },
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (content == null || typeof content !== "string") {
    throw new Error("OpenAI API returned no content");
  }
  return content.trim();
}

/**
 * 応答から JSON オブジェクトを抽出する。```json ... ``` で囲まれていれば中身だけ取り出す。
 */
export function extractJsonFromResponse(raw: string): unknown {
  let s = raw.trim();
  const jsonBlock = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlock) s = jsonBlock[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s) as unknown;
}
