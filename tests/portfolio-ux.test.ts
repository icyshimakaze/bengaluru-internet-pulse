import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { detectLanguage } from "@/lib/domain/language";
import { LanguageBadge } from "@/components/language-badge";
import { leadEligible } from "@/lib/trends/lead-eligibility";
import { statusLabel } from "@/lib/trends/status-label";
import { pulseMetadata } from "@/lib/trends/dashboard-presentation";
import { demoReadState, projectDashboard } from "@/lib/server/projections";
import { siteSettings } from "@/lib/server/site-config";
import { now } from "./helpers";

describe("public reading helpers", () => {
  it.each([["Bengaluru traffic", "English"], ["ಬೆಂಗಳೂರಿನಲ್ಲಿ ಮಳೆ", "Kannada"], ["बेंगलुरु में बारिश", "Hindi"],
    ["பெங்களூரில் மழை", "Tamil"], ["বাংলা", "other"], ["123 !", "other"], ["ಬೆಂಗಳೂರು metro", "Kannada"]])("labels script in %s", (text, expected) => {
    expect(detectLanguage(text)).toBe(expected);
  });
  it("omits English badges and escapes other labels", () => {
    expect(renderToStaticMarkup(createElement(LanguageBadge, { text: "English headline" }))).toBe("");
    expect(renderToStaticMarkup(createElement(LanguageBadge, { text: "ಕನ್ನಡ" }))).toContain("Kannada");
  });
  it("keeps zero-score, zero-confidence and sparse topics outside the lead", () => {
    expect(leadEligible({ score: 35, confidence: 0.35, current2h: 2 })).toBe(true);
    for (const topic of [{ score: 0, confidence: 0.5, current2h: 2 }, { score: 35, confidence: 0, current2h: 2 },
      { score: 20, confidence: 0.5, current2h: 1 }]) expect(leadEligible(topic)).toBe(false);
  });
  it("does not call heuristic fallback degraded, but records repeated source failures", () => {
    const demo = projectDashboard(demoReadState(now), { window: "now" }, now);
    const pulse = { ...pulseMetadata(demo), mode: "live" as const, status: "degraded" as const, stale: false,
      lastSuccessfulIngestion: now.toISOString(), sources: demo.sources.map((s) => ({ ...s, status: "ok" as const, lastSuccessAt: now.toISOString(), consecutiveFailures: 0 })) };
    expect(statusLabel(pulse, now.getTime())).toBe("Live");
    expect(statusLabel({ ...pulse, sources: pulse.sources.map((s) => ({ ...s, consecutiveFailures: 2 })) }, now.getTime())).toBe("Degraded");
    expect(statusLabel({ ...pulse, stale: true }, now.getTime())).toBe("Stale");
  });
  it("validates the optional contact address", () => {
    expect(siteSettings({ CONTACT_EMAIL: "" }).CONTACT_EMAIL).toBeUndefined();
    expect(siteSettings({ CONTACT_EMAIL: "author@example.org" }).CONTACT_EMAIL).toBe("author@example.org");
    expect(() => siteSettings({ CONTACT_EMAIL: "bad\r\naddress" })).toThrow();
  });
});
