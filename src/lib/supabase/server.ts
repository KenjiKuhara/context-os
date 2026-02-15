/**
 * サーバー用 Supabase クライアント（Cookie からセッション復元）
 * Route Handler / Server Component で使用。RLS が auth.uid() で効く。
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !anonKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required");
}

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // ignore (e.g. middleware refreshing session)
        }
      },
    },
  });
}

/**
 * セッション付きクライアントとユーザーを取得。未ログインなら user が null。
 */
export async function getSupabaseAndUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}
