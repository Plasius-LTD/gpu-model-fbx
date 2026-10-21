import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { createFbxImporter } from "../src/importer.js";
import { isGpuModelDocument } from "@plasius/gpu-model-core";
import { sha256Hex } from "@plasius/gpu-model-runtime";
import { ascii, binary } from "./fixtures/fbx.js";

function factory() {
  const thread = new Worker(new URL("./worker-host.mjs", import.meta.url), { workerData: { module: new URL("../dist/fbx-worker.js", import.meta.url).href } });
  const port: any = { onmessage: null, onerror: null, onmessageerror: null, terminate: () => thread.terminate(), postMessage: (data: any, transfer: any) => thread.postMessage(data, transfer) };
  thread.on("message", data => { if (!data.ready) port.onmessage?.({ data }); });
  thread.on("error", () => port.onerror?.({}));
  thread.on("messageerror", () => port.onmessageerror?.({}));
  return port;
}
describe("compiled pinned parser in isolated worker", () => {
  it("imports the same snapshot identified before a caller changes its ArrayBuffer", async () => {
    const owner = ascii.slice(); const expectedHash = await sha256Hex(owner);
    const importer = createFbxImporter({ resolveFeatureFlag: async () => true, createWorker: factory, dependencies: { hashBytes: async bytes => { const hash = await sha256Hex(bytes); owner.fill(0); return hash; } } });
    try {
      const document = await importer.load({ kind: "array-buffer", bytes: owner.buffer });
      expect(document.provenance.sourceContentHash).toBe(expectedHash); expect(document.nodes[0]?.name).toBe("Triangle"); expect(owner.every(byte => byte === 0)).toBe(true);
    } finally { importer.dispose(); }
  });
  it("keeps source CJS loading lazy under denial and preserves the CJS core brand", async () => {
    const require = createRequire(import.meta.url); const loader = vi.fn(require);
    vi.stubGlobal("__FBX_CJS__", true); vi.stubGlobal("__FBX_LOAD_CJS__", loader);
    let granted = false;
    const importer = createFbxImporter({ resolveFeatureFlag: async () => granted, createWorker: factory });
    try {
      await expect(importer.load({ kind: "uint8-array", bytes: ascii })).rejects.toMatchObject({ code: "disabled" });
      expect(loader).not.toHaveBeenCalled(); granted = true;
      const document = await importer.load({ kind: "uint8-array", bytes: ascii });
      expect(require("@plasius/gpu-model-core").isGpuModelDocument(document)).toBe(true);
    } finally { importer.dispose(); vi.unstubAllGlobals(); }
  });
  it("returns the canonical core brand used by an actual CJS consumer", async () => {
    const require = createRequire(import.meta.url);
    const cjs = require("../dist/index.cjs");
    const core = require("@plasius/gpu-model-core");
    const importer = cjs.createFbxImporter({ resolveFeatureFlag: async () => true, createWorker: factory });
    try { expect(core.isGpuModelDocument(await importer.load({ kind: "uint8-array", bytes: ascii }))).toBe(true); }
    finally { importer.dispose(); }
  });
  it.each([["ascii", ascii], ["binary", binary()], ["compressed", binary({ compressed: true })]])("imports %s via the core verified document boundary", async (_, bytes) => {
    const importer = createFbxImporter({ resolveFeatureFlag: async () => true, createWorker: factory });
    try {
      const document = await importer.load({ kind: "uint8-array", bytes: bytes as Uint8Array });
      expect(isGpuModelDocument(document)).toBe(true);
      expect(document.bounds.min).toEqual([-0.5, 0, 0]); expect(document.bounds.max).toEqual([0.5, 1, 0]);
      expect(document.meshes).toHaveLength(1); expect(document.metadata.fbxVersion).toBe(7400);
      expect(document.nodes[0]?.name).toBe("Triangle");
    } finally { importer.dispose(); }
  });
  it.each([binary().slice(0, 100), binary({ quad: true }), binary({ material: true }), binary({ compressed: true, declaredVertices: 0x20000000 })])("rejects malformed, unsupported and adversarial allocations", async bytes => {
    const importer = createFbxImporter({ resolveFeatureFlag: async () => true, createWorker: factory });
    try { await expect(importer.load({ kind: "uint8-array", bytes })).rejects.toBeDefined(); } finally { importer.dispose(); }
  });
  it("bounds a consistent compressed array before its 33.6MiB expanded allocation", async () => {
    const bytes = binary({ compressed: true, expandedVertices: true }); expect(bytes.length).toBeLessThan(100_000);
    const importer = createFbxImporter({ resolveFeatureFlag: async () => true, createWorker: factory });
    try { await expect(importer.load({ kind: "uint8-array", bytes })).rejects.toMatchObject({ code: "limit-exceeded" }); }
    finally { importer.dispose(); }
  });
});
