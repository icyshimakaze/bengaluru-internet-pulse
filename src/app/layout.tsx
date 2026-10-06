import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "leaflet/dist/leaflet.css";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Bengaluru Pulse — The city's internet, compressed", template: "%s | Bengaluru Pulse" },
  description: "Detect rising topics across Bengaluru's public internet. Transparent momentum scoring across GDELT, Bluesky and Hacker News.",
  applicationName: "Bengaluru Pulse",
};
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a><SiteHeader /><main id="main" className="shell">{children}</main><SiteFooter /></body></html>; }
