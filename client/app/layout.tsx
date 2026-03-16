import type { Metadata } from "next";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import { Inter } from "next/font/google";
import HeaderSearch from "./components/HeaderSearch";
import Logo from "./components/Logo";
import Footer from "./components/Footer";
import "./globals.css";

config.autoAddCss = false;

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WoWs Battlestats",
  description: "World of Warships player and clan statistics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <header className="flex flex-col gap-4 bg-white py-5 pl-5 md:flex-row md:items-center md:justify-between md:py-6">
            <Logo />
            <div className="flex w-full justify-end pr-2 md:w-auto">
              <HeaderSearch />
            </div>
          </header>
          <main className="pt-6 pb-8">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
