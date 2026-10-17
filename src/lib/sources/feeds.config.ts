import "server-only";
import { z } from "zod";
import { httpUrlSchema } from "@/lib/domain/urls";
export const feedSchema = z.object({ id: z.string().regex(/^[a-z0-9-]+$/u), name: z.string().min(1).max(100),
  url: httpUrlSchema.refine((url) => url.startsWith("https://")), termsStatus: z.literal("unchecked"),
  localOnly: z.boolean() }).strict();
export type Feed = z.infer<typeof feedSchema>;
// Fetch-verified on 18 October 2026. Opt in with RSS_ENABLED after rights review.
export const feeds = z.array(feedSchema).max(5).parse([
  { id: "hindu-bengaluru", name: "The Hindu — Bengaluru", url: "https://www.thehindu.com/news/cities/bangalore/feeder/default.rss", termsStatus: "unchecked", localOnly: true },
  { id: "citizen-matters", name: "Citizen Matters", url: "https://citizenmatters.in/feed/", termsStatus: "unchecked", localOnly: false },
]);
export const RSS_USER_AGENT = "BengaluruPulse/0.1 (+https://github.com/icyshimakaze/bengaluru-internet-pulse; public metadata reader)";
