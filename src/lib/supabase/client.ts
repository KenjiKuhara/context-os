/**
 * ブラウザ用 Supabase クライアント（Cookie ベースセッション対応）
 * @supabase/ssr の createBrowserClient を使用。
 */

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !anonKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required");
}

export function createClient() {
  return createBrowserClient(supabaseUrl, anonKey);
}
