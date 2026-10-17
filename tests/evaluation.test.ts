import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv, writeCsv } from "@/lib/evaluation/csv";
import { manifestSchema, readLabels, evaluateLabels, evaluationMarkdown, labelColumns } from "@/lib/evaluation/metrics";
import { redactIdentifiers, sampleExport } from "@/lib/evaluation/sample";
import { backtestTimeline } from "@/lib/evaluation/backtest";
import { fromSignal } from "@/lib/db/mapping";
import { topicSnapshot } from "@/lib/trends/snapshots";
import { now, observation } from "./helpers";

const synthetic = readFileSync("eval/synthetic-labels.csv", "utf8");
const manifest = manifestSchema.parse(JSON.parse(readFileSync("eval/synthetic-predictions.json", "utf8")) as unknown);

describe("honest evaluation arithmetic", () => {
  it("computes known synthetic P/R/F1, missing categories and pairwise clustering", () => {
    const result = evaluateLabels(readLabels(synthetic), manifest.predictions);
    expect(result.sampleSize).toBe(6);
    expect(result.spam).toMatchObject({ tp: 1, fp: 1, fn: 1, precision: 0.5, recall: 0.5, f1: 0.5 });
    expect(result.location).toMatchObject({ tp: 3, fp: 1, fn: 1, precision: 0.75, recall: 0.75 });
    expect(result.category).toMatchObject({ accuracy: 0.5, unclassified: 1 });
    expect(result.category.classes.find((c) => c.name === "traffic")?.f1).toBeCloseTo(2 / 3);
    expect(result.clustering).toMatchObject({ tp: 1, fp: 2, fn: 1, precision: 1 / 3, recall: 0.5, f1: 0.4, items: 4 });
    const markdown = evaluationMarkdown(result, { date: "2026-10-18", commit: "a".repeat(40), sampleCommit: manifest.commit, synthetic: true, dirty: false });
    expect(markdown).toContain("SYNTHETIC FIXTURE"); expect(markdown).toContain("N/A");
  });
  it("does not invent perfection for empty denominators and rejects incomplete/mismatched labels", () => {
    const labels = readLabels(synthetic).slice(0, 1), predictions = manifest.predictions.slice(0, 1);
    expect(evaluateLabels(labels, predictions).spam.precision).toBeNull();
    expect(evaluateLabels(labels, predictions).clustering.f1).toBeNull();
    expect(() => readLabels(writeCsv([labelColumns, ["id", "gdelt", "English", "Text", "", "", "", ""]]))).toThrow();
    expect(() => readLabels(synthetic + synthetic.split("\n")[2] + "\n")).toThrow("LABEL_DUPLICATE_ID");
    expect(() => evaluateLabels(readLabels(synthetic), predictions)).toThrow("PREDICTION_IDS_INVALID");
  });
});
describe("private, unfilled sampling exports", () => {
  it("round-trips quoted multiline Unicode CSV and rejects malformed quotes", () => {
    const rows = [["a,b", 'a "quote"', "line\nnext", "ಬೆಂಗಳೂರು"]];
    expect(parseCsv(writeCsv(rows))).toEqual(rows);
    expect(() => parseCsv('"unclosed')).toThrow("CSV_INVALID");
    expect(() => parseCsv('"closed"suffix')).toThrow("CSV_INVALID");
  });
  it("strips handles, DIDs and profile links without filling truth labels", () => {
    const raw = "@author.bsky.social did:plc:secret https://bsky.app/profile/did:plc:secret/post/123 at://did:plc:secret/post/123 author@example.org Bengaluru metro";
    const safe = redactIdentifiers(raw);
    for (const identifier of ["@author", "did:", "author@example", "bsky.app/profile", "at://"]) expect(safe).not.toContain(identifier);
    expect(redactIdentifiers("=SUM(1,2)")).toBe("'=SUM(1,2)");
    const signal = { ...observation("profile-id", 0.5), title: raw.slice(0, 300), text: raw, excerpt: raw };
    const output = sampleExport([{ item: fromSignal(signal), category: null }]);
    const [header, row] = parseCsv(output.csv);
    expect(header).toEqual(labelColumns); expect(row!.slice(4)).toEqual(["", "", "", ""]);
    expect(row![0]).toMatch(/^[a-f0-9]{64}$/u); expect(output.predictions[0]?.category).toBeNull();
    expect(output.csv).not.toContain("did:");
  });
});
describe("evaluation CLI safeguards and stored timelines", () => {
  it("runs the synthetic CLI without changing real results or README", () => {
    const docs = readFileSync("docs/evaluation.md", "utf8"), readme = readFileSync("README.md", "utf8");
    const output = execFileSync(process.execPath, ["--import", "tsx", "--conditions=react-server", "scripts/eval.ts", "--labels", "eval/synthetic-labels.csv", "--predictions", "eval/synthetic-predictions.json", "--synthetic"], { encoding: "utf8" });
    expect(output).toContain('"synthetic":true');
    expect(readFileSync("docs/evaluation.md", "utf8")).toBe(docs); expect(readFileSync("README.md", "utf8")).toBe(readme);
    expect(readFileSync(".cache/eval-synthetic.md", "utf8")).toContain("SYNTHETIC FIXTURE");
  });
  it("refuses incomplete real labels and synthetic-to-real report confusion", () => {
    mkdirSync(".cache", { recursive: true }); writeFileSync(".cache/eval-incomplete.csv", writeCsv([labelColumns, ["id", "gdelt", "English", "Text", "", "", "", ""]]));
    const before = readFileSync("docs/evaluation.md", "utf8");
    for (const labels of [".cache/eval-incomplete.csv", "eval/synthetic-labels.csv"]) {
      const result = spawnSync(process.execPath, ["--import", "tsx", "--conditions=react-server", "scripts/eval.ts", "--labels", labels, "--predictions", "eval/synthetic-predictions.json"], { encoding: "utf8" });
      expect(result.status).toBe(1);
    }
    expect(readFileSync("docs/evaluation.md", "utf8")).toBe(before);
  });
  it("preserves stored values and versions, with no inserted zeroes for gaps", () => {
    const point = topicSnapshot("topic", [observation("timeline", 0.5)], now);
    const previous = { ...point, capturedAt: "2026-10-01T10:00:00.000Z", algorithmVersion: "v2" as const, pulseScore: 17 };
    const timeline = backtestTimeline("test-topic", [point, previous]);
    const csv = parseCsv(timeline.csv);
    expect(csv).toHaveLength(3); expect(csv[1]![2]).toBe("17"); expect(csv[2]![2]).toBe(String(point.pulseScore));
    expect(timeline.markdown).toContain("v2"); expect(timeline.markdown).toContain("v3");
    expect(backtestTimeline("test-topic", []).markdown).toContain("No stored snapshots");
  });
});
