// Renders each scene of the demo video to a 1920x1080 PNG.
// slide:* = generated title/trace/closing cards; site:* = sections of site/index.html; file:* = an existing image.
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [outDir, extraDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const scenes = JSON.parse(readFileSync("video/scenes.json", "utf8"));
const trace = JSON.parse(readFileSync("video/trace-S03.json", "utf8"));

const css = `:root{--bg:#f7f6f2;--card:#fff;--ink:#16181d;--muted:#5d636f;--line:#e2e0d8;--accent:#c2410c;--good:#15803d;--bad:#b91c1c;--star:#e0a100}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:22px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;width:1280px;height:720px;overflow:hidden}
.wrap{padding:56px 72px;height:720px;display:flex;flex-direction:column}.k{color:var(--muted);font-size:18px;letter-spacing:.04em;text-transform:uppercase}
h1{font-size:64px;margin:8px 0 12px;line-height:1.05}.sub{font-size:28px;color:var(--muted);max-width:980px}.bar{height:8px;background:var(--accent);border-radius:4px;width:120px;margin:24px 0}
code,.m{font:15px ui-monospace,SFMono-Regular,Menlo,monospace}.row{display:flex;gap:10px;align-items:baseline;padding:5px 0;border-bottom:1px solid var(--line)}
.t{font:600 12px ui-monospace,monospace;padding:2px 7px;border-radius:6px;border:1px solid var(--line);min-width:86px;text-align:center}.err{color:var(--bad);font-weight:700}
.q{font-size:17px}.bubble{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 14px;margin:6px 0;font-size:17px}
.stats{display:flex;gap:18px}.stat{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 20px;flex:1}.stat .v{font-size:34px;font-weight:700}.stat .d{color:var(--muted);font-size:15px}`;

const step = (type, name) => trace.steps.find((s) => s.type === type && (!name || s.span === name));
const reply = (s) => { try { const o = JSON.parse(s.output); return (o.message.match(/message="([^"]*)"/) || [, o.message])[1]; } catch { return s.output; } };
const turns = trace.steps.filter((s) => s.type === "AGENT");
const tool = step("TOOL");
const verdict = JSON.parse(step("EVALUATOR").output);

const slides = {
  title: `<div class="wrap"><div class="k">neatHack 2026 · team Crashworthy</div><div style="margin-top:auto"><h1>Crashworthy</h1><div class="bar"></div>
<div class="sub">Crash tests and a 5-star safety rating for AI agents that move money. Built on <b style="color:var(--ink)">neatlogs</b>, with every fix recorded by <b style="color:var(--ink)">Entire</b>.</div></div>
<div class="m" style="margin-top:auto;color:var(--muted)">github.com/NECOKIZZ/Crashworthy</div></div>`,
  trace: `<div class="wrap" style="padding:40px 64px"><div class="k">neatlogs trace ${trace.trace.traceId} · read back through the Public API</div>
<h1 style="font-size:38px;margin:6px 0 4px">${trace.trace.traceName} <span class="err">● ${trace.trace.status}</span></h1>
<div class="m" style="color:var(--muted);margin-bottom:12px">workflow ${trace.trace.workflowName} · session ${trace.trace.sessionId} · ${trace.trace.spansCount} spans · ${trace.trace.llmCallsCount} LLM calls · ${trace.trace.totalTokens} tokens · model nova-lite</div>
<div class="bubble"><b>Engineer:</b> ${JSON.parse(turns[0].input)}</div>
<div class="row"><span class="t">TOOL</span><code>${tool.span}(${tool.input})</code> → <code>${tool.output}</code></div>
<div class="bubble"><b>Agent:</b> ${reply(turns[1])}</div>
<div class="row"><span class="t">EVALUATOR</span><span class="q">${verdict.map((v) => `${v.pass ? "✓" : '<span class="err">✗</span>'} ${v.rule}${v.detail ? ` → <b class="err">${v.detail}</b>` : ""}`).join("<br>")}</span></div>
</div>`,
  close: `<div class="wrap"><div class="k">Real numbers from real runs</div><h1 style="font-size:52px">Agents earn trust<br>before they touch money.</h1>
<div class="stats" style="margin-top:90px"><div class="stat"><div class="v">1★ → 2★</div><div class="d">worst-of-3, 16 incident tests</div></div><div class="stat"><div class="v">40% → 65%</div><div class="d">visible safety · hidden held</div></div>
<div class="stat"><div class="v">10/10</div><div class="d">planted bugs caught</div></div><div class="stat"><div class="v">$0.058</div><div class="d">per certification · 99% gross margin (cfo.ai)</div></div></div>
<div class="m" style="margin-top:28px;color:var(--muted)">github.com/NECOKIZZ/Crashworthy · #neatHack · neatlogs · Entire · cfo.ai</div></div>`,
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
for (const s of scenes) {
  const out = path.join(outDir, `${s.id}.png`);
  const [kind, arg] = s.shot.split(":");
  if (kind === "file") { copyFileSync(path.join(extraDir, arg), out); continue; }
  if (kind === "slide") {
    await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${slides[arg]}</body></html>`);
  } else {
    await p.goto(pathToFileURL(path.resolve("site/index.html")).href);
    if (arg === "top") await p.evaluate(() => window.scrollTo(0, 0));
    else await p.locator("h2", { hasText: arg }).first().evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 16));
  }
  await p.screenshot({ path: out });
}
await b.close();
console.log("captured", scenes.length);
