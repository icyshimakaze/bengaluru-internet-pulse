import { describe, expect, it, vi } from "vitest";
import * as engine from "@/lib/trends/engine";
import { demoReadState, projectDashboard, projectTopic, projectTopicList } from "@/lib/server/projections";
import { chartHistory } from "@/lib/trends/chart-history";
import { FIXTURE_NOW } from "@/fixtures/demo";
import { abortableRead } from "@/lib/client/abortable-read";

describe("read projection performance", () => {
  it("evaluates deterministic topic metrics once per response, independent of the views it includes", () => {
    const state = demoReadState(FIXTURE_NOW);
    const evaluate = vi.spyOn(engine, "evaluateTopics");
    expect(projectDashboard(state, { window: "2h" }, FIXTURE_NOW).topTopics).toHaveLength(6);
    expect(evaluate).toHaveBeenCalledTimes(1);
    evaluate.mockClear();
    expect(projectDashboard(state, { window: "now" }, FIXTURE_NOW).topTopics).toHaveLength(6);
    expect(evaluate).toHaveBeenCalledTimes(1);
    evaluate.mockClear();
    expect(projectTopicList(state, { window: "2h", limit: 50 }, FIXTURE_NOW).total).toBe(6);
    expect(evaluate).toHaveBeenCalledTimes(1);
    evaluate.mockClear();
    expect(projectTopic(state, "namma-metro", FIXTURE_NOW)?.sourceEvidence.length).toBeGreaterThan(0);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
  it("keeps homepage chart props small without dropping any displayed score or timestamp", () => {
    const detail = projectTopic(demoReadState(FIXTURE_NOW, "namma-metro"), "namma-metro", FIXTURE_NOW)!;
    const chart = chartHistory(detail);
    expect(chart.history.map((row) => [row.capturedAt, row.pulseScore, row.algorithmVersion]))
      .toEqual(detail.history.map((row) => [row.capturedAt, row.pulseScore, row.algorithmVersion]));
    expect(chart.generatedAt).toBe(detail.generatedAt);
    expect(chart.evaluatedAt).toBe(detail.snapshot.evaluatedAt);
    expect(JSON.stringify(chart).length).toBeLessThan(JSON.stringify(detail).length / 5);
    expect(chart).not.toHaveProperty("sourceEvidence");
    expect(chart).not.toHaveProperty("relatedSignals");
  });
});

describe("lazy validation deadlines", () => {
  it("ends a read when validation stalls after the HTTP response has completed", async () => {
    const controller = new AbortController();
    const pending = abortableRead(Promise.all([Promise.resolve("response"), new Promise<never>(() => undefined)]), controller.signal);
    controller.abort(new Error("READ_DEADLINE"));
    await expect(pending).rejects.toThrow("READ_DEADLINE");
  });
  it("preserves completed results and leaves no abort subscription behind", async () => {
    const controller = new AbortController(), remove = vi.spyOn(controller.signal, "removeEventListener");
    await expect(abortableRead(Promise.resolve("validated"), controller.signal)).resolves.toBe("validated");
    await Promise.resolve();
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    controller.abort();
  });
});
