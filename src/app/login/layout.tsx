import type { Metadata } from "next";

const SITE_URL = "https://context-os-five.vercel.app";

export const metadata: Metadata = {
  title: "ログイン — context-os | AIタスク管理システム",
  description:
    "context-os にメールとパスワードでログインしてください。AIが提案し人間が決定する15ステータスのワークフローで外部作業記憶を構築します。Claude Code などのMCPクライアントとも連携可能なタスク管理システムです。",
  alternates: {
    canonical: "/login",
  },
  openGraph: {
    title: "ログイン — context-os | AIタスク管理システム",
    description:
      "context-os にログインして、AIと協働するタスク管理を始めましょう。",
    url: `${SITE_URL}/login`,
    siteName: "context-os",
    type: "website",
    locale: "ja_JP",
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
