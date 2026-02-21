"use client";

/**
 * ログイン画面（メール・パスワード）
 * 認証済みの場合は /dashboard へリダイレクト（middleware で実施）。
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 15,
  border: "1px solid var(--border-default, #3e3e42)",
  borderRadius: 8,
  background: "var(--bg-muted, #1e1e1e)",
  color: "var(--text-primary, #d4d4d4)",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
  color: "var(--text-secondary, #858585)",
};

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
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

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo }
    );

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setInfo("パスワードリセット用のメールを送信しました。メールのリンクをクリックして新しいパスワードを設定してください。");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-page, #141414)",
        color: "var(--text-primary, #d4d4d4)",
      }}
    >
      <a
        href="#login-form"
        style={{
          position: "absolute",
          top: -40,
          left: 0,
          padding: "8px 16px",
          background: "var(--color-info, #007fd4)",
          color: "#fff",
          borderRadius: 4,
          zIndex: 100,
          transition: "top 0.2s",
        }}
        onFocus={(e) => { (e.currentTarget as HTMLElement).style.top = "8px"; }}
        onBlur={(e) => { (e.currentTarget as HTMLElement).style.top = "-40px"; }}
      >
        コンテンツへスキップ
      </a>
      <main>
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          padding: 28,
          border: "1px solid var(--border-default, #3e3e42)",
          borderRadius: 12,
          background: "var(--bg-card, #252526)",
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <Link
            href="/"
            style={{
              display: "inline-block",
              fontSize: 13,
              color: "var(--text-secondary, #858585)",
              textDecoration: "none",
              padding: "8px 4px",
              minHeight: 44,
              lineHeight: "28px",
            }}
          >
            ← context-os
          </Link>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>
          {mode === "login" ? "ログイン" : "パスワードをリセット"}
        </h1>

        {mode === "login" ? (
          <form id="login-form" onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="email" style={labelStyle}>メール</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label htmlFor="password" style={labelStyle}>パスワード</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 20, textAlign: "right" }}>
              <button
                type="button"
                onClick={() => { setMode("forgot"); setError(null); setInfo(null); }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-info, #007fd4)",
                  fontSize: 13,
                  cursor: "pointer",
                  padding: "8px 4px",
                  minHeight: 44,
                }}
              >
                パスワードを忘れた方へ
              </button>
            </div>
            {error && <ErrorBox message={error} />}
            <button type="submit" disabled={loading} style={primaryButtonStyle(loading)}>
              {loading ? "ログイン中…" : "ログイン"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleForgot}>
            <p style={{ fontSize: 13, color: "var(--text-secondary, #858585)", marginBottom: 16, lineHeight: 1.6 }}>
              登録したメールアドレスを入力してください。パスワードリセット用のリンクをお送りします。
            </p>
            <div style={{ marginBottom: 20 }}>
              <label htmlFor="reset-email" style={labelStyle}>メール</label>
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={inputStyle}
              />
            </div>
            {error && <ErrorBox message={error} />}
            {info && (
              <div style={{
                marginBottom: 16,
                padding: "10px 12px",
                fontSize: 13,
                color: "var(--text-success, #4ec994)",
                background: "rgba(78, 201, 148, 0.1)",
                borderRadius: 8,
                lineHeight: 1.6,
              }}>
                {info}
              </div>
            )}
            <button type="submit" disabled={loading || !!info} style={primaryButtonStyle(loading || !!info)}>
              {loading ? "送信中…" : "リセットメールを送信"}
            </button>
            <button
              type="button"
              onClick={() => { setMode("login"); setError(null); setInfo(null); }}
              style={{
                width: "100%",
                marginTop: 10,
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 500,
                border: "1px solid var(--border-default, #3e3e42)",
                borderRadius: 8,
                background: "transparent",
                color: "var(--text-secondary, #858585)",
                cursor: "pointer",
              }}
            >
              ログインに戻る
            </button>
          </form>
        )}
      </div>
      </main>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{
      marginBottom: 16,
      padding: "10px 12px",
      fontSize: 13,
      color: "var(--color-danger, #e34671)",
      background: "rgba(227, 70, 113, 0.1)",
      borderRadius: 8,
    }}>
      {message}
    </div>
  );
}

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "11px 16px",
    fontSize: 15,
    fontWeight: 600,
    border: "none",
    borderRadius: 8,
    background: "var(--color-info, #007fd4)",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}
