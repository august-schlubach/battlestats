import type { Metadata } from "next";
import { Suspense } from "react";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import { Inter } from "next/font/google";
import HeaderSearch from "./components/HeaderSearch";
import Logo from "./components/Logo";
import Footer from "./components/Footer";
import ThemeToggle from "./components/ThemeToggle";
import LocaleSelector from "./components/LocaleSelector";
import RealmSelector from "./components/RealmSelector";
import { ThemeProvider } from "./context/ThemeContext";
import { LocaleProvider } from "./context/LocaleContext";
import { RealmProvider } from "./context/RealmContext";
import { DegradationProvider } from "./context/DegradationContext";
import ConnectionHint from "./components/ConnectionHint";
import VisitorIdentity from "./components/VisitorIdentity";
import LocaleBeacon from "./components/LocaleBeacon";
import { buildBootScript } from "./lib/bootScript";
import { isLocaleAutodetectEnabled, isRealmAutodetectEnabled } from "./lib/featureFlags";
import { getSiteOrigin } from "./lib/siteOrigin";
import "./globals.css";

config.autoAddCss = false;

// Inter carries no CJK glyphs. Fallback applies PER GLYPH, so Latin still
// renders in Inter while Korean and Japanese fall to the system faces every
// real device already has. Self-hosting Noto CJK would cost megabytes against a
// client that currently ships one Latin subset.
const inter = Inter({
  subsets: ["latin"],
  fallback: [
    'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR',
    'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', 'Noto Sans JP',
    'sans-serif',
  ],
});
const enableUmami = process.env.NODE_ENV === "production";

export const metadata: Metadata = {
  title: "WoWs Battlestats — World of Warships Player & Clan Statistics",
  description:
    "Look up any World of Warships player or clan. Win rates, battle history, ship stats, ranked performance, efficiency rankings, and population distributions.",
  metadataBase: new URL(getSiteOrigin()),
  openGraph: {
    title: "WoWs Battlestats",
    description: "World of Warships player and clan statistics.",
    siteName: "WoWs Battlestats",
    type: "website",
    // Branded default card; entity pages override with their own numbers.
    images: [{ url: "/og", width: 1200, height: 630, alt: "WoWs Battlestats" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "WoWs Battlestats",
    description: "World of Warships player and clan statistics.",
    images: ["/og"],
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
        <script dangerouslySetInnerHTML={{ __html: buildBootScript({ autodetectLocale: isLocaleAutodetectEnabled(), autodetectRealm: isRealmAutodetectEnabled() }) }} />
        {enableUmami ? <script defer src="/umami/script.js" data-website-id="27c0ee6a-f534-42d4-b49f-27bbadad9848" /> : null}
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          <LocaleProvider>
            <RealmProvider>
              <DegradationProvider>
              {/* One 850px column bounds the header, page content, and footer. */}
              <div className="mx-auto max-w-[850px] px-4 md:px-6">
                {/* The nav row fits within the 850px column well below the old
                    two-column layout's 768px fold, so it stacks only under sm
                    (640px) — the search input shrinks (min-w-0) to absorb the
                    squeeze in between. */}
                <header className="flex flex-col gap-4 bg-[var(--bg-page)] pt-5 pb-[14px] sm:flex-row sm:items-center sm:justify-between sm:pt-6 sm:pb-[18px]">
                  <Logo />
                  <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-3 sm:w-auto sm:flex-1 sm:flex-nowrap">
                    <ThemeToggle />
                    <LocaleSelector />
                    <RealmSelector />
                    <Suspense fallback={null}>
                      <HeaderSearch />
                    </Suspense>
                  </div>
                </header>
                <main className="pb-8">
                  {/* Gated identically to the tracker tag above: without the
                      script there is nothing to identify. */}
                  {enableUmami ? <VisitorIdentity /> : null}
                  {enableUmami ? <LocaleBeacon /> : null}
                  <ConnectionHint />
                  {children}
                </main>
                <Footer />
              </div>
              </DegradationProvider>
            </RealmProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
