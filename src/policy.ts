/** Non-raiseable budgets for the bounded FBX scene/animation import profile. */
export const FBX_IMPORT_LIMITS = Object.freeze({
  maxBytes: 8 * 1024 * 1024,
  parserBytes: 24 * 1024 * 1024,
  allocations: 50_000,
  timeoutMs: 10_000,
});
export const FBX_IMPORT_FEATURE_FLAG = "gpu.model.conversion.enabled" as const;
export const FBX_IMPORT_PROFILE = "plasius.fbx-animation/5" as const;
export type FbxImportLimits = {
  readonly [K in keyof typeof FBX_IMPORT_LIMITS]: number;
};
export type FbxImportErrorCode =
  | "disabled"
  | "disposed"
  | "busy"
  | "aborted"
  | "deadline-exceeded"
  | "invalid-input"
  | "invalid-fbx"
  | "unsupported-profile"
  | "limit-exceeded"
  | "worker-failed"
  | "unsupported-skinning"
  | "invalid-skin-weights"
  | "unsupported-morph"
  | "invalid-morph"
  | "unsupported-animation";
/** Bounded codes deliberately exclude source content and upstream error text. */
export class FbxImportError extends Error {
  public constructor(
    public readonly code: FbxImportErrorCode,
    public readonly diagnosticReport?: import("@plasius/gpu-model-core").GpuModelDiagnosticReport,
  ) {
    super(`FBX import: ${code}`);
    this.name = "FbxImportError";
  }
}
/** Private, bounded worker protocol. It carries no canonical verification brand. */
export interface ParsedFbx {
  readonly protocol: 5;
  readonly animationStacks: Float64Array;
  readonly animationLayers: Float64Array;
  readonly animationCurves: Float64Array;
  readonly animationKeys: Float64Array;
  readonly animationTimes: Float64Array;
  readonly animationTransforms: Float64Array;
  readonly animationWeights: Float64Array;
  readonly animationStackNames: readonly string[];
  readonly animationLayerNames: readonly string[];
  readonly animationCurveNames: readonly string[];
  readonly animationValueNames: readonly string[];
  readonly framesPerSecond: number;
  readonly timeMode: number;
  readonly ktimeSecond: number;
  readonly morphTable: Float64Array;
  readonly morphIndices: Float64Array;
  readonly morphPositions: Float32Array;
  readonly morphNormals: Float32Array;
  readonly morphNames: readonly string[];
  readonly channelNames: readonly string[];
  readonly poseTable: Float64Array;
  readonly poseNames: readonly string[];
  readonly jointTable: Float64Array;
  readonly skinTable: Float64Array;
  readonly clusterTable: Float64Array;
  readonly influenceTable: Float64Array;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly nodeTable: Float64Array;
  readonly primitiveTable: Float64Array;
  readonly materialTable: Float64Array;
  readonly nodeNames: readonly string[];
  readonly materialNames: readonly string[];
  readonly meshNames: readonly string[];
  readonly materialShaders: readonly string[];
  readonly version: number;
  readonly ascii: boolean;
  readonly unitMetres: number;
  readonly axes: readonly number[];
}
/** Content sniffing is only routing evidence; ufbx must validate the complete file. */
export function sniffFbx(bytes: Uint8Array): "ascii" | "binary" | undefined {
  const prefix = new TextDecoder().decode(bytes.subarray(0, 1024));
  if (prefix.startsWith("Kaydara FBX Binary  \0\x1a\0")) return "binary";
  if (
    /^(?:\uFEFF)?[\t\r\n ]*; FBX \d\.\d\.\d (?:project )?file[\s\S]*FBXHeaderExtension\s*:/u.test(
      prefix,
    )
  )
    return "ascii";
  return undefined;
}
