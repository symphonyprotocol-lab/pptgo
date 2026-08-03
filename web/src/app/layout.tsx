import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { DEFAULT_THEME_PREF, THEME_INIT_SCRIPT } from "@/lib/theme";
import { I18nProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";
import { headers } from "next/headers";
import { translator } from "@/lib/i18n/translate";
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

/** The description is the one piece of chrome that has to be resolved per request. */
export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLocale());
  return { title: "PPTGo", description: t("site.tagline") };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  // minted per request by the middleware; without it the CSP blocks the boot script below
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    // The theme is a client fact — system preference plus whatever the user last chose
    // — so the server can only render the default and let the boot script below correct
    // `class` and `data-theme-pref` while the browser is still parsing the head, before
    // anything is painted. `suppressHydrationWarning` is what lets that correction
    // survive hydration: React keeps the DOM's attributes instead of its own.
    <html
      lang={locale === "zh" ? "zh-CN" : "en"}
      data-theme-pref={DEFAULT_THEME_PREF}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        {/*
          React deliberately drops `nonce` from the client tree so no script can read it
          back, which makes the attribute a guaranteed hydration mismatch. It is the same
          reason `<html>` above carries one: the server value is the correct one and the
          client must not "fix" it.
        */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="grain min-h-full flex flex-col">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
