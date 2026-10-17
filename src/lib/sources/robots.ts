import "server-only";

type Group = { agents: string[]; rules: { allow: boolean; pattern: string }[]; delay: number };
/** RFC-style longest applicable group/rule; unsupported oversized crawl delays skip the feed. */
export function robotsPolicy(text: string, url: string, agent = "BengaluruPulse") {
  const groups: Group[] = [];
  let group: Group = { agents: [], rules: [], delay: 0 }, directives = false;
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.replace(/#.*$/u, "").trim(), at = line.indexOf(":");
    if (at < 0) continue;
    const key = line.slice(0, at).trim().toLowerCase(), value = line.slice(at + 1).trim();
    if (key === "user-agent") {
      if (directives) { groups.push(group); group = { agents: [], rules: [], delay: 0 }; directives = false; }
      group.agents.push(value.toLowerCase());
    } else if (group.agents.length && ["allow", "disallow", "crawl-delay"].includes(key)) {
      directives = true;
      if (key === "crawl-delay") group.delay = Math.max(group.delay, Number(value) || 0);
      else if (value) group.rules.push({ allow: key === "allow", pattern: value });
    }
  }
  groups.push(group);
  const product = agent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && product.includes(a)));
  const length = Math.max(0, ...specific.flatMap((g) => g.agents.filter((a) => a !== "*" && product.includes(a)).map((a) => a.length)));
  const selected = specific.length ? specific.filter((g) => g.agents.some((a) => a.length === length && product.includes(a))) : groups.filter((g) => g.agents.includes("*"));
  const path = new URL(url).pathname + new URL(url).search;
  const rules = selected.flatMap((g) => g.rules).filter((rule) => {
    const end = rule.pattern.endsWith("$");
    const pattern = (end ? rule.pattern.slice(0, -1) : rule.pattern).split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join(".*");
    return new RegExp("^" + pattern + (end ? "$" : ""), "u").test(path);
  }).sort((a, b) => b.pattern.replaceAll("*", "").length - a.pattern.replaceAll("*", "").length || Number(b.allow) - Number(a.allow));
  return { allowed: rules[0]?.allow ?? true, crawlDelayMs: Math.max(1000, ...selected.map((g) => g.delay * 1000)) };
}
