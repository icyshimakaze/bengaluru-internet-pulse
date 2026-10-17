// Display constants have no validation/runtime dependency. API boundaries still use schema.ts.
export const coreSources = ["gdelt", "bluesky", "hackernews"] as const;
export const sources = [...coreSources, "currents", "rss"] as const;
export const sourceTypes = ["news", "social", "tech"] as const;
export const sourceTypeFor: Record<(typeof sources)[number], (typeof sourceTypes)[number]> = { gdelt: "news", bluesky: "social", hackernews: "tech", currents: "news", rss: "news" };
export const sourceNames: Record<(typeof sources)[number], string> = { gdelt: "GDELT", bluesky: "Bluesky", hackernews: "Hacker News", currents: "Currents", rss: "Local RSS" };
