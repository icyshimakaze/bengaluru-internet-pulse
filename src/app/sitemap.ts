import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/server/metadata";
import { indexingAllowed } from "@/lib/server/site-config";

export const dynamic = "force-dynamic";
// Stable public pages only: indexing metadata must not require storage or ingest.
export default function sitemap(): MetadataRoute.Sitemap {
  if (!indexingAllowed()) return [];
  const origin = siteOrigin();
  return [{ url: new URL("/", origin).href, changeFrequency: "hourly", priority: 1 },
    { url: new URL("/about", origin).href, changeFrequency: "monthly", priority: 0.5 }];
}
