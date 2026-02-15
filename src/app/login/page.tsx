"use client";

/**
 * ログイン画面（メール・パスワード）
 * 認証済みの場合は /dashboard へリダイレクト（middleware で実施）。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-page, #0f0f0f)",
        color: "var(--text-primary, #e0e0e0)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          padding: 24,
          border: "1px solid var(--border-default, #333)",
          borderRadius: 12,
          background: "var(--bg-card, #1a1a1a)",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>
          ログイン
        </h1>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="email"
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 6,
                color: "var(--text-secondary, #999)",
              }}
            >
              メール
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 15,
                border: "1px solid var(--border-default, #333)",
                borderRadius: 8,
                background: "var(--bg-input, #222)",
                color: "var(--text-primary, #e0e0e0)",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label
              htmlFor="password"
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 6,
                color: "var(--text-secondary, #999)",
              }}
            >
              パスワード
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 15,
                border: "1px solid var(--border-default, #333)",
                borderRadius: 8,
                background: "var(--bg-input, #222)",
                color: "var(--text-primary, #e0e0e0)",
                boxSizing: "border-box",
              }}
            />
          </div>
          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: "10px 12px",
                fontSize: 13,
                color: "var(--color-danger, #e57373)",
                background: "rgba(229, 115, 115, 0.1)",
                borderRadius: 8,
              }}
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 16px",
              fontSize: 15,
              fontWeight: 600,
              border: "none",
              borderRadius: 8,
              background: "var(--color-info, #2196f3)",
              color: "var(--text-on-primary, #fff)",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "ログイン中…" : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}
