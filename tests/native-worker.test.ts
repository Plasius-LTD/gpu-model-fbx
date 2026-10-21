import { Worker } from "node:worker_threads";
import { describe, expect, it } from "vitest";
import { createFbxImporter } from "../src/importer.js";
import { isGpuModelDocument } from "@plasius/gpu-model-core";
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
});
