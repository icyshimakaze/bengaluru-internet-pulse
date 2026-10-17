import type { Metadata } from "next";
import localFont from "next/font/local";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PulseProvider } from "@/components/pulse-context";
import { readDashboard } from "@/lib/server/queries";
import { pulseMetadata } from "@/lib/trends/dashboard-presentation";
import { siteOrigin, SITE_TITLE, SITE_DESCRIPTION } from "@/lib/server/metadata";
import { indexingAllowed } from "@/lib/server/site-config";
import "./globals.css";
import "./pulse.css";
const interfaceFont = localFont({ src: "./fonts/instrument-sans.woff2", weight: "400 700", variable: "--font-interface", display: "swap" });
const dataFont = localFont({ src: "./fonts/ibm-plex-mono.woff2", weight: "400", variable: "--font-data", display: "swap", preload: false });
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = {
  metadataBase: siteOrigin(),
  title: { default: SITE_TITLE, template: "%s | Bengaluru Pulse" },
  description: SITE_DESCRIPTION,
  applicationName: "Bengaluru Pulse",
  robots: { index: indexingAllowed(), follow: indexingAllowed() },
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pulse = await readDashboard();
  return <html lang="en" className={`${interfaceFont.variable} ${dataFont.variable}`}><body><PulseProvider initialPulse={pulseMetadata(pulse)}><a className="skip-link" href="#main">Skip to content</a><SiteHeader /><main id="main" className="shell">{children}</main><SiteFooter /></PulseProvider></body></html>;
}
