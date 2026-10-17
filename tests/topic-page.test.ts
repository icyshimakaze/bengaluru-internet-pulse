import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { demoReadState, projectTopic } from "@/lib/server/projections";
import { FIXTURE_NOW } from "@/fixtures/demo";
import { topicDetailSchema } from "@/lib/domain/read-models";
vi.mock("@/lib/server/queries", async (original) => ({ ...await original<typeof import("@/lib/server/queries")>(), readTopic: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("TOPIC_NOT_FOUND"); }, useRouter: () => ({ refresh: vi.fn() }) }));
import { readTopic, ReadUnavailableError } from "@/lib/server/queries";
import TopicPage, { generateMetadata } from "@/app/topic/[slug]/page";
import TopicLoading from "@/app/topic/[slug]/loading";
import TopicError from "@/app/topic/[slug]/error";
import TopicNotFound from "@/app/topic/[slug]/not-found";
import { SnapshotHistory } from "@/components/snapshot-history";
const props = (slug = "namma-metro") => ({ params: Promise.resolve({ slug }) });
const fixture = () => projectTopic(demoReadState(FIXTURE_NOW, "namma-metro"), "namma-metro", FIXTURE_NOW)!;
beforeEach(() => { vi.clearAllMocks(); vi.mocked(readTopic).mockResolvedValue(fixture()); });
describe("topic brief rendering boundaries", () => {
  it("does not turn fictional evidence into dead original-source links", async () => {
    const html = renderToStaticMarkup(await TopicPage(props()));
    expect(html).toContain("Fictional example");
    expect(html).not.toContain('href="https://example.com/fixtures/');
    expect(html).not.toContain("Open Example");
    expect(html).not.toContain("Open Original");
  });
  it("gives each topic its own canonical and share summary without presenting fixtures as live evidence", async () => {
    const meta = await generateMetadata(props());
    expect(String(meta.alternates?.canonical)).toBe("https://bengaluru-internet-pulse.vercel.app/topic/namma-metro");
    expect(meta.description).toContain("Fictional demo evidence.");
    expect(meta.openGraph).toMatchObject({ title: "Namma Metro | Bengaluru Pulse", description: meta.description });
  });
  it("renders stored metrics and original links with no full source content", async () => {
    const data = fixture();
    data.sourceEvidence[0]!.excerpt = "FULL_CONTENT_SENTINEL";
    const live = topicDetailSchema.parse({ ...data, mode: "live", status: "healthy", notice: null });
    vi.mocked(readTopic).mockResolvedValue(live);
    const html = renderToStaticMarkup(await TopicPage(props()));
    expect(html).toContain("Why is this rising?");
    expect(html).toContain("Open Original");
    expect(html).toContain("https://example.com/fixtures/");
    expect(html).toContain("Source evidence");
    expect(html).toContain("First detected");
    expect(html).not.toContain("FULL_CONTENT_SENTINEL");
    expect(html).toContain("Whitefield");
  });
  it("shows empty evidence, no recorded history and unknown location honestly", async () => {
    const state = demoReadState(FIXTURE_NOW, "namma-metro");
    const data = projectTopic({ ...state, items: [], history: [] }, "namma-metro", FIXTURE_NOW)!;
    vi.mocked(readTopic).mockResolvedValue(data);
    const html = renderToStaticMarkup(await TopicPage(props()));
    expect(html).toContain("No recent source evidence.");
    expect(html).toContain("No snapshots in this window.");
    expect(html).toContain("No related source items");
    expect(html).toContain("Citywide / Unknown");
    expect(html).toContain("No peak recorded");
    expect(html).toContain("No retained RISING snapshot");
    expect(html).toContain("Why is this cooling?");
    expect(html).not.toContain("<h3>Whitefield</h3>");
  });
  it("escapes untrusted titles instead of interpreting markup", async () => {
    const data = fixture();
    data.sourceEvidence[0]!.title = "<script>UNTRUSTED_CONTENT</script>";
    vi.mocked(readTopic).mockResolvedValue(data);
    const html = renderToStaticMarkup(await TopicPage(props()));
    expect(html).toContain("&lt;script&gt;UNTRUSTED_CONTENT&lt;/script&gt;");
    expect(html).not.toContain("<script>UNTRUSTED_CONTENT</script>");
  });
  it("handles unavailable storage with a retry without displaying internal error text", async () => {
    vi.mocked(readTopic).mockRejectedValue(new ReadUnavailableError());
    const html = renderToStaticMarkup(await TopicPage(props()));
    expect(html).toContain("Retry topic"); expect(html).toContain("temporarily unavailable");
    expect(await generateMetadata(props())).toMatchObject({ title: "Topic unavailable", robots: { index: false } });
  });
  it("distinguishes missing topics from storage failures and validates slugs before reads", async () => {
    await expect(TopicPage(props("bad_slug"))).rejects.toThrow("TOPIC_NOT_FOUND");
    expect(readTopic).not.toHaveBeenCalled();
    vi.mocked(readTopic).mockResolvedValue(null);
    await expect(TopicPage(props())).rejects.toThrow("TOPIC_NOT_FOUND");
  });
  it("provides route loading, unexpected-error recovery and an archive-specific not-found state", () => {
    expect(renderToStaticMarkup(createElement(TopicLoading))).toContain("Loading the topic intelligence brief");
    const html = renderToStaticMarkup(createElement(TopicError, { error: new Error("SECRET_SENTINEL"), reset: vi.fn() }));
    expect(html).toContain("Retry topic"); expect(html).not.toContain("SECRET_SENTINEL");
    expect(renderToStaticMarkup(createElement(TopicNotFound))).toContain("Cooling topics remain accessible");
  });
  it("isolates archival scoring versions and clearly labels a single saved snapshot", () => {
    const row = fixture().history.at(-1)!;
    const html = renderToStaticMarkup(createElement(SnapshotHistory, { history: [{ ...row, algorithmVersion: "v1" }],
      evaluatedAt: FIXTURE_NOW.toISOString(), mode: "live", truncated: true }));
    expect(html).toContain("1 SNAPSHOTS");
    expect(html).toContain("V1");
    expect(html).toContain("One recorded snapshot");
    expect(html).toContain("Archived v1 scores retain their original equation");
    expect(html).toContain("earlier milestones may be absent");
  });
});
