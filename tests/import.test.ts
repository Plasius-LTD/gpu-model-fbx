import { describe, expect, it, vi } from "vitest";
import { createFbxImporter, sniffFbx, FBX_IMPORT_LIMITS } from "../src/importer.js";
import { ascii } from "./fixtures/fbx.js";

describe("bounded FBX import", () => {
  it("sniffs content rather than trusting names", () => {
    expect(sniffFbx(new TextEncoder().encode("; FBX 7.4.0 project file\nFBXHeaderExtension: {"))).toBe("ascii");
    expect(sniffFbx(new TextEncoder().encode("Kaydara FBX Binary  \0\x1a\0"))).toBe("binary");
    expect(sniffFbx(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });
  it("denies before acquisition or worker allocation", async () => {
    const fetch = vi.fn(); const createWorker = vi.fn();
    const importer = createFbxImporter({ resolveFeatureFlag: async () => false, createWorker, dependencies: { fetch } });
    await expect(importer.load({ kind: "url", url: "https://invalid.example/model.fbx" })).rejects.toMatchObject({ code: "disabled" });
    expect(fetch).not.toHaveBeenCalled(); expect(createWorker).not.toHaveBeenCalled();
    importer.dispose(); importer.dispose();
  });
  it("cannot raise budgets and rejects disposed operations", async () => {
    expect(() => createFbxImporter({ resolveFeatureFlag: async () => true, createWorker: vi.fn(), limits: { maxBytes: FBX_IMPORT_LIMITS.maxBytes + 1 } })).toThrow();
    const importer = createFbxImporter({ resolveFeatureFlag: async () => true, createWorker: vi.fn() });
    importer.dispose();
    await expect(importer.load({ kind: "uint8-array", bytes: new Uint8Array() })).rejects.toMatchObject({ code: "disposed" });
  });
  it("terminates an uncooperative worker on abort, rejects overlap, and disposes repeatedly", async () => {
    const terminate = vi.fn(); const postMessage = vi.fn();
    const worker: any = { terminate, postMessage };
    const importer = createFbxImporter({ resolveFeatureFlag: async () => true, createWorker: () => worker });
    const controller = new AbortController(); const work = importer.load({ kind: "uint8-array", bytes: ascii }, { signal: controller.signal });
    await expect(importer.load({ kind: "uint8-array", bytes: ascii })).rejects.toMatchObject({ code: "busy" });
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalled()); controller.abort();
    await expect(work).rejects.toMatchObject({ code: "aborted" }); expect(terminate).toHaveBeenCalledTimes(1);
    expect(worker.onmessage).toBeNull(); expect(worker.onerror).toBeNull();
    importer.dispose(); importer.dispose();
  });
  it("bounds hanging authorization and acquisition without starting a worker", async () => {
    const createWorker = vi.fn(); const importer = createFbxImporter({ resolveFeatureFlag: () => new Promise(() => {}), createWorker, limits: { timeoutMs: 10 } });
    await expect(importer.load({ kind: "uint8-array", bytes: ascii })).rejects.toMatchObject({ code: "deadline-exceeded" }); expect(createWorker).not.toHaveBeenCalled();
    const acquire = createFbxImporter({ resolveFeatureFlag: async () => true, createWorker, dependencies: { fetch: () => new Promise(() => {}) }, limits: { timeoutMs: 10 } });
    await expect(acquire.load({ kind: "url", url: "https://invalid.example/model.fbx" })).rejects.toMatchObject({ code: "deadline-exceeded" });
    acquire.dispose(); importer.dispose();
  });
  it("denies rollback after acquisition, and never echoes provider failures", async () => {
    const createWorker = vi.fn(); let reads = 0;
    const importer = createFbxImporter({ resolveFeatureFlag: async () => ++reads === 1, createWorker });
    await expect(importer.load({ kind: "uint8-array", bytes: ascii })).rejects.toMatchObject({ code: "disabled" }); expect(createWorker).not.toHaveBeenCalled();
    const denied = createFbxImporter({ resolveFeatureFlag: async () => { throw new Error("private fixture text"); }, createWorker });
    await expect(denied.load({ kind: "uint8-array", bytes: ascii })).rejects.toThrow("FBX import: disabled");
    denied.dispose(); importer.dispose();
  });
  it.each(["onerror", "onmessageerror", "postMessage"])('redacts %s and releases worker ownership', async event => {
    const terminate = vi.fn(); const worker: any = { terminate };
    worker.postMessage = () => { if (event === "postMessage") throw new Error("raw source text"); queueMicrotask(() => worker[event]({ message: "raw source text" })); };
    const importer = createFbxImporter({ resolveFeatureFlag: async () => true, createWorker: () => worker });
    await expect(importer.load({ kind: "uint8-array", bytes: ascii })).rejects.toMatchObject({ code: "worker-failed" }); expect(terminate).toHaveBeenCalledTimes(1); importer.dispose();
  });
  it("rejects invalid bytes before worker, and oversize inputs during acquisition", async () => {
    const createWorker = vi.fn(); const importer = createFbxImporter({ resolveFeatureFlag: async () => true, createWorker, limits: { maxBytes: 1024 } });
    await expect(importer.load({ kind: "uint8-array", bytes: new Uint8Array(3) })).rejects.toMatchObject({ code: "invalid-fbx" });
    await expect(importer.load({ kind: "uint8-array", bytes: new Uint8Array(1025) })).rejects.toMatchObject({ code: "limit-exceeded" });
    const controller = new AbortController(); controller.abort();
    await expect(importer.load({ kind: "uint8-array", bytes: ascii }, { signal: controller.signal })).rejects.toMatchObject({ code: "aborted" }); expect(createWorker).not.toHaveBeenCalled(); importer.dispose();
  });
  it("disposal rejects an active authorization operation without later allocating", async () => {
    let authorize: (granted: boolean) => void = () => {}; const createWorker = vi.fn();
    const importer = createFbxImporter({ resolveFeatureFlag: () => new Promise(resolve => { authorize = resolve; }), createWorker });
    const work = importer.load({ kind: "uint8-array", bytes: ascii }); importer.dispose(); authorize(true);
    await expect(work).rejects.toMatchObject({ code: "disposed" }); expect(createWorker).not.toHaveBeenCalled();
  });
  it("tightens valid limits and fails closed on malformed worker output", async () => {
    const worker: any = { terminate: vi.fn(), postMessage() { queueMicrotask(() => worker.onmessage({ data: { result: { protocol: 1 } } })); } };
    const importer = createFbxImporter({ resolveFeatureFlag: async () => true, createWorker: () => worker, limits: { maxBytes: 1024 } });
    await expect(importer.load({ kind: "uint8-array", bytes: ascii })).rejects.toMatchObject({ code: "worker-failed" }); importer.dispose();
  });
  it("releases a created worker when shared cancellation allocation fails", async () => {
    const worker: any = { terminate: vi.fn(), postMessage: vi.fn() };
    vi.stubGlobal("crossOriginIsolated", true); vi.stubGlobal("SharedArrayBuffer", class { constructor() { throw new Error("allocation failed"); } });
    const importer = createFbxImporter({ resolveFeatureFlag: async () => true, createWorker: () => worker });
    try { await expect(importer.load({ kind: "uint8-array", bytes: ascii })).rejects.toMatchObject({ code: "worker-failed" }); expect(worker.terminate).toHaveBeenCalledTimes(1); }
    finally { importer.dispose(); vi.unstubAllGlobals(); }
  });
});
