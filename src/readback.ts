// Reads persisted traces back from the neatlogs Public API. This is how the
// fixer gets its evidence, and how we prove every run actually landed.
//
// Credentials: NEATLOGS_TOKEN (expiring, project-bound service-account token)
// read inside this process only; never the SDK ingest key. Host defaults to
// the US dashboard origin; set NEATLOGS_HOST for EU.

export interface TraceSummary {
  traceId: string;
  sessionId: string;
  traceName: string | null;
  workflowName: string | null;
  status: string;
  startedAt: string;
  durationMs: number;
  spansCount: number;
  llmCallsCount: number;
  toolCallsCount: number;
  totalTokens: number;
  totalCostUsd: number;
  tags: string[];
  finalizationStatus: "pending" | "finalized" | "dlq" | null;
}

export interface SpanRow {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  spanName: string;
  spanType: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  model: string | null;
  provider: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface PayloadField {
  available: boolean;
  mimeType: string | null;
  truncated: boolean;
  value: string | null;
}

export class ReadbackError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class NeatlogsReader {
  readonly host: string;
  private projectId?: string;

  constructor(opts: { host?: string; projectId?: string } = {}) {
    this.host = (opts.host ?? process.env.NEATLOGS_HOST ?? "https://app.neatlogs.com").replace(/\/$/, "");
    this.projectId = opts.projectId ?? process.env.NEATLOGS_PROJECT_ID;
  }

  static available() {
    return !!process.env.NEATLOGS_TOKEN;
  }

  private async get<T>(path: string, query: Record<string, string | number | undefined> = {}, attempt = 0): Promise<T> {
    const token = process.env.NEATLOGS_TOKEN;
    if (!token) throw new ReadbackError("NEATLOGS_TOKEN is not set (a project-bound neatlogs service-account token with observability:read).");
    const url = new URL(this.host + path);
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    if (this.projectId) headers["x-project-id"] = this.projectId;
    const res = await fetch(url, { headers });
    if ((res.status === 429 || res.status === 503 || res.status === 409) && attempt < 6) {
      const ra = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 30) * 1000 : 1000 * 2 ** attempt);
      return this.get(path, query, attempt + 1);
    }
    if (!res.ok) {
      let detail = "";
      try {
        const p = (await res.json()) as { title?: string; detail?: string; code?: string };
        detail = [p.code, p.title, p.detail].filter(Boolean).join(": ");
      } catch {}
      throw new ReadbackError(`GET ${path} -> ${res.status} ${detail}`, res.status);
    }
    return ((await res.json()) as { data: T }).data;
  }

  async whoami() {
    const w = await this.get<{
      actor: { id: string; kind: string };
      context: { organizationId: string; projectId: string; authorization: { basis: string; effectivePermissions: string[] } };
      credential: { id: string; kind: string; scopes: string[]; serviceAccountId?: string };
    }>("/api/v1/public/whoami");
    if (!this.projectId && w.context?.projectId) this.projectId = w.context.projectId;
    return w;
  }

  async listTraces(q: { sessionId?: string; workflowName?: string; from?: string; to?: string; status?: string; maxPages?: number } = {}) {
    const out: TraceSummary[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < (q.maxPages ?? 10); page++) {
      const d = await this.get<{ traces: TraceSummary[]; page: { hasMore: boolean; nextCursor: string | null } }>("/api/v1/public/traces", {
        sessionId: q.sessionId,
        workflowName: q.workflowName,
        from: q.from,
        to: q.to,
        status: q.status,
        limit: 50,
        cursor,
      });
      out.push(...d.traces);
      if (!d.page.hasMore || !d.page.nextCursor) return { traces: out, complete: true };
      cursor = d.page.nextCursor;
    }
    return { traces: out, complete: false };
  }

  getTrace(traceId: string) {
    return this.get<TraceSummary>(`/api/v1/public/traces/${encodeURIComponent(traceId)}`);
  }

  async listSpans(traceId: string, maxPages = 20) {
    const out: SpanRow[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const d = await this.get<{ spans: SpanRow[]; page: { hasMore: boolean; nextCursor: string | null } }>(
        `/api/v1/public/traces/${encodeURIComponent(traceId)}/spans`,
        { limit: 50, cursor },
      );
      out.push(...d.spans);
      if (!d.page.hasMore || !d.page.nextCursor) return { spans: out, complete: true };
      cursor = d.page.nextCursor;
    }
    return { spans: out, complete: false };
  }

  async payload(traceId: string, spanId: string, fields = "input,output,error") {
    const d = await this.get<{ fields: Partial<Record<"input" | "output" | "error", PayloadField>> }>(
      `/api/v1/public/traces/${encodeURIComponent(traceId)}/spans/${encodeURIComponent(spanId)}/payload`,
      { fields },
    );
    return d.fields;
  }

  /** Wait (bounded) until the trace exists and is finalized. */
  async waitForTrace(traceId: string, timeoutMs = 120_000): Promise<TraceSummary> {
    const deadline = Date.now() + timeoutMs;
    let last: unknown;
    for (let i = 0; Date.now() < deadline; i++) {
      try {
        const t = await this.getTrace(traceId);
        if (t.finalizationStatus === "finalized" || t.finalizationStatus === null) return t;
        if (t.finalizationStatus === "dlq") throw new ReadbackError(`trace ${traceId} went to the dead-letter queue`);
        last = t.finalizationStatus;
      } catch (e) {
        if (!(e instanceof ReadbackError) || (e.status !== 404 && e.status !== 409)) throw e;
        last = e.message;
      }
      await sleep(Math.min(2000 * 1.5 ** i, 15_000));
    }
    throw new ReadbackError(`trace ${traceId} not finalized after ${timeoutMs / 1000}s (last: ${String(last)})`);
  }

  /**
   * Everything the fixer needs about one failed run, read from neatlogs:
   * the span tree in order, with tool/guardrail/agent/evaluator payloads.
   */
  async dossier(traceId: string) {
    const trace = await this.waitForTrace(traceId);
    const { spans, complete } = await this.listSpans(traceId);
    spans.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const steps = [];
    for (const s of spans) {
      const t = s.spanType.toUpperCase();
      const wantPayload = /TOOL|GUARDRAIL|EVALUATOR|AGENT|WORKFLOW/.test(t);
      let input: string | undefined, output: string | undefined, error: string | undefined, truncated = false;
      if (wantPayload) {
        const p = await this.payload(traceId, s.spanId);
        input = decode(p.input);
        output = decode(p.output);
        error = decode(p.error);
        truncated = !!(p.input?.truncated || p.output?.truncated || p.error?.truncated);
      }
      steps.push({ span: s.spanName, type: s.spanType, status: s.status, model: s.model ?? undefined, tokens: s.totalTokens || undefined, input, output, error, truncated: truncated || undefined });
    }
    return { trace, spansComplete: complete, steps };
  }
}

function decode(f?: PayloadField) {
  if (!f?.available || f.value == null) return undefined;
  const v = f.value.length > 1500 ? `${f.value.slice(0, 1500)}…` : f.value;
  return v;
}

export const traceUrl = (host: string, traceId: string) => `${host.replace(/\/$/, "")}/traces/${traceId}`;
