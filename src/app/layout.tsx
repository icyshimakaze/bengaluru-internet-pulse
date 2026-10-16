import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PulseProvider } from "@/components/pulse-context";
import { readDashboard } from "@/lib/server/queries";
import { pulseMetadata } from "@/lib/trends/dashboard-presentation";
import { siteOrigin, SITE_TITLE, SITE_DESCRIPTION } from "@/lib/server/metadata";
import { indexingAllowed } from "@/lib/server/site-config";
import "./globals.css";
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
  return <html lang="en"><body><PulseProvider initialPulse={pulseMetadata(pulse)}><a className="skip-link" href="#main">Skip to content</a><SiteHeader /><main id="main" className="shell">{children}</main><SiteFooter /></PulseProvider></body></html>;
}
