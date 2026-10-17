// Small, auditable event anchors shared by matching and data-quality inspection.
// No embeddings, model calls or trend-score decisions belong here.
const stopWords = new Set(`a an the in on at for and or of to is are was were be been with from this that it as by
  bengaluru bangalore bengalooru namma public mentions mention discussion discussions report reports reported update updates
  says said new after city about has have will not more its their our your today latest`.split(/\s+/u));
const synonyms: Readonly<Record<string, string>> = {
  bmrcl: "metro", metros: "metro", delayed: "delay", delays: "delay", delaying: "delay", disrupted: "delay", disruption: "delay",
  trains: "train", services: "service", rains: "rain", rainfall: "rain", flooded: "flood", flooding: "flood",
  waterlogged: "waterlogging", startups: "startup", cafes: "cafe", cafés: "cafe", café: "cafe",
  restaurants: "restaurant", concerts: "concert", festivals: "festival", closures: "closure", closed: "closure",
  halted: "closure", halts: "closure", halt: "closure", suspended: "closure", suspension: "closure", extensions: "extension", extended: "extension",
  inaugurated: "launch", inaugurates: "launch", inauguration: "launch", unveils: "launch", unveiled: "launch", opens: "launch", opening: "launch", launched: "launch",
  signalling: "signal", signaling: "signal", signals: "signal", fault: "failure", outages: "outage",
  interrupted: "outage", interruption: "outage", interruptions: "outage", shutdown: "closure",
};
export function normalizeText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\b(?:https?:\/\/|www\.)\S+/gu, " ").replace(/\s+/gu, " ").trim();
}
export function extractKeywords(value: string): string[] {
  let text = normalizeText(value);
  if (/\b(cricket|t20i?|odi|ipl|test match)\b/u.test(text)) text = text.replace(/\b(?:washed out|called off|abandon(?:ed|ment)?|without a ball|no play)\b/gu, "washout").replace(/\bt20i\b/gu, "t20");
  if (/\b(funding|investment|million|billion|ventures)\b|\$\d/u.test(text)) text = text.replace(/\b(raises|raised|raising|secures|secured)\b/gu, "funding");
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.filter((w) => !stopWords.has(w) && (w.length >= 3 || /^\d+$/u.test(w)))
    .map((w) => synonyms[w] ?? w))];
}
export function tokenOverlap(a: string[], b: string[]): number {
  const left = new Set(a), right = new Set(b);
  const intersection = [...left].filter((t) => right.has(t)).length;
  return intersection / Math.max(1, new Set([...left, ...right]).size);
}
/** Conservative event entity set. A generic match/rain mention cannot merge. */
export function cricketIdentity(text: string): { teams: string; format: string; action: string; women: boolean } | null {
  const value = normalizeText(text);
  if (!/\b(cricket|t20i?|odi|ipl|test match)\b/u.test(value)) return null;
  const teams = [
    ["india", /\bindia\b/u], ["south-africa", /\b(south africa|proteas|sa)\b/u],
    ["australia", /\baustralia\b/u], ["england", /\bengland\b/u], ["new-zealand", /\b(new zealand|black caps|nz)\b/u],
    ["pakistan", /\bpakistan\b/u], ["sri-lanka", /\bsri lanka\b/u], ["bangladesh", /\bbangladesh\b/u],
    ["rcb", /\b(rcb|royal challengers)\b/u], ["csk", /\b(csk|chennai super kings)\b/u],
    ["mumbai-indians", /\bmumbai indians\b/u], ["kkr", /\b(kkr|kolkata knight riders)\b/u],
  ] as const;
  const entities = teams.filter(([, pattern]) => pattern.test(value)).map(([key]) => key).sort();
  if (entities.length !== 2) return null;
  const format = value.match(/\b(t20i?|odi|ipl|test match)\b/u)?.[0]?.replace("t20i", "t20") ?? "cricket";
  const action = /\b(washout|washed out|called off|abandon\w*|no play|without a ball)\b/u.test(value) ? "washout" : null;
  return action ? { teams: entities.join(":"), format, action, women: /\bwomen\b/u.test(value) } : null;
}
const eventTerms = new Set(["delay", "closure", "outage", "strike", "extension", "launch", "funding", "festival", "concert", "flood", "rain", "shortage", "accident", "protest"]);
const months = "january february march april may june july august september october november december".split(" ");
export function dateAnchors(text: string): string[] {
  const value = normalizeText(text);
  const dates = [...value.matchAll(/\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/gu)]
    .map((match) => `${months.indexOf(match[2]!) + 1}-${Number(match[1])}`);
  dates.push(...[...value.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/gu)]
    .map((match) => `${months.indexOf(match[1]!) + 1}-${Number(match[2])}`));
  dates.push(...[...value.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/gu)].map((m) => `${m[1]}-${m[2]}-${m[3]}`));
  return [...new Set(dates)].sort();
}
export function eventAnchors(text: string): string[] {
  return extractKeywords(text).filter((word) => eventTerms.has(word)).sort();
}
export type EventIdentity = { kind: "metro" | "water-supply"; action: string; route: string[]; causes: string[]; dates: string[] };
export function eventIdentity(text: string): EventIdentity | null {
  const value = normalizeText(text), words = extractKeywords(text);
  const metro = /\b(metro|bmrcl|namma metro)\b/u.test(value) || /\b(purple|yellow|pink|green|blue) line\b/u.test(value);
  const water = /\b(water supply|bwssb|water outage|no water|water cut)\b/u.test(value);
  if (!metro && !water) return null;
  const actions = words.filter((word) => ["delay", "closure", "extension", "launch", "outage", "strike", "accident", "protest"].includes(word));
  // Water supply cuts/disruptions have one identity; a metro outage and a delay remain distinct.
  if (water && /\b(cut|cuts|disruption|disrupted|outage|interruption|interrupted|no water)\b/u.test(value)) actions.push("outage");
  const unique = [...new Set(water ? actions.filter((a) => !["closure", "delay"].includes(a)) : actions)];
  if (unique.length !== 1) return null;
  return { kind: metro ? "metro" : "water-supply", action: unique[0]!,
    route: [...value.matchAll(/\b(purple|yellow|pink|green|blue) line\b/gu)].map((m) => m[1]!).sort(),
    causes: words.filter((w) => ["signal", "power", "maintenance", "accident"].includes(w)).sort(), dates: dateAnchors(value) };
}
export function conflictingEvents(a: string, b: string): boolean {
  const left = eventIdentity(a), right = eventIdentity(b);
  const differs = (x: string[], y: string[]) => x.length > 0 && y.length > 0 && x.join("|") !== y.join("|");
  if (differs(dateAnchors(a), dateAnchors(b))) return true;
  if (left && right && (left.kind !== right.kind || left.action !== right.action || differs(left.route, right.route) || differs(left.causes, right.causes))) return true;
  return false;
}

export function namedEventIdentity(text: string): { key: string; label: string } | null {
  const value = normalizeText(text), actions = eventAnchors(value);
  const compound = value.match(/\b([\p{L}]{3,})[- ]([\p{L}]{3,})@([\p{L}]{3,})\b/u);
  // A distinctive named facility and an explicit action support paraphrase matching.
  if (compound && actions.length === 1 && actions[0] === "launch") {
    return { key: `launch:${compound[1]}:${compound[2]}:${compound[3]}`, label: `${compound[1]} ${compound[2]} ${compound[3]} launch` };
  }
  if (!actions.includes("funding")) return null;
  const candidates = [text.match(/\b(?:startup\s+)?([A-Z][a-zA-Z]{3,})\s+(?:raises|raised|secures|secured|lands)\b/iu)?.[1],
    text.match(/#([A-Z][a-z]{3,}[a-zA-Z]*)\b/u)?.[1]];
  const subject = candidates.find((candidate) => candidate && !/^(Bengaluru|Bangalore|Company|Startup|SupplyChain|Funding|Investment|Technology|Business|News)$/iu.test(candidate));
  if (!subject) return null;
  return { key: `funding:${subject.toLowerCase()}`, label: `${subject} funding` };
}

export function fundingAmount(text: string): number | null {
  const amount = normalizeText(text).match(/\$\s*(\d+(?:\.\d+)?)\s*(million|billion|m|b)?\b/u);
  return amount ? Number(amount[1]) * (/^(billion|b)$/u.test(amount[2] ?? "") ? 1e9 : /^(million|m)$/u.test(amount[2] ?? "") ? 1e6 : 1) : null;
}

export function jobIdentity(text: string): { role: string; id: string | null } | null {
  const match = text.match(/^(.*?)\bJob\b/iu);
  if (!match) return null;
  const id = text.match(/\/jobs?\/(?:job\/)?(\d+)/iu)?.[1] ?? text.match(/\bJob\s+(\d+)\b/iu)?.[1] ?? null;
  return { role: extractKeywords(match[1]!).join(" "), id };
}
