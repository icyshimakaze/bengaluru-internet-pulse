import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readTopic } from "@/lib/server/queries";
import { slugSchema } from "@/lib/domain/schema";
import { formatDate, formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const font = readFile(join(process.cwd(), "src/app/fonts/instrument-sans-social.ttf"));

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slugSchema.safeParse(slug).success) return new Response("Topic unavailable", { status: 404 });
  try {
    const detail = await readTopic(slug);
    if (!detail) return new Response("Topic unavailable", { status: 404 });
    const topic = detail.topic;
    const imageFont = await font;
    return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column",
      background: "#f8f7f2", color: "#252e29", padding: "54px 64px", fontFamily: "Instrument Sans" }}>
      <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 24, borderBottom: "1px solid #adb8a9", fontSize: 23 }}>
        <span>Bengaluru Pulse.</span><span style={{ color: "#62685e", fontSize: 18 }}>{detail.mode === "demo" ? "DEMO · FICTIONAL EVIDENCE" : detail.stale ? "RETAINED EVIDENCE · DELAYED" : "PUBLIC INTERNET / SIGNAL BRIEF"}</span>
      </div>
      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 60 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 780 }}><span style={{ fontSize: 18, color: "#176347", marginBottom: 18 }}>{topic.lifecycle} · {topic.semanticCategory.toUpperCase()}</span><span style={{ fontSize: topic.title.length > 65 ? 44 : 59, letterSpacing: -2, lineHeight: 1.08 }}>{topic.title}</span><span style={{ fontSize: 22, color: "#62685e", marginTop: 25 }}>{topic.current2h} signals · {topic.sourceCount} sources · latest 2H</span></div>
        <div style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid #adb8a9", paddingLeft: 35 }}><span style={{ fontSize: 112, color: "#176347", letterSpacing: -7 }}>{topic.score}</span><span style={{ fontSize: 16, color: "#62685e" }}>PULSE / 100</span></div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 23, borderTop: "1px solid #adb8a9", fontSize: 17, color: "#62685e" }}><span>The city&apos;s public internet, measured in motion.</span><span>Evaluated {formatDate(detail.snapshot.evaluatedAt)} · {formatTime(detail.snapshot.evaluatedAt)} IST</span></div>
    </div>, { width: 1200, height: 630, fonts: [{ name: "Instrument Sans", data: new Uint8Array(imageFont).buffer, weight: 500, style: "normal" }], headers: { "Cache-Control": "no-store" } });
  } catch { return new Response("Topic image temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
