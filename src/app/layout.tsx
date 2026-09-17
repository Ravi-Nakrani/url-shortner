import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { AuthStatus } from "@/components/AuthStatus";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "URL Shortener",
  description: "A URL shortener with click analytics.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <Link href="/" className="font-semibold text-text">
            URL Shortener
          </Link>
          <AuthStatus />
        </header>
        {children}
      </body>
    </html>
  );
}
