import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Avokado Olgunluk Testi",
  description:
    "Avokadonun fotoğrafını çek, olgunluğunu öğren. Fotoğrafın telefonundan çıkmıyor.",
  applicationName: "Avokado Testi",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Çentikli telefonlarda kamera ekranı kenardan kenara açılsın
  viewportFit: "cover",
  themeColor: "#FBFDF6",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
