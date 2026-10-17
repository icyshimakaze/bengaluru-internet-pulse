import "server-only";
import type { Source } from "@/lib/domain/schema";
import { fetchJson, type Transport } from "./http";
import { createGdeltAdapter } from "./gdelt";
import { createBlueskyAdapter } from "./bluesky";
import { createHackerNewsAdapter } from "./hackernews";
import { createCurrentsAdapter } from "./currents";
import type { SourceAdapter, AdapterOptions } from "./types";
export type { NormalizedSignal, SourceAdapter, SourceResult } from "./types";

export function createAdapters(transport: Transport = fetchJson, options: AdapterOptions & { currentsKey?: string } = {}): Record<Source, SourceAdapter> {
  return { gdelt: createGdeltAdapter(transport, options), bluesky: createBlueskyAdapter(transport, options),
    hackernews: createHackerNewsAdapter(transport, options), currents: createCurrentsAdapter(options.currentsKey, transport, options) };
}
