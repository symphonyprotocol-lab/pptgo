import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { DEFAULT_THEME_PREF, THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * A high-contrast serif against a technical grey UI — the unexpected half of the
 * pairing, since dark tool interfaces reach for a grotesque by reflex. The Chinese
 * copy falls back to the system face regardless, so Fraunces carries the wordmark,
 * the kickers and the numerals rather than the headlines.
 */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  title: "PPTGo",
  description: "在线幻灯片编辑器",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The theme is a client fact — system preference plus whatever the user last chose
    // — so the server can only render the default and let the boot script below correct
    // `class` and `data-theme-pref` while the browser is still parsing the head, before
    // anything is painted. `suppressHydrationWarning` is what lets that correction
    // survive hydration: React keeps the DOM's attributes instead of its own.
    <html
      lang="zh-CN"
      data-theme-pref={DEFAULT_THEME_PREF}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="grain min-h-full flex flex-col">{children}</body>
    </html>
  );
}
