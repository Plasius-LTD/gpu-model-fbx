import { Worker } from "node:worker_threads";
import { beforeAll, describe, it, expect } from "vitest";
import { toDocument } from "../src/document.js";
import type { ParsedFbx } from "../src/policy.js";
import { animationFixture } from "./fixtures/animation.js";
let fixture: ParsedFbx;
beforeAll(async () => {
  const w = new Worker(new URL("./worker-host.mjs", import.meta.url), {
    workerData: {
      module: new URL("../dist/fbx-worker.js", import.meta.url).href,
    },
  });
  try {
    fixture = await new Promise((resolve, reject) => {
      w.on("error", reject);
      w.on("message", (m) => {
        if (m.ready)
          w.postMessage({
            bytes: animationFixture({ morph: true, skin: true }),
            parserBytes: 25165824,
            allocations: 50000,
            timeoutMs: 10000,
          });
        else if (m.result) resolve(m.result);
        else reject(new Error(String(m.error)));
      });
    });
  } finally {
    await w.terminate();
  }
});
const sample = () => structuredClone(fixture);
const convert = (v: ParsedFbx) =>
  toDocument(v, "a".repeat(64), new AbortController().signal, false, true);
describe("Task27 untrusted animation protocol", () => {
  it("owns samples, curves and names before any asynchronous verification", async () => {
    const v = sample(),
      pending = convert(v);
    v.animationStacks.fill(99);
    v.animationKeys.fill(99);
    v.animationTransforms.fill(99);
    v.animationWeights.fill(99);
    (v.animationStackNames as string[])[0] = "Changed";
    const d = await pending;
    expect(d.animations[0]!.name).toBe("Take0");
    expect(d.animations[0]!.sourceMetadata.originalStartSeconds).toBe(-1);
    expect(d.animations[0]!.samplers[0]!.outputValues[0]).not.toBe(99);
  });
  it.each([
    "animationStacks",
    "animationLayers",
    "animationCurves",
    "animationKeys",
    "animationTimes",
    "animationTransforms",
    "animationWeights",
  ] as const)(
    "denies malformed, nonfinite, shared and hidden-tail %s",
    async (key) => {
      const array = fixture[key];
      for (const bad of [
        new Float64Array([NaN]),
        new Float64Array(new SharedArrayBuffer(array.byteLength)),
        new Float64Array(array.length + 1).subarray(0, array.length),
        new Float32Array(array),
      ]) {
        await expect(
          convert({ ...sample(), [key]: bad }),
        ).rejects.toMatchObject({ code: "worker-failed" });
      }
    },
  );
  it.each([
    "animationStackNames",
    "animationLayerNames",
    "animationCurveNames",
    "animationValueNames",
  ] as const)("rejects unsafe %s", async (key) => {
    for (const names of [[], ["bad\nname"], ["x".repeat(513)]])
      await expect(
        convert({ ...sample(), [key]: names }),
      ).rejects.toMatchObject({ code: "worker-failed" });
  });
  it.each([
    ["framesPerSecond", 0],
    ["framesPerSecond", 121],
    ["timeMode", 18],
    ["ktimeSecond", 1],
  ] as const)("rejects forged timing %s", async (key, n) => {
    await expect(convert({ ...sample(), [key]: n })).rejects.toMatchObject({
      code: "worker-failed",
    });
  });
  it.each([
    [0, 1],
    [1, -2],
    [6, 16],
    [7, 1],
    [8, 33],
    [9, 1],
    [10, 122],
    [11, 0],
  ])("rejects stack row %i", async (index, n) => {
    const v = sample();
    v.animationStacks[index!] = n!;
    await expect(convert(v)).rejects.toMatchObject({ code: "worker-failed" });
  });
  it.each([
    [0, 1],
    [1, 32],
    [2, 1000001],
    [3, 2],
    [4, 2],
    [5, 2],
    [6, 2],
    [7, 1],
    [8, 1],
    [9, 127],
  ])("rejects layer row %i", async (index, n) => {
    const v = sample();
    v.animationLayers[index!] = n!;
    await expect(convert(v)).rejects.toMatchObject({ code: "worker-failed" });
  });
  it.each([
    [0, 1],
    [1, 2],
    [2, 999],
    [3, 9],
    [4, 2],
    [5, 128],
    [6, -2],
    [7, 1],
    [8, 4097],
    [12, 5],
    [14, 5],
    [13, 1e20],
  ])("rejects curve row %i", async (index, n) => {
    const v = sample();
    v.animationCurves[index!] = n!;
    await expect(convert(v)).rejects.toMatchObject({ code: "worker-failed" });
  });
  it.each([
    [0, 1000001],
    [1, NaN],
    [2, 4],
    [3, 1000001],
  ])("rejects key row %i", async (index, n) => {
    const v = sample();
    v.animationKeys[index!] = n!;
    await expect(convert(v)).rejects.toMatchObject({ code: "worker-failed" });
  });
  it("rejects nonmonotonic keys and wrong source-rate grids", async () => {
    const v = sample();
    v.animationKeys[7] = v.animationKeys[0]!;
    await expect(convert(v)).rejects.toMatchObject({ code: "worker-failed" });
    const w = sample();
    w.animationTimes[1] = w.animationTimes[0]!;
    await expect(convert(w)).rejects.toMatchObject({ code: "worker-failed" });
  });
  it.each([
    [3, 3],
    [7, 0],
    [0, 1000001],
  ])("rejects non-TRS samples %i", async (index, n) => {
    const v = sample();
    v.animationTransforms[index!] = n!;
    await expect(convert(v)).rejects.toMatchObject({ code: "worker-failed" });
  });
  it("rejects trailing tables and inconsistent frame dimensions", async () => {
    for (const key of [
      "animationLayers",
      "animationKeys",
      "animationTimes",
      "animationWeights",
    ] as const) {
      const v = sample(),
        extra = new Float64Array(v[key].length * 2);
      extra.set(v[key]);
      await expect(convert({ ...v, [key]: extra })).rejects.toMatchObject({
        code: "worker-failed",
      });
    }
  });
  it("rejects mutation of canonical animation bytes and values", async () => {
    const d = await convert(sample());
    const { prepareGpuModelRendererInput } =
      await import("@plasius/gpu-model-renderer");
    await expect(
      prepareGpuModelRendererInput(
        {
          ...d,
          animations: d.animations.map((a) => ({ ...a, durationSeconds: 99 })),
        },
        { conversionEnabled: true },
      ),
    ).rejects.toMatchObject({ code: "unverified-document" });
    const sampler = d.animations[0]!.samplers[0]!,
      res = d.resources.find(
        (r) =>
          r.id ===
          d.accessors.find((a) => a.id === sampler.outputAccessorId)!
            .resourceId,
      )!;
    const bytes = new Uint8Array(await res.payload.arrayBuffer());
    bytes.fill(255);
    expect(new Uint8Array(await res.payload.arrayBuffer())).not.toEqual(bytes);
  });
});
