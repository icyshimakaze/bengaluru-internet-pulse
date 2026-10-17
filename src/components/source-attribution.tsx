import type { Source } from "@/lib/domain/schema";

export function SourceAttribution({ source }: { source: Source }) {
  return source === "currents" ? <a className="source-attribution" href="https://currentsapi.services/" target="_blank" rel="noopener noreferrer">Powered by Currents News API<span className="sr-only"> (opens in a new tab)</span></a> : null;
}
