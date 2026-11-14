import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";

import { TabBar } from "@/components/tab-bar";

import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const serif = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "FINN",
  description: "What changed in your portfolio, why it matters, and who you know who can explain it.",
  applicationName: "FINN",
  appleWebApp: { capable: true, title: "FINN", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f11" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable} antialiased`}>
      <body className="min-h-dvh">
        <div className="mx-auto min-h-dvh max-w-[480px] pb-[calc(72px+env(safe-area-inset-bottom))]">{children}</div>
        <TabBar />
      </body>
    </html>
  );
}
