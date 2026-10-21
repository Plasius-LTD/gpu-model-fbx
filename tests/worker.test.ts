import { afterEach, describe, expect, it, vi } from "vitest";
import { ascii } from "./fixtures/fbx.js";
import { FBX_IMPORT_LIMITS } from "../src/policy.js";
const state = vi.hoisted(() => ({ code: 0, count: 3, outstanding: 0, malloc: 100, freed: [] as number[] }));
vi.mock("../dist/ufbx.mjs", () => ({ default: async () => {
  const memory = new ArrayBuffer(65536); const h = new Float64Array(memory); const p = new Float32Array(memory);
  h.set([state.count, 7400, 1, 1, 0, 2, 4], 0); p.set([0, 0, 0, 1, 0, 0, 0, 1, 0], 32);
  return { HEAPU8: new Uint8Array(memory), HEAPF64: h, HEAPF32: p, _malloc: () => state.malloc, _free: (ptr: number) => state.freed.push(ptr), _fbx_parse: () => state.code, _fbx_outstanding: () => state.outstanding, _fbx_header: () => 0, _fbx_output: () => 128, _fbx_name: () => 512, _fbx_name_size: () => 0 };
} }));
afterEach(() => { vi.unstubAllGlobals(); state.code = 0; state.count = 3; state.outstanding = 0; state.malloc = 100; state.freed = []; });
async function run(data: unknown) {
  vi.resetModules(); const postMessage = vi.fn(); vi.stubGlobal("postMessage", postMessage);
  for (const key of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts"]) vi.stubGlobal(key, (globalThis as any)[key]);
  await import("../src/fbx-worker.js");
  await (globalThis as any).onmessage({ data });
  return postMessage;
}
const request = () => ({ bytes: ascii, parserBytes: FBX_IMPORT_LIMITS.parserBytes, allocations: FBX_IMPORT_LIMITS.allocations, timeoutMs: 1000 });
describe("worker protocol", () => {
  it("returns only the bounded source result, transfers ownership, frees input, and ignores reuse", async () => {
    const send = await run(request());
    expect(send.mock.calls[0]?.[0].result.positions).toHaveLength(9); expect(state.freed).toEqual([100]);
    await (globalThis as any).onmessage({ data: request() }); expect(send).toHaveBeenCalledTimes(1);
  });
  it.each([null, {}, { ...request(), bytes: new Uint8Array() }, { ...request(), bytes: new Uint8Array([1]) }, { ...request(), parserBytes: 0 }, { ...request(), allocations: 50001 }, { ...request(), timeoutMs: 10001 }, { ...request(), cancel: new ArrayBuffer(4) }])("denies invalid protocol input", async data => {
    const send = await run(data); expect(send.mock.calls[0]?.[0]).toEqual({ error: data === null ? 5 : 1 }); expect(state.freed).toEqual([]);
  });
  it.each([1, 2, 3, 4, 99])("redacts native failure %i and frees input", async code => {
    state.code = code; const send = await run(request()); expect(send.mock.calls[0]?.[0]).toEqual({ error: code === 99 ? 5 : code }); expect(state.freed).toEqual([100]);
  });
  it("rejects leaked allocations and invalid output counts", async () => {
    state.outstanding = 1; expect((await run(request())).mock.calls[0]?.[0]).toEqual({ error: 3 });
    state.outstanding = 0; state.count = 30001; expect((await run(request())).mock.calls[0]?.[0]).toEqual({ error: 3 });
    state.malloc = 0; expect((await run(request())).mock.calls[0]?.[0]).toEqual({ error: 3 });
  });
  it("accepts a bounded shared cancellation word when supplied", async () => {
    expect((await run({ ...request(), cancel: new SharedArrayBuffer(4) })).mock.calls[0]?.[0].result.protocol).toBe(1);
  });
  it("denies ambient network and script transports", async () => {
    await run(request());
    for (const key of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts"]) expect(() => (globalThis as any)[key]("https://invalid.example/private")).toThrow("FBX worker transport denied");
  });
});
