import type { Metadata, Viewport } from "next";
import { BottomNav } from "@/components/navigation/bottom-nav";
import "./globals.css";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

export const metadata: Metadata = {
  title: "力训周期管家",
  description: "移动端优先的力量训练周期管理 MVP",
  applicationName: "力训周期管家",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg"
  },
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f8a4a"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      {supabaseUrl ? (
        <head>
          <link href={supabaseUrl} rel="preconnect" />
          <link href={supabaseUrl} rel="dns-prefetch" />
        </head>
      ) : null}
      <body>
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
