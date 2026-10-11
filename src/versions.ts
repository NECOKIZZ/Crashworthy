// An agent version = a system prompt + a guards module. The live version is
// src/dummy/; every version the fixer tries is snapshotted under versions/<id>/.

import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AgentConfig } from "./dummy/agent.js";
import type { Guard } from "./dummy/guard-api.js";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const LIVE_DIR = path.join(ROOT, "src/dummy");
export const VERSIONS_DIR = path.join(ROOT, "versions");

export async function loadAgent(dir = LIVE_DIR, version?: string): Promise<AgentConfig> {
  const prompt = await readFile(path.join(dir, "prompt.md"), "utf8");
  const mod = (await import(`${pathToFileURL(path.join(dir, "guards.ts")).href}?v=${Date.now()}`)) as { guards: Guard[] };
  const v = version ?? (dir === LIVE_DIR ? await liveVersion() : path.basename(dir));
  return { version: v, prompt, guards: mod.guards };
}

export async function liveVersion(): Promise<string> {
  const f = path.join(LIVE_DIR, "VERSION");
  return existsSync(f) ? (await readFile(f, "utf8")).trim() : "v1";
}

// Relative imports are written as seen from src/dummy/ (the live location).
const toVersionImports = (src: string) =>
  src.replace(/(from\s+|import\s*\(\s*)"(\.{1,2}\/[^"]+)"/g, (_m, pre: string, spec: string) => {
    if (spec.startsWith("../../src/")) return `${pre}"${spec}"`;
    const abs = path.posix.join("src/dummy", spec);
    return `${pre}"../../${abs}"`;
  });
export const toLiveImports = (src: string) =>
  src.replace(/(from\s+|import\s*\(\s*)"\.\.\/\.\.\/(src\/[^"]+)"/g, (_m, pre: string, spec: string) => {
    let rel = path.posix.relative("src/dummy", spec);
    if (!rel.startsWith(".")) rel = `./${rel}`;
    return `${pre}"${rel}"`;
  });

export async function snapshot(id: string, prompt: string, guardsSource: string): Promise<string> {
  const dir = path.join(VERSIONS_DIR, id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "prompt.md"), prompt);
  await writeFile(path.join(dir, "guards.ts"), toVersionImports(guardsSource));
  return dir;
}

export async function readSources(dir = LIVE_DIR) {
  return {
    prompt: await readFile(path.join(dir, "prompt.md"), "utf8"),
    guards: toLiveImports(await readFile(path.join(dir, "guards.ts"), "utf8")),
  };
}

/** Make a snapshot the live agent. */
export async function promote(dir: string, id: string) {
  await copyFile(path.join(dir, "prompt.md"), path.join(LIVE_DIR, "prompt.md"));
  await writeFile(path.join(LIVE_DIR, "guards.ts"), toLiveImports(await readFile(path.join(dir, "guards.ts"), "utf8")));
  await writeFile(path.join(LIVE_DIR, "VERSION"), `${id}\n`);
}
