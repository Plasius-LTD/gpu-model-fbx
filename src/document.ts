import type { GpuModelDocument } from "@plasius/gpu-model-core";
import { FbxImportError, FBX_IMPORT_PROFILE, type ParsedFbx } from "./policy.js";

/** Revalidates the worker message before crossing the privately verified core boundary. */
export async function toDocument(value: ParsedFbx, sourceHash: string, signal: AbortSignal): Promise<GpuModelDocument> {
  const invalid = () => { throw new FbxImportError("worker-failed"); };
  if (!value || Object.keys(value).sort().join() !== "ascii,axes,name,positions,protocol,unitMetres,version" ||
    value.protocol !== 1 || !(value.positions instanceof Float32Array) || value.positions.length < 9 ||
    value.positions.length > 90_000 || value.positions.length % 9 || typeof value.ascii !== "boolean" ||
    !Number.isInteger(value.version) || value.version < 6000 || value.version > 8000 ||
    !Number.isFinite(value.unitMetres) || value.unitMetres <= 0 || !Array.isArray(value.axes) || value.axes.length !== 3 ||
    value.axes.some(n => !Number.isInteger(n) || n < 0 || n > 6) || typeof value.name !== "string" || value.name.length > 512 ||
    !/^[a-f0-9]{64}$/u.test(sourceHash)) invalid();
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < value.positions.length; i++) {
    const n = value.positions[i]!; if (!Number.isFinite(n) || Math.abs(n) > 1_000_000) invalid();
    min[i % 3] = Math.min(min[i % 3]!, n); max[i % 3] = Math.max(max[i % 3]!, n);
  }
  const offset = [(min[0]! + max[0]!) / 2, min[1]!, (min[2]! + max[2]!) / 2];
  const positions = new Float32Array(value.positions.length);
  const outMin = [Infinity, Infinity, Infinity], outMax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    positions[i] = value.positions[i]! - offset[i % 3]!;
    outMin[i % 3] = Math.min(outMin[i % 3]!, positions[i]!); outMax[i % 3] = Math.max(outMax[i % 3]!, positions[i]!);
  }
  if (signal.aborted) throw new FbxImportError("aborted");
  const core = await import("@plasius/gpu-model-core");
  const { sha256Hex } = await import("@plasius/gpu-model-runtime");
  const hash = await sha256Hex(new Uint8Array(positions.buffer));
  const document = {
    schemaVersion: core.GPU_MODEL_DOCUMENT_SCHEMA_VERSION, coordinateSystem: core.CANONICAL_GPU_MODEL_COORDINATE_SYSTEM,
    roots: ["node-0"], nodes: [{ id: "node-0", ...(value.name ? { name: value.name } : {}), children: [], meshId: "mesh-0", localMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }],
    resources: [{ id: "positions", kind: "buffer", contentHash: hash, byteLength: positions.byteLength, mimeType: "application/octet-stream", payload: new Blob([positions.buffer], { type: "application/octet-stream" }) }],
    accessors: [{ id: "positions", resourceId: "positions", byteOffset: 0, count: positions.length / 3, componentType: "f32", elementType: "vec3", min: outMin, max: outMax }],
    meshes: [{ id: "mesh-0", primitives: [{ id: "triangles", topology: "triangles", attributes: [{ semantic: "POSITION", accessorId: "positions" }] }] }],
    materials: [], textures: [], skeletons: [], joints: [], skins: [], blendShapes: [], animations: [], analyticGeometry: [],
    bounds: { min: outMin, max: outMax }, provenance: { sourceFormat: "fbx", sourceContentHash: sourceHash, converterId: "plasius.gpu-model-fbx", converterVersion: "1", metadata: { profile: FBX_IMPORT_PROFILE } }, diagnostics: [],
    metadata: { profile: FBX_IMPORT_PROFILE, fbxVersion: value.version, ascii: value.ascii, sourceUnitMetres: value.unitMetres, sourceAxes: [...value.axes], floorCentreOffsetMetres: offset },
  };
  return core.createAndVerifyGpuModelDocument(document, {
    async digestSha256(chunks) {
      const parts: Uint8Array[] = []; let length = 0;
      for await (const part of chunks) { length += part.byteLength; if (length > 360_000) invalid(); parts.push(part); }
      const bytes = new Uint8Array(length); let cursor = 0;
      for (const part of parts) { bytes.set(part, cursor); cursor += part.length; }
      return sha256Hex(bytes);
    },
    async inspectResource(chunks) { for await (const _part of chunks) { if (signal.aborted) throw new FbxImportError("aborted"); } return { valid: true, detectedMimeType: "application/octet-stream" }; },
  }, { signal, limits: { maxResourceBytes: 360_000, maxAggregateBytes: 360_000, timeoutMs: 10_000 } });
}
