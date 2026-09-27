import type { Metadata, Viewport } from "next";
import { Anybody, Instrument_Sans } from "next/font/google";
import "./globals.css";
import "mapbox-gl/dist/mapbox-gl.css";
import { NavBar } from "./components/NavBar";

const anybody = Anybody({
  variable: "--font-anybody",
  subsets: ["latin"],
  axes: ["wdth"],
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: "Whim — what's on in New York tonight",
  description: "Every event happening in New York tonight, from every source, on one board.",
};

export const viewport: Viewport = {
  themeColor: "#17143a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${anybody.variable} ${instrumentSans.variable}`}>
      <body className="antialiased min-h-screen bg-ink text-moon selection:bg-sodium selection:text-ink">
        <div className="flex flex-col h-[100dvh]">
          <NavBar />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
