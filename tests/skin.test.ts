import { Worker } from "node:worker_threads";
import { describe, it, expect } from "vitest";
import { prepareGpuModelRendererInput } from "@plasius/gpu-model-renderer";
import { isGpuModelDocument } from "@plasius/gpu-model-core";
import { createFbxImporter } from "../src/importer.js";
import { deform } from "./browser/skin.mjs";
import { ascii,binary } from "./fixtures/fbx.js";
import { skinFixture } from "./fixtures/skin.js";
function factory() {
  const thread = new Worker(new URL("./worker-host.mjs", import.meta.url), {
    workerData: {
      module: new URL("../dist/fbx-worker.js", import.meta.url).href,
    },
  });
  const port: any = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    terminate: () => thread.terminate(),
    postMessage: (data: any, transfer: any) =>
      thread.postMessage(data, transfer),
  };
  thread.on("message", (data) => {
    if (!data.ready) port.onmessage?.({ data });
  });
  thread.on("error", () => port.onerror?.({}));
  return port;
}
async function load(options: Parameters<typeof skinFixture>[0] = {}) {
  const i = createFbxImporter({
    resolveFeatureFlag: async () => true,
    createWorker: factory,
  });
  try {
    return await i.load({ kind: "uint8-array", bytes: skinFixture(options) });
  } finally {
    i.dispose();
  }
}
describe("Task25 skeletal fidelity", () => {
  it("rejects an unattached skin rather than dropping source data",async()=>{
   const importer=createFbxImporter({resolveFeatureFlag:async()=>true,createWorker:factory});try{await expect(importer.load({kind:"uint8-array",bytes:new TextEncoder().encode(new TextDecoder().decode(ascii).replace('Model: 2,','Deformer: 3, "Deformer::Unused", "Skin" {}\nModel: 2,'))})).rejects.toMatchObject({code:"unsupported-profile"});}finally{importer.dispose();}
  });
  it("denies and rolls back skins before allocating or reading source", async () => {
    let granted = false,
      count = 0;
    const importer = createFbxImporter({
      resolveFeatureFlag: async () => granted,
      createWorker: () => {
        count++;
        return factory();
      },
    });
    try {
      await expect(
        importer.load({ kind: "uint8-array", bytes: skinFixture() }),
      ).rejects.toMatchObject({ code: "disabled" });
      expect(count).toBe(0);
      granted = true;
      await importer.load({ kind: "uint8-array", bytes: skinFixture() });
      expect(count).toBe(1);
      granted = false;
      await expect(
        importer.load({ kind: "uint8-array", bytes: skinFixture() }),
      ).rejects.toMatchObject({ code: "disabled" });
      expect(count).toBe(1);
      granted = true;
      await importer.load({ kind: "uint8-array", bytes: skinFixture() });
      expect(count).toBe(2);
    } finally {
      importer.dispose();
    }
  });
  it("preserves bones, hierarchy and a bound linear palette through the published renderer", async () => {
    const d = await load();
    expect(isGpuModelDocument(d)).toBe(true);
    expect(d.skins).toHaveLength(1);
    expect(d.joints).toHaveLength(2);
    expect(d.skeletons).toHaveLength(1);
    const root = d.joints.find((j) => j.name === "Root")!,
      tip = d.joints.find((j) => j.name === "Tip")!;
    expect(tip.parentJointId).toBe(root.id);
    const v = await prepareGpuModelRendererInput(d, {
      conversionEnabled: true,
    });
    expect(v.skins[0]!.weightSets[0]!.weights.slice(0, 4)).toEqual(
      new Float32Array([1, 0, 0, 0]),
    );
  });
  it("shares stable joints across multiple skins with independent mesh bindings", async () => {
    const d = await load({ multiple: true });
    expect(d.skins).toHaveLength(2);
    expect(d.joints).toHaveLength(2);
    expect(d.skins[0]!.jointIds).toEqual(d.skins[1]!.jointIds);
    expect(d.skins[0]!.inverseBindMatrices).not.toEqual(
      d.skins[1]!.inverseBindMatrices,
    );
  });
  it.each([
    {},
    { centimetres: true },
    { zUp: true },
    { geometric: true },
    { multiple: true },
  ])(
    "checks hand-computed bind and changed-pose world vertices%s",
    async (options) => {
      const d = await load(options),
        v = await prepareGpuModelRendererInput(d, { conversionEnabled: true });
      const bind = deform(v),
        posed = deform(v, 1);
      const expected = (i: number, changed: boolean) =>
        options.zUp
          ? [
              [0, 0, 0],
              [1, changed ? 0.5 : 0, 0],
              [0, changed ? 1 : 0, -1],
            ]
          : [
              [i * 2 + (options.geometric ? 1 : 0), 0, 0],
              [1 + i * 2 + (options.geometric ? 1 : 0), changed ? 0.5 : 0, 0],
              [i * 2 + (options.geometric ? 1 : 0), changed ? 2 : 1, 0],
            ];
      const sort = (a: readonly number[], b: readonly number[]) =>
        a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!;
      for (const [i, vertices] of bind.entries())
        for (const [j, p] of vertices.sort(sort).entries())
          p.forEach((n: number, k: number) =>
            expect(n).toBeCloseTo(expected(i, false).sort(sort)[j]![k]!, 5),
          );
      for (const [i, vertices] of posed.entries())
        for (const [j, p] of vertices.sort(sort).entries())
          p.forEach((n: number, k: number) =>
            expect(n).toBeCloseTo(expected(i, true).sort(sort)[j]![k]!, 5),
          );
      const again = await load(options);
      expect(d).toEqual(again);
    },
  );
  it.each([false, true])(
    "preserves uncompressed/compressed binary skin%s",
    async (compressed) => {
      const i = createFbxImporter({
        resolveFeatureFlag: async () => true,
        createWorker: factory,
      });
      try {
        const d = await i.load({
          kind: "uint8-array",
          bytes: binary({ compressed, skin: true }),
        });
        expect(d.skins).toHaveLength(1);
        expect(
          deform(
            await prepareGpuModelRendererInput(d, { conversionEnabled: true }),
            1,
          )[0]!.find((p: number[]) => Math.abs(p[0]! - 1) < 1e-5)![1],
        ).toBeCloseTo(0.5, 5);
      } finally {
        i.dispose();
      }
    },
  );
  it("retains explicit source bind-pose matrices and per-cluster mesh/link evidence", async () => {
    const d = await load({ bindPose: true });
    expect(d.metadata.sourceBindPoses).toMatchObject([
      {
        name: "Bind",
        nodes: expect.arrayContaining([
          { nodeId: expect.any(String), boneToWorld: expect.any(Array) },
        ]),
      },
    ]);
    expect(d.skins[0]!.sourceMetadata.clusters).toHaveLength(2);
  });
  it.each([4, 8])(
    "retains all%s influences without truncation",
    async (influences) => {
      const d = await load({ influences }),
        v = await prepareGpuModelRendererInput(d, { conversionEnabled: true });
      expect(d.joints).toHaveLength(influences);
      expect(v.skins[0]!.weightSets[0]!.influencesPerVertex).toBe(influences);
      expect(v.skins[0]!.weightSets[0]!.weights.slice(0, influences)).toEqual(
        new Float32Array(influences).fill(1 / influences),
      );
    },
  );
  it("rejects influence capacity rather than truncating", async () => {
    await expect(load({ influences: 9 })).rejects.toMatchObject({
      code: "limit-exceeded",
    });
  });
  it.each([
    { mode: "Additive" },
    { mode: "TotalOne" },
    { stacked: true },
    { jointShear: true },
  ])("rejects unrepresented skin composition%s", async (o) => {
    await expect(load(o)).rejects.toMatchObject({
      code: "unsupported-skinning",
    });
  });
  it.each(["DualQuaternion", "Blend"])(
    "explicitly rejects unsupported%s",
    async (method) => {
      await expect(load({ method })).rejects.toMatchObject({
        code: "unsupported-skinning",
      });
    },
  );
  it.each([
    { weights: [-1, 0.5, 0] },
    { weights: [0, 0, 0] },
    { weights: [0.8, 0.5, 0] },
    { indices: [0, 1, 99] },
  ])("rejects invalid raw weights/index%s", async (options) => {
    await expect(load(options)).rejects.toBeDefined();
  });
});
