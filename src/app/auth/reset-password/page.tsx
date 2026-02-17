"use client";

/**
 * パスワードリセット画面
 * Supabase からのリセットメールリンクでここに遷移し、新しいパスワードを設定する。
 * PKCE フロー（?code=xxx）と implicit フロー（#access_token=xxx&type=recovery）の両方に対応。
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Suspense } from "react";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 15,
  border: "1px solid var(--border-default, #3e3e42)",
  borderRadius: 8,
  background: "var(--bg-muted, #1e1e1e)",
  color: "var(--text-primary, #d4d4d4)",
  boxSizing: "border-box",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
  color: "var(--text-secondary, #858585)",
};

function ResetPasswordForm() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const supabase = createClient();

    // PKCE フロー: URL に ?code=xxx がある場合
    const code = searchParams.get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        setPreparing(false);
        if (error) {
          setError("リンクが無効または期限切れです。再度パスワードリセットを行ってください。");
        } else {
          setReady(true);
        }
      });
      return;
    }

    // implicit フロー: onAuthStateChange で PASSWORD_RECOVERY を待つ
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setPreparing(false);
        setReady(true);
      }
    });

    // タイムアウト（5秒でリンク無効と判定）
    const timer = setTimeout(() => {
      setPreparing(false);
      setError("リンクが無効または期限切れです。再度パスワードリセットを行ってください。");
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("パスワードが一致しません。");
      return;
    }
    if (password.length < 8) {
      setError("パスワードは8文字以上で入力してください。");
      return;
    }
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push("/dashboard"), 2500);
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
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>
          新しいパスワードを設定
        </h1>

        {preparing && (
          <p style={{ fontSize: 14, color: "var(--text-secondary, #858585)" }}>
            認証情報を確認中…
          </p>
        )}

        {!preparing && error && !ready && (
          <>
            <div style={{
              padding: "10px 12px",
              fontSize: 13,
              color: "var(--color-danger, #e34671)",
              background: "rgba(227, 70, 113, 0.1)",
              borderRadius: 8,
              marginBottom: 20,
            }}>
              {error}
            </div>
            <a
              href="/login"
              style={{
                display: "block",
                textAlign: "center",
                fontSize: 14,
                color: "var(--color-info, #007fd4)",
              }}
            >
              ログインページへ戻る
            </a>
          </>
        )}

        {!preparing && ready && !success && (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="new-password" style={labelStyle}>新しいパスワード</label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="8文字以上"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label htmlFor="confirm-password" style={labelStyle}>パスワード（確認）</label>
              <input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                style={inputStyle}
              />
            </div>
            {error && (
              <div style={{
                marginBottom: 16,
                padding: "10px 12px",
                fontSize: 13,
                color: "var(--color-danger, #e34671)",
                background: "rgba(227, 70, 113, 0.1)",
                borderRadius: 8,
              }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "11px 16px",
                fontSize: 15,
                fontWeight: 600,
                border: "none",
                borderRadius: 8,
                background: "var(--color-info, #007fd4)",
                color: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "更新中…" : "パスワードを更新"}
            </button>
          </form>
        )}

        {success && (
          <div style={{
            padding: "12px 14px",
            fontSize: 14,
            color: "var(--text-success, #4ec994)",
            background: "rgba(78, 201, 148, 0.1)",
            borderRadius: 8,
            lineHeight: 1.6,
          }}>
            パスワードを更新しました。ダッシュボードへ移動します…
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
