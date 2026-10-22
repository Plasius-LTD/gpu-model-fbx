import { Worker } from "node:worker_threads";
import { describe, it, expect } from "vitest";
import { prepareGpuModelRendererInput } from "@plasius/gpu-model-renderer";
import { createFbxImporter } from "../src/importer.js";
import { binary } from "./fixtures/fbx.js";
import { morphPositions } from "./browser/morph.mjs";
import { morphFixture, type MorphOptions } from "./fixtures/morph.js";
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
async function load(o: MorphOptions = {}) {
  const importer = createFbxImporter({
    resolveFeatureFlag: async () => true,
    createWorker: factory,
  });
  try {
    return await importer.load({ kind: "uint8-array", bytes: morphFixture(o) });
  } finally {
    importer.dispose();
  }
}
async function floats(d: Awaited<ReturnType<typeof load>>, id: string) {
  const a = d.accessors.find((a) => a.id === id)!;
  const r = d.resources.find((r) => r.id === a.resourceId)!;
  return new Float32Array(
    await r.payload.arrayBuffer(),
    a.byteOffset,
    a.count * 3,
  );
}
describe("Task26 authored morph fidelity", () => {
  it("preserves sparse position/normal deltas and names without baking defaults", async () => {
    const d = await load({ normals: true });
    expect(d.blendShapes).toHaveLength(1);
    const shape = d.blendShapes[0]!;
    expect(shape.name).toBe("Target0_0");
    expect(shape.defaultWeight).toBe(0.75);
    expect(shape.sourceMetadata).toMatchObject({
      channelName: "Smile0",
      channelWeight: 0.75,
      targetWeight: 1,
      affectedControlPointCount: 1,
      affectedControlPointsAccessorId: "morph-controlpoints-0",
    });
    expect([
      ...(await floats(d, shape.deltas[0]!.positionAccessorId!)),
    ]).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect([...(await floats(d, shape.deltas[0]!.normalAccessorId!))]).toEqual([
      0, 0, 0, 0, 0.25, 0, 0, 0, 0,
    ]);
    const view = await prepareGpuModelRendererInput(d, {
      conversionEnabled: true,
    });
    expect(view.nodes.find((n) => n.meshId)!.morphWeights).toEqual([
      { blendShapeId: shape.id, weight: 0.75 },
    ]);
    expect([...view.primitives[0]!.attributes.POSITION!]).toEqual([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
    ]);
  });
  it.each([0, 25, 50, 75, 100, 125])(
    "retains in-between targets and effective default at %i percent",
    async (weight) => {
      const d = await load({ inbetween: true, weight });
      expect(d.blendShapes).toHaveLength(2);
      const w = d.blendShapes.map((s) => s.defaultWeight!);
      expect(w[0]).toBeCloseTo(weight <= 50 ? weight / 50 : 2 - weight / 50, 6);
      expect(w[1]).toBeCloseTo(weight <= 50 ? 0 : weight / 50 - 1, 6);
      expect(d.blendShapes.map((s) => s.sourceMetadata.targetWeight)).toEqual([
        0.5, 1,
      ]);
      const delta = await Promise.all(
        d.blendShapes.map((s) => floats(d, s.deltas[0]!.positionAccessorId!)),
      );
      expect(
        1 + delta.reduce((sum, a, i) => sum + a[4]! * w[i]!, 0),
      ).toBeCloseTo(1 + weight / 50, 5);
    },
  );
  it.each([
    {},
    { centimetres: true },
    { zUp: true },
    { geometric: true },
    { instances: true },
    { skin: true },
    { channels: 2 },
  ])("retains transformed deltas and combined bindings %s", async (o) => {
    const d = await load(o),
      again = await load(o);
    expect(d).toEqual(again);
    expect(d.blendShapes.length).toBe(o.instances || o.channels ? 2 : 1);
    if (o.skin) expect(d.skins).toHaveLength(1);
    const view = await prepareGpuModelRendererInput(d, {
      conversionEnabled: true,
    });
    const base = morphPositions(view, 0),
      morphed = morphPositions(view, 1);
    const changes = morphed.flatMap((vertices: number[][], i: number) =>
      vertices.map((p: number[], j: number) =>
        p.map((v: number, k: number) => v - base[i]![j]![k]!),
      ),
    );
    expect(
      Math.max(...changes.map((p: number[]) => Math.hypot(...p))),
    ).toBeCloseTo(o.geometric ? 3 : o.channels ? 2 : 1, 5);
  });
  it.each([
    { stacked: true },
    { thresholds: [0, 100] },
    { thresholds: [50, 50] },
    { offsetWeights: true },
  ])("rejects unsupported channel semantics %s", async (o) => {
    await expect(load(o)).rejects.toMatchObject({ code: "unsupported-morph" });
  });
  it.each([
    { indices: [99] },
    { indices: [1, 1], delta: [0, 1, 0, 0, 2, 0] },
    { delta: [0, NaN, 0] },
  ])("rejects invalid sparse source %s", async (o) => {
    await expect(load(o)).rejects.toBeDefined();
  });
  it.each([false, true])(
    "preserves binary/compressed sparse morphs %s",
    async (compressed) => {
      const importer = createFbxImporter({
        resolveFeatureFlag: async () => true,
        createWorker: factory,
      });
      try {
        const d = await importer.load({
          kind: "uint8-array",
          bytes: binary({ compressed, morph: true, skin: true }),
        });
        expect(d.blendShapes).toHaveLength(1);
        expect(d.skins).toHaveLength(1);
        const view = await prepareGpuModelRendererInput(d, {
          conversionEnabled: true,
        });
        expect(
          Math.max(
            ...morphPositions(view)
              .flat()
              .map((p: number[]) => p[1]),
          ),
        ).toBeCloseTo(1, 5);
        const base = morphPositions(view, 0),
          posed = morphPositions(view);
        expect(
          Math.max(
            ...posed[0]!.map(
              (p: number[], i: number) => p[1]! - base[0]![i]![1]!,
            ),
          ),
        ).toBeCloseTo(0.75, 5);
      } finally {
        importer.dispose();
      }
    },
  );
  it.each([
    {},
    { centimetres: true },
    { zUp: true },
    { geometric: true },
    { rotation: 90 },
    { leftHanded: true },
  ])("matches independently derived world delta direction %s", async (o) => {
    const d = await load(o),
      view = await prepareGpuModelRendererInput(d, { conversionEnabled: true });
    const base = morphPositions(view, 0),
      posed = morphPositions(view, 1);
    const changes = posed[0]!.map((p: number[], j: number) =>
      p.map((n: number, k: number) => n - base[0]![j]![k]!),
    );
    const nonzero = changes.filter((p: number[]) => Math.hypot(...p) > 1e-5);
    expect(nonzero).toHaveLength(1);
    const expected = o.zUp
      ? [0, 0, -1]
      : o.rotation
        ? [-1, 0, 0]
        : [0, o.geometric ? 3 : 1, 0];
    nonzero[0]!.forEach((n: number, k: number) =>
      expect(n).toBeCloseTo(expected[k]!, 5),
    );
  });
  it("composes authored morph defaults before a changed linear skin pose", async () => {
    const d = await load({ skin: true }),
      view = await prepareGpuModelRendererInput(d, { conversionEnabled: true });
    const posed = morphPositions(view, undefined, 1);
    expect(
      posed[0]!.find((p: number[]) => Math.abs(p[0]! - 1) < 1e-5)![1],
    ).toBeCloseTo(1.25, 5);
  });
  it("repeats sparse membership through triangulated material seams", async () => {
    const d = await load({
      normals: true,
      twoFaces: true,
      materials: true,
      indices: [0],
      delta: [0, 1, 0],
    });
    expect(d.blendShapes[0]!.deltas).toHaveLength(2);
    for (const delta of d.blendShapes[0]!.deltas) {
      const a = await floats(d, delta.positionAccessorId!);
      expect([...a].filter((n) => n !== 0)).toEqual([1]);
    }
    const ref = d.resources.find(
      (r) =>
        r.id ===
        d.blendShapes[0]!.sourceMetadata.affectedControlPointsAccessorId,
    )!;
    expect([...new Uint32Array(await ref.payload.arrayBuffer())]).toEqual([0]);
  });
  it("transforms normal deltas with the base-normal normalization factor", async () => {
    const d = await load({ normals: true, geometric: true });
    const a = await floats(d, d.blendShapes[0]!.deltas[0]!.normalAccessorId!);
    expect(a[4]).toBeCloseTo(0.25 / 3, 6);
    expect(a.filter((n) => n !== 0)).toHaveLength(1);
  });
  it("denies morph acquisition/allocation through rollback and restores cleanly", async () => {
    let granted = false,
      workers = 0;
    const importer = createFbxImporter({
      resolveFeatureFlag: async () => granted,
      createWorker: () => {
        workers++;
        return factory();
      },
    });
    try {
      for (const [enabled, expectedWorkers] of [
        [false, 0],
        [true, 1],
        [false, 1],
        [true, 2],
      ] as const) {
        granted = enabled;
        const result = importer.load({
          kind: "uint8-array",
          bytes: morphFixture({ inbetween: true }),
        });
        if (enabled) expect((await result).blendShapes).toHaveLength(2);
        else await expect(result).rejects.toMatchObject({ code: "disabled" });
        expect(workers).toBe(expectedWorkers);
      }
      expect(workers).toBe(2);
    } finally {
      importer.dispose();
    }
  });
  it("enforces target capacity", async () => {
    await expect(load({ channels: 5 })).rejects.toMatchObject({
      code: "limit-exceeded",
    });
  });
});
