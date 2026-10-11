import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { snapshot, readSources } from "../src/versions.js";

describe("version snapshots", () => {
  it("rewrites relative imports both ways", async () => {
    const src = `import type { Guard } from "./guard-api.js";\nimport { APPROVAL_LIMIT } from "../sandbox.js";\nexport const guards: Guard[] = [];\n`;
    const dir = await snapshot(`test-${process.pid}`, "p", src);
    const snap = await readFile(`${dir}/guards.ts`, "utf8");
    expect(snap).toContain('from "../../src/dummy/guard-api.js"');
    expect(snap).toContain('from "../../src/sandbox.js"');
    expect((await readSources(dir)).guards).toBe(src);
    await import("node:fs/promises").then((fs) => fs.rm(dir, { recursive: true }));
  });
});
