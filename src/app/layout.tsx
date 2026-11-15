import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "أموال | استشارات مالية شخصية",
    template: "%s | أموال",
  },
  description:
    "احجز جلسة استشارية فردية عبر الإنترنت لإدارة دخلك وزيادته، مع متابعة مباشرة لمدة شهر بعد الجلسة.",
  icons: { icon: "/logo.png", apple: "/logo.png" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={plex.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
