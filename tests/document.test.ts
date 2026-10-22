import { describe, expect, it } from "vitest";
import { toDocument } from "../src/document.js";
import type { ParsedFbx } from "../src/policy.js";

// An untrusted worker has no authority to supply a canonical verification brand.
function message(): ParsedFbx {
  const nodeTable = new Float64Array(67);
  nodeTable[0] = -1;
  nodeTable[2] = 1;
  [3, 7, 11, 15, 19, 23].forEach((i) => (nodeTable[i] = 1));
  nodeTable[29] =
    nodeTable[30] =
    nodeTable[31] =
    nodeTable[60] =
    nodeTable[61] =
    nodeTable[62] =
      1;
  return {
    protocol: 3,
    poseTable: new Float64Array(),
    poseNames: [],
    jointTable: new Float64Array(),
    skinTable: new Float64Array(),
    clusterTable: new Float64Array(),
    influenceTable: new Float64Array(48),
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array(9),
    uvs: new Float32Array(6),
    nodeTable,
    primitiveTable: new Float64Array([0, 0, 3, -1, 0, 0]),
    materialTable: new Float64Array(),
    nodeNames: ["Synthetic"],
    materialNames: [],
    meshNames: ["Mesh"],
    materialShaders: [],
    version: 7400,
    ascii: true,
    unitMetres: 1,
    axes: [0, 2, 4],
  };
}
const convert = (value: ParsedFbx, signal = new AbortController().signal) =>
  toDocument(value, "a".repeat(64), signal);
describe("untrusted static-scene protocol admission", () => {
  it("owns the complete message before asynchronous verification yields", async () => {
    const input = message();
    const pending = convert(input);
    input.positions.fill(5);
    input.nodeTable[0] = 0;
    const d = await pending;
    expect(d.bounds).toEqual({ min: [-0.5, 0, 0], max: [0.5, 1, 0] });
    expect([
      ...new Float32Array(await d.resources[0]!.payload.arrayBuffer()),
    ]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  });
  it("verifies finite immutable canonical bytes and owns the worker's arrays", async () => {
    const input = message();
    const d = await convert(input);
    input.positions.fill(5);
    expect([
      ...new Float32Array(await d.resources[0]!.payload.arrayBuffer()),
    ]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(d.bounds).toEqual({ min: [-0.5, 0, 0], max: [0.5, 1, 0] });
  });
  it.each([
    (v: ParsedFbx) => ({ ...v, protocol: 1 }),
    (v: ParsedFbx) => ({ ...v, extra: 1 }),
    (v: ParsedFbx) => ({ ...v, nodeNames: ["unsafe\nname"] }),
    (v: ParsedFbx) => ({ ...v, axes: [0, 1, 2] }),
    (v: ParsedFbx) => ({ ...v, unitMetres: 0 }),
    (v: ParsedFbx) => ({ ...v, nodeTable: new Float64Array(67 * 65) }),
    (v: ParsedFbx) => ({ ...v, materialTable: new Float64Array(126 * 33) }),
    (v: ParsedFbx) => ({ ...v, primitiveTable: new Float64Array(6 * 129) }),
    (v: ParsedFbx) => ({ ...v, positions: new Float32Array(18) }),
    (v: ParsedFbx) => ({ ...v, normals: new Float32Array(8) }),
    (v: ParsedFbx) => ({
      ...v,
      positions: new Float32Array(new SharedArrayBuffer(36)),
    }),
  ])(
    "rejects malformed shapes before resource verification",
    async (mutate) => {
      await expect(
        convert(mutate(message()) as ParsedFbx),
      ).rejects.toMatchObject({ code: "worker-failed" });
    },
  );
  it.each([
    ["nodeTable", 0, 0],
    ["nodeTable", 2, 0],
    ["nodeTable", 1, 1],
    ["nodeTable", 63, 3],
    ["nodeTable", 66, -1],
    ["primitiveTable", 0, 1],
    ["primitiveTable", 1, 1],
    ["primitiveTable", 2, 6],
    ["primitiveTable", 3, 0],
    ["positions", 0, NaN],
    ["positions", 0, 1000001],
    ["uvs", 0, Infinity],
  ] as const)(
    "rejects graph/count/reference/numeric violation %s[%i]",
    async (key, index, value) => {
      const input = message();
      input[key][index] = value;
      await expect(convert(input)).rejects.toMatchObject({
        code: "worker-failed",
      });
    },
  );
  it("rejects zero normals and excessive UVs when those attributes are admitted", async () => {
    const a = message();
    a.primitiveTable[4] = 1;
    await expect(convert(a)).rejects.toMatchObject({ code: "worker-failed" });
    const b = message();
    b.primitiveTable[5] = 1;
    b.uvs[0] = 1000001;
    await expect(convert(b)).rejects.toMatchObject({ code: "worker-failed" });
  });
  it("rejects a multi-node cycle and an aborted conversion", async () => {
    const a = message();
    const table = new Float64Array(134);
    table.set(a.nodeTable);
    table.set(a.nodeTable, 67);
    table[0] = 1;
    table[67] = 0;
    await expect(
      convert({
        ...a,
        nodeTable: table,
        nodeNames: ["A", "B"],
        meshNames: ["Mesh", "Mesh"],
      }),
    ).rejects.toMatchObject({ code: "worker-failed" });
    const abort = new AbortController();
    abort.abort();
    await expect(convert(message(), abort.signal)).rejects.toMatchObject({
      code: "aborted",
    });
  });
});

function skinnedMessage(): ParsedFbx {
  const v = message();
  const jointTable = new Float64Array([0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1]);
  const clusterTable = new Float64Array(39);
  for (const base of [3, 15, 27])
    for (const k of [0, 4, 8]) clusterTable[base + k] = 1;
  const influenceTable = new Float64Array(48);
  for (let i = 0; i < 3; i++) influenceTable[i * 16 + 8] = 1;
  return {
    ...v,
    jointTable,
    skinTable: new Float64Array([0, 0, 1]),
    clusterTable,
    influenceTable,
  };
}
describe("untrusted skeletal table admission", () => {
  it("snapshots all skeletal tables before yielding", async () => {
    const input = skinnedMessage();
    const p = convert(input);
    input.influenceTable.fill(1);
    input.jointTable.fill(1);
    input.skinTable.fill(1);
    input.clusterTable.fill(1);
    const d = await p;
    expect(d.skins[0]!.weightSets[0]!.weights[0]).toEqual([1, 0, 0, 0]);
  });
  it.each([
    (v: ParsedFbx) => ({ ...v, jointTable: new Float64Array(12) }),
    (v: ParsedFbx) => ({ ...v, skinTable: new Float64Array(4) }),
    (v: ParsedFbx) => ({ ...v, clusterTable: new Float64Array(40) }),
    (v: ParsedFbx) => ({ ...v, influenceTable: new Float64Array(47) }),
    (v: ParsedFbx) => ({
      ...v,
      influenceTable: new Float64Array(new SharedArrayBuffer(48 * 8)),
    }),
    (v: ParsedFbx) => ({ ...v, poseNames: ["bad\n"] }),
    (v: ParsedFbx) => ({ ...v, poseNames: ["unused"] }),
    (v: ParsedFbx) => ({ ...v, poseTable: new Float64Array(14) }),
  ])("rejects malformed skeletal shapes%s", async (mutate) => {
    await expect(convert(mutate(skinnedMessage()))).rejects.toMatchObject({
      code: "worker-failed",
    });
  });
  it.each([
    ["jointTable", 0, 99],
    ["jointTable", 1, 1],
    ["jointTable", 7, 0],
    ["jointTable", 8, 0],
    ["skinTable", 0, 9],
    ["skinTable", 1, 1],
    ["skinTable", 2, 0],
    ["clusterTable", 0, 9],
    ["clusterTable", 1, -1],
    ["clusterTable", 2, 100],
    ["clusterTable", 3, 0],
    ["influenceTable", 0, 1],
    ["influenceTable", 8, 0],
    ["influenceTable", 8, -1],
    ["influenceTable", 9, 1],
  ] as const)("rejects forged%s[%i]", async (key, i, value) => {
    const v = skinnedMessage();
    v[key][i] = value;
    await expect(convert(v)).rejects.toMatchObject({ code: "worker-failed" });
  });
});
