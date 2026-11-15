import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
// The font before the page's own styles (DokaanBondhu spec D207): Anek Bangla with its weight and width axes.
import "@fontsource-variable/anek-bangla/wdth.css";
import "./globals.css";

// Installable on a phone (DokaanBondhu spec D243): the app's name for iPhone's "Add to Home Screen", the frame's
// indigo as the phone's bar colour, and the page drawn under a notch, whose room the bars keep (`safe-area-inset`).
export const metadata: Metadata = {
  title: "GearGrid",
  applicationName: "GearGrid",
  appleWebApp: { capable: true, title: "GearGrid", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#1e2556",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
