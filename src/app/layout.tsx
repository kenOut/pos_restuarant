import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ENYO POS · Restaurant point of sale for Ghana",
    template: "%s · ENYO POS",
  },
  description:
    "The touch-screen point of sale for restaurants in Ghana. It keeps serving when the internet drops.",
};

export const viewport: Viewport = {
  themeColor: "#15130f",
  colorScheme: "dark",
  // Lets the till's bottom tabs sit clear of the phone's home indicator.
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GH" className={`${dmSans.variable} ${bricolage.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
