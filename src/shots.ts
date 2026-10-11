// Screenshots of the report for build-in-public posts.

import { existsSync, readdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "./versions.js";

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  const dir = existsSync(base) ? readdirSync(base).find((d) => d.startsWith("chromium-")) : undefined;
  return dir ? path.join(base, dir, "chrome-linux/chrome") : undefined;
}

export async function screenshots() {
  const { chromium } = await import("playwright-core");
  const page = path.join(ROOT, "site", "index.html");
  const outDir = path.join(ROOT, "site", "shots");
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromePath() });
  const p = await browser.newPage({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 2 });
  await p.goto(pathToFileURL(page).href);
  const out: string[] = [];
  const shot = async (name: string, fn: () => Promise<void>) => {
    const f = path.join(outDir, `${name}.png`);
    await fn.call(null);
    await p.screenshot({ path: f });
    out.push(f);
  };
  await shot("1-certificate", async () => p.evaluate(() => window.scrollTo(0, 0)));
  for (const [name, heading] of [["2-rounds", "Safety vs cost"], ["3-gate", "The gate at work"], ["4-tests", "The crash tests"], ["5-planted-bugs", "Testing the tests"]] as const) {
    const h = p.locator("h2", { hasText: heading });
    if (await h.count()) await shot(name, async () => h.first().evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 16)));
  }
  await browser.close();
  return out;
}
