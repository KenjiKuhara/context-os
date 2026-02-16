/**
 * ルート保護: /dashboard は未認証で /login へ、/login は認証済みで /dashboard へ。
 * セッションのリフレッシュ（Cookie 更新）をここで行う。
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  if (!supabaseUrl || !anonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isDashboard = path === "/dashboard" || path.startsWith("/dashboard/");
  const isLogin = path === "/login";

  if (!user && isDashboard) {
    const redirect = new URL("/login", request.url);
    return NextResponse.redirect(redirect);
  }

  if (user && isLogin) {
    const redirect = new URL("/dashboard", request.url);
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/login"],
};
