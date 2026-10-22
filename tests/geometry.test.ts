import { Worker } from "node:worker_threads";
import { describe, expect, it } from "vitest";
import { prepareGpuModelRendererInput } from "@plasius/gpu-model-renderer";
import { createFbxImporter } from "../src/importer.js";
import { sceneFixture } from "./fixtures/scene.js";
import { binary } from "./fixtures/fbx.js";
import { overLimitFixture } from "./fixtures/limits.js";

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
async function load(bytes: Uint8Array, options = {}) {
  const importer = createFbxImporter({
    resolveFeatureFlag: async () => true,
    createWorker: factory,
  });
  try {
    return await importer.load({ kind: "uint8-array", bytes }, options);
  } finally {
    importer.dispose();
  }
}
function mul(a: readonly number[], b: readonly number[]): number[] {
  return Array.from({ length: 16 }, (_, i) =>
    Array.from(
      { length: 4 },
      (_, k) => a[k * 4 + (i % 4)]! * b[Math.floor(i / 4) * 4 + k]!,
    ).reduce((x, y) => x + y, 0),
  );
}
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
async function world(document: Awaited<ReturnType<typeof load>>) {
  const view = await prepareGpuModelRendererInput(document, {
    conversionEnabled: true,
  });
  const matrix = (id: string): number[] => {
    const node = view.nodes.find((n) => n.id === id)!;
    const parent = view.nodes.find((n) => n.children.includes(id));
    return mul(parent ? matrix(parent.id) : identity, node.localMatrix);
  };
  const output: number[][] = [];
  for (const node of view.nodes)
    if (node.meshId) {
      const m = matrix(node.id);
      const offset = document.metadata.floorCentreOffsetMetres as number[];
      for (const primitive of view.primitives.filter(
        (p) => p.meshId === node.meshId,
      )) {
        const p = primitive.attributes.POSITION!;
        for (let i = 0; i < p.length; i += 3)
          output.push(
            [0, 1, 2].map(
              (k) =>
                m[k]! * p[i]! +
                m[4 + k]! * p[i + 1]! +
                m[8 + k]! * p[i + 2]! +
                m[12 + k]! +
                offset[k]!,
            ),
          );
      }
    }
  return { view, output };
}
function close(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 5));
}

describe("Task24 static scene fidelity through published canonical-renderer bridge", () => {
  it.each(["triangles", "nodes", "materials"] as const)(
    "rejects source %s beyond fixed native output capacity",
    async (kind) => {
      await expect(load(overLimitFixture(kind))).rejects.toMatchObject({
        code: "limit-exceeded",
      });
    },
  );
  it("denies singular transforms explicitly", async () => {
    const text = new TextDecoder().decode(sceneFixture({ attributes: true }));
    await expect(
      load(
        new TextEncoder().encode(
          text.replace(
            '"Lcl Scaling", "Lcl Scaling", "", "A",1,1,1',
            '"Lcl Scaling", "Lcl Scaling", "", "A",0,1,1',
          ),
        ),
      ),
    ).rejects.toMatchObject({ code: "unsupported-profile" });
  });
  it("evaluates scaling pivots and retains original source properties", async () => {
    const d = await load(
      sceneFixture({ attributes: true, negative: true, scalingPivot: 0.5 }),
    );
    const { output } = await world(d);
    // T(p)*S(-2,1,1)*T(-p): x=1.5-2x. Reflection changes corner order.
    const sorted = output.sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
    [
      [-0.5, 0, 0],
      [1.5, 0, 0],
      [1.5, 1, 0],
    ].forEach((p, i) => close(sorted[i]!, p));
    expect(d.nodes[0]!.metadata!.sourceTransform).toMatchObject({
      ScalingPivot: [0.5, 0, 0],
      LclScaling: [-2, 1, 1],
    });
  });
  it("evaluates pre/post rotations and keeps parent geometry transforms out of descendants", async () => {
    const d = await load(
      sceneFixture({
        attributes: true,
        rotation: 30,
        preRotation: 45,
        postRotation: 15,
      }),
    );
    const { output } = await world(d);
    close(output[1]!, [0.5, Math.sqrt(3) / 2, 0]);
    close(output[2]!, [-Math.sqrt(3) / 2, 0.5, 0]);
    expect(d.nodes[0]!.metadata!.sourceTransform).toMatchObject({
      PreRotation: [0, 0, 45],
      PostRotation: [0, 0, 15],
    });
    const child = await load(
      sceneFixture({ hierarchy: true, parentGeometric: true }),
    );
    const projected = await world(child);
    close(projected.output[0]!, [2, 3, 0]);
    close(projected.output[1]!, [4, 3, 0]);
    close(projected.output[2]!, [2, 6, 0]);
  });
  it("maps Lambert opacity/emission and preserves source mesh/shader names", async () => {
    const d = await load(sceneFixture({ materials: true, opacity: true }));
    const m = d.materials[0]!;
    close(m.baseColorFactor, [0.8, 0.2, 0.1, 0.5]);
    close(m.emissiveFactor!, [0.2, 0.4, 0.6]);
    expect(m.alphaMode).toBe("blend");
    expect(m.sourceMetadata).toMatchObject({ shadingModel: "lambert" });
    expect(d.meshes[0]!.name).toBe("Surface");
    const text = new TextDecoder().decode(
      sceneFixture({ materials: true, opacity: true }),
    );
    const defaultFactor = await load(
      new TextEncoder().encode(
        text.replace('P: "EmissiveFactor", "Number", "", "A",2', ""),
      ),
    );
    close(defaultFactor.materials[0]!.emissiveFactor!, [0.1, 0.2, 0.3]);
    const coloured = new TextEncoder().encode(
      text.replace(
        '"TransparentColor", "Color", "", "A",1,1,1',
        '"TransparentColor", "Color", "", "A",1,0,0',
      ),
    );
    await expect(load(coloured)).rejects.toMatchObject({
      code: "unsupported-profile",
      diagnosticReport: { losses: [{ effect: "approximated" }] },
    });
    const negativeEmission = new TextEncoder().encode(
      text.replace(
        '"EmissiveColor", "Color", "", "A",0.1,0.2,0.3',
        '"EmissiveColor", "Color", "", "A",-0.1,0.2,0.3',
      ),
    );
    await expect(load(negativeEmission)).rejects.toMatchObject({
      code: "unsupported-profile",
      diagnosticReport: { losses: [{ effect: "approximated" }] },
    });
    const preview = await load(negativeEmission, { allowMaterialLoss: true });
    close(preview.materials[0]!.emissiveFactor!, [0, 0.4, 0.6]);
  });
  it.each([false, true])(
    "preserves attributes/materials in compressed=%s binary FBX",
    async (compressed) => {
      const d = await load(
        binary({ compressed, attributes: true, lambert: true }),
      );
      const { view } = await world(d);
      expect(view.geometry[0]!.normals).toHaveLength(9);
      expect(view.geometry[0]!.texcoords).toHaveLength(6);
      close(view.materials[0]!.baseColorFactor, [0.8, 0.2, 0.1, 1]);
      expect(view.primitives[0]!.materialSlot).toBe(0);
    },
  );
  it("admits polygons, per-corner normals/UVs and material identity deterministically", async () => {
    const bytes = sceneFixture({
      quad: true,
      attributes: true,
      materials: true,
    });
    const a = await load(bytes),
      b = await load(bytes);
    const { view, output } = await world(a);
    expect(output).toHaveLength(6);
    expect(new Set(output.map((v) => v.join())).size).toBe(4);
    expect(view.geometry[0]!.normals).toHaveLength(18);
    expect(view.geometry[0]!.texcoords).toHaveLength(12);
    expect(view.materials[0]!.name).toBe("Red");
    close(view.materials[0]!.baseColorFactor, [0.8, 0.2, 0.1, 1]);
    expect(view.primitives[0]!.materialSlot).toBe(0);
    expect(a).toEqual(b);
    expect(a.resources.map((r) => r.contentHash)).toEqual(
      b.resources.map((r) => r.contentHash),
    );
  });
  it.each([false, true])(
    "converts centimetres=%s exactly once with geometric transforms",
    async (centimetres) => {
      const d = await load(
        sceneFixture({ centimetres, attributes: true, geometric: true }),
      );
      const { output } = await world(d);
      close(output[0]!, [1, 0, 0]);
      close(output[1]!, [3, 0, 0]);
      close(output[2]!, [1, 3, 0]);
      expect(d.metadata.sourceUnitMetres).toBe(centimetres ? 0.01 : 1);
    },
  );
  it.each([0, 1, 2])(
    "preserves source hierarchy/pivot and static inherit mode%s",
    async (inherit) => {
      const d = await load(
        sceneFixture({
          hierarchy: true,
          attributes: true,
          rotation: 90,
          pivot: 0.25,
          inherit,
        }),
      );
      const parent = d.nodes.find((n) => n.name === "Parent")!,
        child = d.nodes.find((n) => n.name === "Surface")!;
      expect(parent.children).toContain(child.id);
      expect(child.metadata!.sourceInheritType).toBe(inherit);
      expect(child.metadata!.sourceTransform).toMatchObject({
        RotationPivot: [0.25, 0, 0],
      });
      const { output } = await world(d);
      // Pivot translation is inherited at (2*.25,3*-.25); scale ordering differs.
      close(output[0]!, [2.5, 2.25, 0]);
      close(
        output[1]!,
        inherit === 0
          ? [2.5, 4.25, 0]
          : inherit === 1
            ? [2.5, 5.25, 0]
            : [2.5, 3.25, 0],
      );
      close(
        output[2]!,
        inherit === 0
          ? [-0.5, 2.25, 0]
          : inherit === 1
            ? [0.5, 2.25, 0]
            : [1.5, 2.25, 0],
      );
    },
  );
  it.each([false, true])(
    "corrects reflected winding and normals for left-handed=%s plus negative scale",
    async (leftHanded) => {
      const d = await load(
        sceneFixture({ leftHanded, negative: true, attributes: true }),
      );
      const { view, output } = await world(d);
      const [a, b, c] = output;
      const cross = [
        (b![1]! - a![1]!) * (c![2]! - a![2]!) -
          (b![2]! - a![2]!) * (c![1]! - a![1]!),
        (b![2]! - a![2]!) * (c![0]! - a![0]!) -
          (b![0]! - a![0]!) * (c![2]! - a![2]!),
        (b![0]! - a![0]!) * (c![1]! - a![1]!) -
          (b![1]! - a![1]!) * (c![0]! - a![0]!),
      ];
      // Node normal basis has no Z scale; handedness flips the canonical Z normal.
      const n = view.geometry[0]!.normals!;
      expect(cross[2]! * n[2]! * (leftHanded ? -1 : 1)).toBeGreaterThan(0);
      expect(Math.hypot(n[0]!, n[1]!, n[2]!)).toBeCloseTo(1, 5);
    },
  );
  it("preserves separately transformed instances and prevents parent geometric transforms affecting children", async () => {
    const d = await load(
      sceneFixture({
        instances: true,
        hierarchy: true,
        attributes: true,
        geometric: true,
      }),
    );
    const { output } = await world(d);
    expect(d.meshes).toHaveLength(2);
    expect(output).toHaveLength(6);
    const sorted = output.sort((a, b) => a[1]! - b[1]! || a[0]! - b[0]!);
    [
      [4, 0, 0],
      [5, 0, 0],
      [4, 1, 0],
      [4, 3, 0],
      [8, 3, 0],
      [4, 12, 0],
    ].forEach((p, i) => close(sorted[i]!, p));
  });
  it("preserves a shared control point's UV seam and per-face material groups", async () => {
    const d = await load(
      sceneFixture({ twoFaces: true, attributes: true, materials: true }),
    );
    const { view } = await world(d);
    expect(view.primitives.map((p) => p.materialSlot)).toEqual([0, 1]);
    expect([...view.geometry[0]!.texcoords!]).toEqual([0, 0, 1, 0, 1, 1]);
    expect([...view.geometry[1]!.texcoords!]).toEqual([1, 0, 1, 1, 0, 1]);
  });
  it("uses inverse-transpose normals under nonuniform geometric scale", async () => {
    const d = await load(
      sceneFixture({ attributes: true, geometric: true, tilted: true }),
    );
    const { view } = await world(d);
    const n = view.geometry[0]!.normals!;
    close([...n.slice(0, 3)], [-1 / Math.sqrt(5), 0, 2 / Math.sqrt(5)]);
  });
  it("converts Z-up geometry and normals into Y-up without a second normalization", async () => {
    const d = await load(
      sceneFixture({
        attributes: true,
        zUp: true,
        tilted: true,
        centimetres: true,
      }),
    );
    const { output } = await world(d);
    close(output[0]!, [0, 0, 0]);
    close(output[1]!, [1, 1, 0]);
    close(output[2]!, [0, 0, -1]);
  });
  it("blocks unsupported material semantics with core loss records until explicit caller consent", async () => {
    const bytes = sceneFixture({ materials: true, phong: true });
    await expect(load(bytes)).rejects.toMatchObject({
      code: "unsupported-profile",
      diagnosticReport: {
        accepted: false,
        losses: [{ kind: "loss", effect: "approximated" }],
      },
    });
    const d = await load(bytes, { allowMaterialLoss: true });
    expect(d.metadata.materialDiagnosticReport).toMatchObject({
      accepted: true,
      losses: [{ kind: "loss" }],
    });
    expect(d.materials[0]!.sourceMetadata).toMatchObject({ format: "fbx" });
  });
});
