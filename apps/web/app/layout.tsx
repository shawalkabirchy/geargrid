import type { Metadata } from "next";
import type { ReactNode } from "react";
// The font before the page's own styles (DokaanBondhu spec D207): Anek Bangla with its weight and width axes.
import "@fontsource-variable/anek-bangla/wdth.css";
import "./globals.css";

export const metadata: Metadata = { title: "GearGrid" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
