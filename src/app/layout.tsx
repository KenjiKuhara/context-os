import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeRestore } from "@/components/ThemeRestore";
import { FaviconUpdater } from "@/components/FaviconUpdater";

/**
 * Phase12-Dark A2: 初回描画前に data-theme を確定（SSR 安全）。
 * 解決ロジックは docs/118 A4 契約に従い、src/lib/theme.ts の resolveTheme() と同一分岐で複製している。
 * 契約変更時は theme.ts とこの script の両方を同じ分岐に揃えること。
 */
const THEME_INIT_SCRIPT = `
(function(){
  var key = 'kuharaos.theme';
  var theme = 'dark';
  try {
    var stored = typeof localStorage !== 'undefined' && localStorage.getItem(key);
    if (stored === 'light') { theme = 'light'; }
  } catch (e) {}
  try { document.documentElement.setAttribute('data-theme', theme); } catch (e) {}
})();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://context-os-five.vercel.app";

export const metadata: Metadata = {
  title: {
    default: "context-os — AI-assisted task management",
    template: "%s | context-os",
  },
  description:
    "context-os はあなたの外部作業記憶OS。AIが提案し人間が決定する15ステータスのワークフローでタスクを管理。Claude Code などのMCPクライアントからも操作できる次世代タスク管理システム。",
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "context-os — AI-assisted task management",
    description: "AIが提案し、人間が決定するタスク管理OS。",
    url: SITE_URL,
    siteName: "context-os",
    type: "website",
    locale: "ja_JP",
  },
  twitter: {
    card: "summary",
    title: "context-os — AI-assisted task management",
    description: "AIが提案し、人間が決定するタスク管理OS。",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
        <FaviconUpdater />
        <ThemeRestore />
        {children}
      </body>
    </html>
  );
}
