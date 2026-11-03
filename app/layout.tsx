import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/toast";

const switzer = localFont({
  src: [
    { path: "./fonts/Switzer-400.woff2", weight: "400" },
    { path: "./fonts/Switzer-500.woff2", weight: "500" },
    { path: "./fonts/Switzer-700.woff2", weight: "700" },
  ],
  variable: "--font-switzer",
  display: "swap",
});

const mono = localFont({
  src: "./fonts/GeistMono-Regular.woff2",
  weight: "400",
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Referral Tracker · PIXELUP LABS", template: "%s · PIXELUP LABS Referrals" },
  description: "PIXELUP LABS Partner Referral Program: partners, referrals, commission and payouts.",
  robots: { index: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${switzer.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}<Toaster /></body>
    </html>
  );
}
