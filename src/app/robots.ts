import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/server/metadata";
import { indexingAllowed } from "@/lib/server/site-config";

export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed()) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: new URL("/sitemap.xml", siteOrigin()).href };
}
