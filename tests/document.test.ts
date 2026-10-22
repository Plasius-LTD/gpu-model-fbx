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
    protocol: 2,
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
