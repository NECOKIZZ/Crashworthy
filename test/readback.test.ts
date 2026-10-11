import { describe, expect, it } from "vitest";
import { ReadbackError, toOperation } from "../src/readback.js";

describe("toOperation", () => {
  it("maps whoami", () => {
    expect(toOperation("/api/v1/public/whoami")).toEqual({ operationId: "get_api_v1_public_whoami", params: {} });
  });

  it("maps the trace list", () => {
    expect(toOperation("/api/v1/public/traces")).toEqual({ operationId: "get_api_v1_public_traces", params: {} });
  });

  it("maps a single trace", () => {
    expect(toOperation("/api/v1/public/traces/abc123")).toEqual({
      operationId: "get_api_v1_public_traces_traceId",
      params: { traceId: "abc123" },
    });
  });

  it("maps trace spans and decodes a URL-encoded trace id", () => {
    expect(toOperation("/api/v1/public/traces/a%2Fb%20c/spans")).toEqual({
      operationId: "get_api_v1_public_traces_traceId_spans",
      params: { traceId: "a/b c" },
    });
  });

  it("maps a span payload with both params", () => {
    expect(toOperation("/api/v1/public/traces/t1/spans/s1/payload")).toEqual({
      operationId: "get_api_v1_public_traces_traceId_spans_spanId_payload",
      params: { traceId: "t1", spanId: "s1" },
    });
  });

  it("throws ReadbackError for unknown paths", () => {
    expect(() => toOperation("/api/v1/public/nope")).toThrow(ReadbackError);
    expect(() => toOperation("/api/v1/public/nope")).toThrow(/no CLI operation mapped/);
  });
});
