import type { Metadata, Viewport } from "next";
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

const description =
  "Shorten a link and track every click. Durable click tracking, async analytics, and authenticated link ownership.";

export const metadata: Metadata = {
  metadataBase: new URL("https://url-shortner-ravi-nakrani.vercel.app"),
  title: {
    default: "URL Shortener",
    template: "%s | URL Shortener",
  },
  description,
  openGraph: {
    title: "URL Shortener",
    description,
    type: "website",
    siteName: "URL Shortener",
  },
  twitter: {
    card: "summary_large_image",
    title: "URL Shortener",
    description,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#14151a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
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
