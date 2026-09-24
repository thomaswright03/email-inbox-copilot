import type { Metadata } from "next";
import { connection } from "next/server";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Providers from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inbox Buddy",
  description: "Daily email summary and spam flashcards",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page renders per request so it can carry the CSP nonce set in
  // proxy.ts (a statically prerendered page has no nonce and its scripts
  // would be blocked).
  await connection();
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-background text-foreground antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
