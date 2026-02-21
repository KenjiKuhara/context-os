import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ログイン",
  description:
    "context-os にログインしてください。AIが提案し人間が決定するタスク管理OSで、あなたの外部作業記憶を構築します。メールとパスワードで安全にサインイン。",
  alternates: {
    canonical: "/login",
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
