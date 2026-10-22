import { Worker } from "node:worker_threads";
import { describe, it, expect } from "vitest";
import { prepareGpuModelRendererInput } from "@plasius/gpu-model-renderer";
import { binary } from "./fixtures/fbx.js";
import { animationPose } from "./browser/animation.mjs";
import { morphPositions } from "./browser/morph.mjs";
import { createFbxImporter } from "../src/importer.js";
import {
  animationFixture,
  type AnimationOptions,
} from "./fixtures/animation.js";
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
async function load(o: AnimationOptions = {}, consent = true) {
  const importer = createFbxImporter({
    resolveFeatureFlag: async () => true,
    createWorker: factory,
  });
  try {
    return await importer.load(
      { kind: "uint8-array", bytes: animationFixture(o) },
      { allowAnimationLoss: consent } as any,
    );
  } finally {
    importer.dispose();
  }
}
describe("Task27 takes and sampled timing", () => {
  it("preserves named empty takes without invented resources or motion", async () => {
    const d = await load({ empty: true, takes: 2 }, false);
    expect(d.animations.map((a) => a.name)).toEqual(["Take0", "Take1"]);
    for (const a of d.animations) {
      expect(a.samplers).toEqual([]);
      expect(a.channels).toEqual([]);
      expect(a.durationSeconds).toBe(1);
    }
    expect(d.resources.map((r) => r.id)).toEqual(["positions"]);
  });
  it.each([
    [-1, 24],
    [2, 30],
    [0, 60],
  ])(
    "retains original spans/rate and zero-based canonical keys %s/%s",
    async (start, rate) => {
      const d = await load({ start, rate, takes: 2 });
      const a = d.animations[0]!;
      expect(a.sourceMetadata).toMatchObject({
        localStartSeconds: start,
        localEndSeconds: start + 1,
        referenceStartSeconds: start + 3,
        referenceEndSeconds: start + 4,
        framesPerSecond: rate,
        ktimeSecond: 46186158000,
        representation: "sampled-linear",
      });
      expect(a.samplers).toHaveLength(3);
      for (const s of a.samplers) {
        expect(s.inputTimesSeconds[0]).toBe(0);
        expect(s.inputTimesSeconds.at(-1)).toBe(1);
        expect(s.inputTimesSeconds).toHaveLength(rate + 1);
      }
      const translation = a.samplers.find(
        (s) =>
          a.channels.find((c) => c.samplerId === s.id)!.targetType ===
          "node-translation",
      )!;
      expect(translation.outputValues.at(-2)).toBeCloseTo(2, 5);
    },
  );
  it.each([2, 4, 8])(
    "retains interpreted interpolation/tangents as source evidence %i",
    async (interpolation) => {
      const d = await load({ interpolation });
      const a = d.animations[0]!;
      expect(a.sourceMetadata.layers).toHaveLength(1);
      expect(d.resources.some((r) => r.id === "fbx-animation-keys")).toBe(true);
      expect(
        d.diagnostics.some((x) => x.code === "fbx-animation-sampled"),
      ).toBe(true);
      expect(a.samplers.every((s) => s.interpolation === "linear")).toBe(true);
    },
  );
  it("keeps layer order and baking diagnostics", async () => {
    const a = (await load({ layers: 2 })).animations[0]!;
    expect((a.sourceMetadata.layers as any[]).map((l) => l.name)).toEqual([
      "Layer0",
      "Layer1",
    ]);
    expect(a.sourceMetadata.representation).toBe("sampled-linear");
  });
  it("requires animation consent independently of material consent", async () => {
    await expect(load({}, false)).rejects.toMatchObject({
      code: "unsupported-animation",
      diagnosticReport: { accepted: false },
    });
  });
  it.each([{ duration: 20 }, { takes: 9 }, { keyCount: 4097 }])(
    "enforces animation capacities %s",
    async (o) => {
      await expect(load(o)).rejects.toMatchObject({ code: "limit-exceeded" });
    },
  );
  it("rejects animated unsupported properties instead of dropping them", async () => {
    await expect(load({ property: "Visibility" })).rejects.toMatchObject({
      code: "unsupported-animation",
    });
  });
  it("is deterministic and preserves empty zero-duration clips", async () => {
    expect(await load()).toEqual(await load());
    const d = await load({ empty: true, duration: 0 });
    expect(d.animations[0]!.durationSeconds).toBe(0);
  });
});

const order = (a: readonly number[], b: readonly number[]) =>
  Math.round(a[0]! * 1e5) - Math.round(b[0]! * 1e5) ||
  Math.round(a[1]! * 1e5) - Math.round(b[1]! * 1e5) ||
  Math.round(a[2]! * 1e5) - Math.round(b[2]! * 1e5);
describe("Task27 evaluated pose fidelity", () => {
  it.each([{}, { centimetres: true }, { zUp: true }, { inbetween: true }])(
    "composes animated bones and independent morph coefficients %s",
    async (o) => {
      const d = await load({ ...o, skin: true, morph: true });
      const view = await prepareGpuModelRendererInput(d, {
        conversionEnabled: true,
      });
      for (const time of [0, 0.25, 0.5, 0.75, 1]) {
        const points = morphPositions(animationPose(view, time))[0]!;
        const target = o.inbetween ? 3 * time : 2 * time;
        const expected = o.zUp
          ? [
              [0, 0, 0],
              [1, 0, -target],
              [0, 0, -1 - 2 * time],
            ]
          : [
              [0, 0, 0],
              [1, target, 0],
              [0, 1 + 2 * time, 0],
            ];
        points
          .sort(order)
          .forEach((p: number[], i: number) =>
            p.forEach((n, k) =>
              expect(n).toBeCloseTo(expected.sort(order)[i]![k]!, 5),
            ),
          );
      }
    },
  );
  it.each([false, true])(
    "preserves binary animation numeric poses, compressed=%s",
    async (compressed) => {
      const importer = createFbxImporter({
        resolveFeatureFlag: async () => true,
        createWorker: factory,
      });
      try {
        const d = await importer.load(
          {
            kind: "uint8-array",
            bytes: binary({
              animation: true,
              skin: true,
              morph: true,
              compressed,
            }),
          },
          { allowAnimationLoss: true },
        );
        const view = await prepareGpuModelRendererInput(d, {
          conversionEnabled: true,
        });
        const points = morphPositions(animationPose(view, 0.5))[0]!;
        points.sort(order).forEach((p: number[], i: number) =>
          p.forEach((n, k) =>
            expect(n).toBeCloseTo(
              [
                [0, 0, 0],
                [0, 2, 0],
                [1, 1, 0],
              ][i]![k]!,
              5,
            ),
          ),
        );
        expect(d.animations[0]!.sourceMetadata.originalStartSeconds).toBe(-1);
      } finally {
        importer.dispose();
      }
    },
  );
  it.each([
    { pivot: 0.25 },
    { centimetres: true, pivot: 0.25 },
    { preRotation: 10, postRotation: 5, pivot: 0.25 },
  ])("preserves evaluated rotation about pivots %s", async (o) => {
    const d = await load({ ...o, rotationCurve: true });
    const view = await prepareGpuModelRendererInput(d, {
      conversionEnabled: true,
    });
    const extra = (o.preRotation ?? 0) - (o.postRotation ?? 0);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const points = morphPositions(animationPose(view, t))[0]!;
      const angle = ((90 * t + extra) * Math.PI) / 180,
        pivot = 0.25;
      const expected = [
        [0, 0],
        [1, 0],
        [0, 1],
      ].map(([x, y]) => [
        pivot + (x! - pivot) * Math.cos(angle) - y! * Math.sin(angle),
        (x! - pivot) * Math.sin(angle) + y! * Math.cos(angle),
        0,
      ]);
      points
        .sort(order)
        .forEach((p: number[], i: number) =>
          p.forEach((n, k) =>
            expect(n).toBeCloseTo(expected.sort(order)[i]![k]!, 5),
          ),
        );
    }
  });
  it("preserves independent material/animation consent", async () => {
    const importer = createFbxImporter({
      resolveFeatureFlag: async () => true,
      createWorker: factory,
    });
    try {
      await expect(
        importer.load(
          { kind: "uint8-array", bytes: animationFixture() },
          { allowMaterialLoss: true },
        ),
      ).rejects.toMatchObject({ code: "unsupported-animation" });
    } finally {
      importer.dispose();
    }
  });
  it.each([
    { muted: true },
    { animatedWeight: true },
    { property: "GeometricTranslation" },
  ])("fails closed on unqualified evaluation %s", async (o) => {
    await expect(load(o)).rejects.toMatchObject({
      code: "unsupported-animation",
    });
  });
  it("retains step and cubic source interpolation distinctly from sampled output", async () => {
    for (const [flag, mode] of [
      [2, 0],
      [4, 2],
      [8, 3],
    ]) {
      const d = await load({ interpolation: flag });
      const r = d.resources.find((r) => r.id === "fbx-animation-keys")!;
      const bytes = await r.payload.arrayBuffer(),
        v = new DataView(bytes);
      expect(v.getFloat64(16, true)).toBe(mode);
      expect(v.getFloat64(0, true)).toBe(-1);
      expect(v.getFloat64(56, true)).toBe(0);
      expect(
        d.animations[0]!.samplers.every((s) => s.interpolation === "linear"),
      ).toBe(true);
    }
  });
});

describe("Task27 boundary profiles", () => {
  it("preserves a nonempty zero-duration take as one sample", async () => {
    const a = (await load({ duration: 0, keyCount: 1 })).animations[0]!;
    expect(a.durationSeconds).toBe(0);
    expect(a.samplers[0]!.inputTimesSeconds).toEqual([0]);
  });
  it("accepts the source-key and sampled-frame boundaries", async () => {
    const d = await load({ keyCount: 4096 });
    expect(
      d.resources.find((r) => r.id === "fbx-animation-keys")!.byteLength,
    ).toBe(4096 * 56);
    const high = await load({ rate: 120, takes: 2 });
    expect(high.animations).toHaveLength(2);
    expect(high.animations[0]!.samplers[0]!.inputTimesSeconds).toHaveLength(
      121,
    );
    await expect(load({ rate: 120, takes: 3 })).rejects.toMatchObject({
      code: "limit-exceeded",
    });
  });
  it("retains fractional rates and the shortened last interval", async () => {
    const a = (await load({ rate: 29.97, start: 2 })).animations[0]!;
    expect(a.sourceMetadata.framesPerSecond).toBe(29.97);
    expect(a.samplers[0]!.inputTimesSeconds).toHaveLength(31);
    expect(a.samplers[0]!.inputTimesSeconds.at(-1)).toBe(1);
  });
  it("applies the canonical combined metadata budget", async () => {
    await expect(
      load({ takes: 8, layers: 4, extraNodes: 20 }),
    ).rejects.toMatchObject({
      code: "limit-exceeded",
    });
  });
});

it.each([false, true])(
  "reports unsupported constraints through the canonical rejection ledger (consent=%s)",
  async (consent) => {
    await expect(load({ constraint: true }, consent)).rejects.toMatchObject({
      code: "unsupported-animation",
      diagnosticReport: {
        accepted: false,
        diagnostics: [
          { kind: "unsupported", code: "fbx-animation-unsupported" },
        ],
        losses: [],
      },
    });
  },
);
