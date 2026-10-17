import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { manifestSchema, readLabels, evaluateLabels, evaluationMarkdown, resultTable } from "../src/lib/evaluation/metrics";
import { digest } from "../src/lib/evaluation/sample";

try {
  const args = z.object({ labels: z.string().default("eval/labels.csv"), predictions: z.string().default("eval/predictions.json"), synthetic: z.boolean().default(false) }).parse(parseArgs({ options: {
    labels: { type: "string" }, predictions: { type: "string" }, synthetic: { type: "boolean" },
  } }).values);
  const labels = readLabels(readFileSync(args.labels, "utf8")), manifest = manifestSchema.parse(JSON.parse(readFileSync(args.predictions, "utf8")) as unknown);
  if ((manifest.kind === "synthetic") !== args.synthetic) throw new Error("EVAL_SYNTHETIC_FLAG_MISMATCH");
  const predictions = new Map(manifest.predictions.map((p) => [p.id, p]));
  if (labels.some((row) => { const p = predictions.get(row.id); return !p || p.textHash !== digest(row.text) || p.source !== row.source || p.language !== row.language; })) throw new Error("EVAL_SAMPLE_MISMATCH");
  const result = evaluateLabels(labels, manifest.predictions), commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const report = evaluationMarkdown(result, { date, commit, synthetic: args.synthetic, sampleCommit: manifest.commit, dirty: manifest.dirty })
    + `\nSample note: ${manifest.note?.replace(/[<>\r\n]/gu, " ") ?? "Not recorded"}. Observations: ${manifest.observationStart ?? "unknown"} to ${manifest.observationEnd ?? "unknown"}.\n`;
  const output = args.synthetic ? ".cache/eval-synthetic.md" : "docs/evaluation.md";
  if (args.synthetic) { mkdirSync(".cache", { recursive: true }); writeFileSync(output, report); }
  else {
    const original = readFileSync(output, "utf8"), pattern = /<!-- RESULTS_START -->[\s\S]*?<!-- RESULTS_END -->/u;
    if (!pattern.test(original)) throw new Error("EVAL_RESULTS_MARKERS_MISSING");
    writeFileSync(output, original.replace(pattern, `<!-- RESULTS_START -->\n${report}\n<!-- RESULTS_END -->`));
    if (existsSync("README.md")) {
      const readme = readFileSync("README.md", "utf8");
      writeFileSync("README.md", readme.replace(/<!-- EVALUATION_START -->[\s\S]*?<!-- EVALUATION_END -->/u,
        `<!-- EVALUATION_START -->\n${resultTable(result)}\n\n${result.sampleSize} hand-labeled items; ${date}. [Method and limits](docs/evaluation.md).\n<!-- EVALUATION_END -->`));
    }
  }
  console.info(JSON.stringify({ event: "eval.completed", sampleSize: result.sampleSize, synthetic: args.synthetic, output }));
} catch (error) {
  const code = error instanceof Error && /^EVAL_[A-Z_]+$/u.test(error.message) ? error.message : "EVAL_LABELS_INCOMPLETE_OR_INVALID";
  console.error(JSON.stringify({ event: "eval.failed", code })); process.exitCode = 1;
}
