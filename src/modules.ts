// Build-format selection only; never a runtime rollout or entitlement control.
declare const __FBX_CJS__: boolean;
declare const __FBX_LOAD_CJS__: (id: string) => unknown;
/** Keep the core's private resource/document brand in the consumer's module format. */
export async function loadCore(): Promise<typeof import("@plasius/gpu-model-core")> {
  if (typeof __FBX_CJS__ !== "undefined" && __FBX_CJS__) return __FBX_LOAD_CJS__("@plasius/gpu-model-core") as typeof import("@plasius/gpu-model-core");
  return import("@plasius/gpu-model-core");
}
/** Both formats load acquisition only after a fresh positive remote decision. */
export async function loadRuntime(): Promise<typeof import("@plasius/gpu-model-runtime")> {
  if (typeof __FBX_CJS__ !== "undefined" && __FBX_CJS__) return __FBX_LOAD_CJS__("@plasius/gpu-model-runtime") as typeof import("@plasius/gpu-model-runtime");
  return import("@plasius/gpu-model-runtime");
}
