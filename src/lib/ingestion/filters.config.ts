import "server-only";
import { z } from "zod";
import type { FilterReason } from "@/lib/domain/filter-reasons";
export { filterReasonSchema } from "@/lib/domain/filter-reasons";
export const filterConfigSchema = z.object({
  jobDomains: z.array(z.string().regex(/^[a-z0-9.-]+$/u)),
  minimumLetters: z.number().int().min(1).max(100),
  hashtagLimit: z.number().int().min(3).max(100),
}).strict();
export const filterConfig = filterConfigSchema.parse({
  jobDomains: ["ai-jobs.net", "aijobs.net", "naukri.com", "indeed.com", "wellfound.com", "foundit.in", "jobright.ai", "hirist.tech", "cutshort.io"],
  minimumLetters: 8, hashtagLimit: 8,
});

/** Auditable content rules, not a claim that an author is a bot. Retain all rows. */
export function filterSignal(input: { title: string; excerpt: string; canonicalUrl?: string; originalUrl?: string }, config = filterConfig): FilterReason | null {
  const { jobDomains, minimumLetters, hashtagLimit } = filterConfigSchema.parse(config);
  const text = `${input.title} ${input.excerpt}`.normalize("NFKC");
  const links = [input.canonicalUrl, input.originalUrl, ...(text.match(/https?:\/\/[^\s<>]+/giu) ?? [])];
  const jobLink = links.some((link) => {
    if (!link) return false;
    try {
      const url = new URL(link), host = url.hostname.toLowerCase();
      return jobDomains.some((domain) => host === domain || host.endsWith(`.${domain}`))
        || (host === "linkedin.com" || host.endsWith(".linkedin.com")) && url.pathname.startsWith("/jobs/");
    } catch { return false; }
  });
  // Company-name recruiting posts often omit both hashtags and job-board links.
  // Require an advertised role plus an application/work-arrangement/pay cue;
  // reporting on hiring trends alone is not a job advertisement.
  const advertisedRole = /\bhiring\b[\s:–-]+(?:(?:a|an|for|principal|senior|staff|lead|junior|software|data|product|full[- ]stack|frontend|backend|ai|ml)\s+){0,4}(?:engineers?|developers?|designers?|analysts?|scientists?|managers?|architects?|cto|interns?|recruiters?)\b/iu.test(text)
    && /\b(?:apply|wfo|wfh|full[ -]time|part[ -]time|salary|package|lpa|ctc)\b/iu.test(text);
  if (jobLink || advertisedRole || /#(?:aijobs|hiring|jobopening|jobopenings|jobsinbangalore)\b|\b(?:we(?:'re| are) hiring|job vacancies|job opening|apply for this job|job\s+\d{3,})\b/iu.test(text)) return "job_posting";
  if (/#weatherbot\b|\bautomated weather (?:update|report)\b|\bweather (?:update|report)\b[\s\S]*\bhumidity\b[\s\S]*\bwind\b/iu.test(text)) return "weather_bot";
  // Title and excerpt often repeat. Count the substantive body once.
  const body = input.excerpt.includes(input.title) ? input.excerpt : text;
  const hashtags = body.match(/#[\p{L}\p{M}\p{N}_]+/gu) ?? [];
  if (hashtags.length >= hashtagLimit) return "hashtag_spam";
  const prose = body.replace(/https?:\/\/\S+|#[\p{L}\p{M}\p{N}_]+/giu, "");
  if ((prose.match(/\p{L}/gu) ?? []).length < minimumLetters) return "near_empty";
  return null;
}
