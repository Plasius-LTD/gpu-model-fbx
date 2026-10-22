import { FBX_IMPORT_LIMITS, sniffFbx, type ParsedFbx } from "./policy.js";
interface WasmModule {
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
  HEAPF64: Float64Array;
  deadline: number;
  cancelWord?: Int32Array;
  _malloc(n: number): number;
  _free(p: number): void;
  _fbx_parse(p: number, n: number, memory: number, allocations: number): number;
  _fbx_header(): number;
  _fbx_output(): number;
  _fbx_normals(): number;
  _fbx_uvs(): number;
  _fbx_nodes(): number;
  _fbx_primitives(): number;
  _fbx_materials(): number;
  _fbx_node_names(): number;
  _fbx_material_names(): number;
  _fbx_mesh_names(): number;
  _fbx_material_shaders(): number;
  _fbx_poses(): number;
  _fbx_pose_names(): number;
  _fbx_joints(): number;
  _fbx_skins(): number;
  _fbx_clusters(): number;
  _fbx_influences(): number;
  _fbx_morphs(): number;
  _fbx_morph_indices(): number;
  _fbx_morph_positions(): number;
  _fbx_morph_normals(): number;
  _fbx_morph_names(): number;
  _fbx_channel_names(): number;
  _fbx_outstanding(): number;
}
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
// The parser may consume only admitted message bytes and its fixed module asset.
// Disable ambient transport APIs even if a future compiler glue fallback tries one.
function denyTransport(): never {
  throw new Error("FBX worker transport denied");
}
Object.assign(globalThis, {
  fetch: denyTransport,
  XMLHttpRequest: denyTransport,
  WebSocket: denyTransport,
  EventSource: denyTransport,
  importScripts: denyTransport,
});
let used = false;
scope.onmessage = async (event: MessageEvent) => {
  if (used) return;
  used = true;
  let wasm: WasmModule | undefined;
  let pointer = 0;
  try {
    const { bytes, parserBytes, allocations, timeoutMs, cancel } = event.data;
    if (
      !(bytes instanceof Uint8Array) ||
      !bytes.byteLength ||
      bytes.byteLength > FBX_IMPORT_LIMITS.maxBytes ||
      !sniffFbx(bytes) ||
      !Number.isInteger(parserBytes) ||
      parserBytes < 1 ||
      parserBytes > FBX_IMPORT_LIMITS.parserBytes ||
      !Number.isInteger(allocations) ||
      allocations < 1 ||
      allocations > FBX_IMPORT_LIMITS.allocations ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > FBX_IMPORT_LIMITS.timeoutMs ||
      (cancel !== undefined &&
        (!(cancel instanceof SharedArrayBuffer) || cancel.byteLength !== 4))
    )
      throw 1;
    // Generated from pinned source; no FS, Node glue, dynamic evaluation or fetch.
    const { default: createWasm } = await import("./ufbx.mjs");
    wasm = (await createWasm({ print() {}, printErr() {} })) as WasmModule;
    wasm.deadline = performance.now() + timeoutMs;
    if (cancel) wasm.cancelWord = new Int32Array(cancel);
    pointer = wasm._malloc(bytes.byteLength);
    if (!pointer) throw 3;
    wasm.HEAPU8.set(bytes, pointer);
    const code = wasm._fbx_parse(
      pointer,
      bytes.byteLength,
      parserBytes,
      allocations,
    );
    if (code) throw code;
    if (wasm._fbx_outstanding() !== 0) throw 3;
    const header = wasm.HEAPF64.subarray(
      wasm._fbx_header() / 8,
      wasm._fbx_header() / 8 + 18,
    );
    for (const [index, min, max] of [
      [0, 3, 30000],
      [7, 1, 64],
      [8, 1, 128],
      [9, 0, 32],
      [10, 0, 64],
      [11, 0, 64],
      [12, 0, 128],
      [13, 0, 512],
      [14, 0, 8],
      [15, 0, 128],
      [16, 0, 120000],
      [17, 0, 120000],
    ])
      if (
        !Number.isInteger(header[index!]) ||
        header[index!]! < min! ||
        header[index!]! > max!
      )
        throw 3;
    const positions = wasm.HEAPF32.slice(
      wasm._fbx_output() / 4,
      wasm._fbx_output() / 4 + header[0]! * 3,
    );
    const normals = wasm.HEAPF32.slice(
      wasm._fbx_normals() / 4,
      wasm._fbx_normals() / 4 + header[0]! * 3,
    );
    const uvs = wasm.HEAPF32.slice(
      wasm._fbx_uvs() / 4,
      wasm._fbx_uvs() / 4 + header[0]! * 2,
    );
    const nodeTable = wasm.HEAPF64.slice(
      wasm._fbx_nodes() / 8,
      wasm._fbx_nodes() / 8 + header[7]! * 67,
    );
    const primitiveTable = wasm.HEAPF64.slice(
      wasm._fbx_primitives() / 8,
      wasm._fbx_primitives() / 8 + header[8]! * 6,
    );
    const materialTable = wasm.HEAPF64.slice(
      wasm._fbx_materials() / 8,
      wasm._fbx_materials() / 8 + header[9]! * 126,
    );
    const names = (pointer: number, count: number, stride = 513) =>
      Array.from({ length: count }, (_, i) => {
        const slot = wasm!.HEAPU8.subarray(
          pointer + i * stride,
          pointer + (i + 1) * stride,
        );
        const end = slot.indexOf(0);
        if (end < 0) throw 3;
        return new TextDecoder("utf-8", { fatal: true }).decode(
          slot.subarray(0, end),
        );
      });
    const poseTable = wasm.HEAPF64.slice(
      wasm._fbx_poses() / 8,
      wasm._fbx_poses() / 8 + header[13]! * 14,
    );
    const jointTable = wasm.HEAPF64.slice(
      wasm._fbx_joints() / 8,
      wasm._fbx_joints() / 8 + header[10]! * 11,
    );
    const skinTable = wasm.HEAPF64.slice(
      wasm._fbx_skins() / 8,
      wasm._fbx_skins() / 8 + header[11]! * 3,
    );
    const clusterTable = wasm.HEAPF64.slice(
      wasm._fbx_clusters() / 8,
      wasm._fbx_clusters() / 8 + header[12]! * 39,
    );
    const influenceTable = wasm.HEAPF64.slice(
      wasm._fbx_influences() / 8,
      wasm._fbx_influences() / 8 + header[0]! * 16,
    );
    const morphTable = wasm.HEAPF64.slice(
      wasm._fbx_morphs() / 8,
      wasm._fbx_morphs() / 8 + header[15]! * 14,
    );
    const morphIndices = wasm.HEAPF64.slice(
      wasm._fbx_morph_indices() / 8,
      wasm._fbx_morph_indices() / 8 + header[17]!,
    );
    const morphPositions = wasm.HEAPF32.slice(
      wasm._fbx_morph_positions() / 4,
      wasm._fbx_morph_positions() / 4 + header[16]! * 3,
    );
    const morphNormals = wasm.HEAPF32.slice(
      wasm._fbx_morph_normals() / 4,
      wasm._fbx_morph_normals() / 4 + header[16]! * 3,
    );
    const result: ParsedFbx = {
      protocol: 4,
      morphTable,
      morphIndices,
      morphPositions,
      morphNormals,
      morphNames: names(wasm._fbx_morph_names(), header[15]!),
      channelNames: names(wasm._fbx_channel_names(), header[15]!),
      poseTable,
      poseNames: names(wasm._fbx_pose_names(), header[14]!),
      jointTable,
      skinTable,
      clusterTable,
      influenceTable,
      positions,
      normals,
      uvs,
      nodeTable,
      primitiveTable,
      materialTable,
      nodeNames: names(wasm._fbx_node_names(), header[7]!),
      materialNames: names(wasm._fbx_material_names(), header[9]!),
      meshNames: names(wasm._fbx_mesh_names(), header[7]!),
      materialShaders: names(wasm._fbx_material_shaders(), header[9]!, 129),
      version: header[1]!,
      ascii: Boolean(header[2]),
      unitMetres: header[3]!,
      axes: [header[4]!, header[5]!, header[6]!],
    };
    scope.postMessage({ result }, [
      morphTable.buffer,
      morphIndices.buffer,
      morphPositions.buffer,
      morphNormals.buffer,
      poseTable.buffer,
      jointTable.buffer,
      skinTable.buffer,
      clusterTable.buffer,
      influenceTable.buffer,
      positions.buffer,
      normals.buffer,
      uvs.buffer,
      nodeTable.buffer,
      primitiveTable.buffer,
      materialTable.buffer,
    ]);
  } catch (error) {
    scope.postMessage({
      error: typeof error === "number" && error >= 1 && error <= 9 ? error : 5,
    });
  } finally {
    if (pointer) wasm!._free(pointer);
  }
};
