/** Non-raiseable budgets for the bounded static FBX import profile. */
export const FBX_IMPORT_LIMITS = Object.freeze({ maxBytes: 8 * 1024 * 1024, parserBytes: 24 * 1024 * 1024, allocations: 50_000, timeoutMs: 10_000 });
export const FBX_IMPORT_FEATURE_FLAG = "gpu.model.conversion.enabled" as const;
export const FBX_IMPORT_PROFILE = "plasius.fbx-static-triangles/1" as const;
export type FbxImportLimits = { readonly [K in keyof typeof FBX_IMPORT_LIMITS]: number };
export type FbxImportErrorCode = "disabled" | "disposed" | "busy" | "aborted" | "deadline-exceeded" | "invalid-input" | "invalid-fbx" | "unsupported-profile" | "limit-exceeded" | "worker-failed";
/** Bounded codes deliberately exclude source content and upstream error text. */
export class FbxImportError extends Error {
  public constructor(public readonly code: FbxImportErrorCode) { super(`FBX import: ${code}`); this.name = "FbxImportError"; }
}
export interface ParsedFbx {
  readonly protocol: 1;
  readonly positions: Float32Array;
  readonly version: number;
  readonly ascii: boolean;
  readonly unitMetres: number;
  readonly axes: readonly number[];
  readonly name: string;
}
/** Content sniffing is only routing evidence; ufbx must validate the complete file. */
export function sniffFbx(bytes: Uint8Array): "ascii" | "binary" | undefined {
  const prefix = new TextDecoder().decode(bytes.subarray(0, 1024));
  if (prefix.startsWith("Kaydara FBX Binary  \0\x1a\0")) return "binary";
  if (/^(?:\uFEFF)?[\t\r\n ]*; FBX \d\.\d\.\d (?:project )?file[\s\S]*FBXHeaderExtension\s*:/u.test(prefix)) return "ascii";
  return undefined;
}
