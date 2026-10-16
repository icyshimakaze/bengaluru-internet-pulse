// Display constants have no validation/runtime dependency. API boundaries still use schema.ts.
export const sources = ["gdelt", "bluesky", "hackernews"] as const;
export const sourceTypes = ["news", "social", "tech"] as const;
export const sourceTypeFor: Record<(typeof sources)[number], (typeof sourceTypes)[number]> = { gdelt: "news", bluesky: "social", hackernews: "tech" };
export const sourceNames: Record<(typeof sources)[number], string> = { gdelt: "GDELT", bluesky: "Bluesky", hackernews: "Hacker News" };
