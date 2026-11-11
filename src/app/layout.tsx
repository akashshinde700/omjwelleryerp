import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { SessionProvider } from "@/components/providers/session-provider";
import { MotionConfig } from 'framer-motion'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OmGold ERP — Jewellery & Gold Loan Software",
  description: "Complete Jewellery ERP, Gold Loan (Girvi) & Money Lending management software.",
  keywords: ["jewellery software", "gold loan", "girvi", "ERP", "billing", "accounting"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/*
        suppressHydrationWarning is needed on <body> as well as <html>: it only
        applies one level deep, and browser extensions (Grammarly, ColorZilla)
        inject attributes onto <body> before React hydrates.
      */}
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {/* Honour the OS "reduce motion" setting. The CSS in globals.css covers transitions and
              skeletons; framer-motion writes inline transforms, which CSS cannot reach — this is
              the only place that stops them. */}
          <MotionConfig reducedMotion="user">
          <SessionProvider>
            <QueryProvider>
              {children}
              <Toaster />
              <SonnerToaster position="top-right" richColors />
            </QueryProvider>
          </SessionProvider>
          </MotionConfig>
        </ThemeProvider>
      </body>
    </html>
  );
}
