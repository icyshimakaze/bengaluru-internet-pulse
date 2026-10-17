import "server-only";
import type { Metadata } from "next";
import { z } from "zod";
import { siteSettings, indexingAllowed, publicSiteOriginSchema } from "./site-config";

export const SITE_TITLE = "Bengaluru Pulse — The city's public internet, measured in motion";
export const SITE_DESCRIPTION = "What is Bengaluru talking about, and what is accelerating? Explore public signals with transparent momentum scores and original evidence.";
const PRODUCTION_ORIGIN = "https://bengaluru-internet-pulse.vercel.app";
const productionHostSchema = z.string().trim().min(1).refine((host) => {
  try {
    const url = new URL("https://" + host);
    return url.host === host && publicSiteOriginSchema.safeParse(url.href).success;
  } catch { return false; }
});

// Use the stable production domain, never request headers or a preview deployment URL.
export function siteOrigin(input: Record<string, string | undefined> = process.env): URL {
  const { SITE_URL } = siteSettings(input);
  if (SITE_URL) return new URL(SITE_URL);
  const host = productionHostSchema.safeParse(input.VERCEL_PROJECT_PRODUCTION_URL);
  return new URL(host.success ? "https://" + host.data : PRODUCTION_ORIGIN);
}
export function pageMetadata(title: string, description: string, path: string): Metadata {
  const url = new URL(path, siteOrigin());
  const image = { url: new URL("/opengraph-image.png", siteOrigin()), width: 1200, height: 630, alt: "Bengaluru Pulse — the city's internet, compressed" };
  return { description, alternates: { canonical: url }, robots: { index: indexingAllowed(), follow: indexingAllowed() },
    openGraph: { type: "website", locale: "en_IN", siteName: "Bengaluru Pulse", title, description, url, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] } };
}
