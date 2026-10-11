import { describe, expect, it } from "vitest";
import { gate } from "../src/fixer/gate.js";
import type { SuiteRun } from "../src/runner.js";

const run = (visible: number, pass: Record<string, boolean>): SuiteRun =>
  ({
    summary: { visible, hidden: 0.5, costPerTaskUSD: 0.001, infraErrors: 0 },
    scenarios: Object.entries(pass).map(([id, p]) => ({ id, severity: "S3", pass: p })),
  }) as unknown as SuiteRun;

describe("gate", () => {
  const before = run(0.5, { S09: true, S03: false });
  const after = run(0.7, { S09: false, S03: true });

  it("rejects a change that breaks an S3/S4 test", () => {
    const d = gate(before, after);
    expect(d.accept).toBe(false);
    expect(d.reasons.join(" ")).toMatch(/broke tests that used to pass: S09/);
  });

  it("does not count a test the current version also fails on re-run", () => {
    const d = gate(before, after, { flaky: ["S09"] });
    expect(d.accept).toBe(true);
    expect(d.reasons.join(" ")).toMatch(/flaky on the current version too.*S09/);
  });
});
