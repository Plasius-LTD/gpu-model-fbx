import type { GpuModelDocument, ModelSource } from "@plasius/gpu-model-core";
import type { RuntimeDependencies } from "@plasius/gpu-model-runtime";
import { loadRuntime } from "./modules.js";
import { FBX_IMPORT_FEATURE_FLAG, FBX_IMPORT_LIMITS, FbxImportError, sniffFbx, type FbxImportLimits, type ParsedFbx } from "./policy.js";
export { FBX_IMPORT_FEATURE_FLAG, FBX_IMPORT_PROFILE, FBX_IMPORT_LIMITS, FbxImportError, sniffFbx } from "./policy.js";
export type { FbxImportErrorCode } from "./policy.js";
/** Host-created module worker running this package's exported worker asset. */
export interface FbxWorker {
  postMessage(message: unknown, transfer: Transferable[]): void;
  terminate(): unknown;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
}
export interface FbxImporterOptions {
  /** Fresh authoritative remote decision. Missing/failed evaluation denies the operation. */
  readonly resolveFeatureFlag: (key: typeof FBX_IMPORT_FEATURE_FLAG) => Promise<boolean>;
  readonly createWorker: () => FbxWorker;
  /** Trusted acquisition ports. File providers must enforce runtime maxBytes while reading. */
  readonly dependencies?: RuntimeDependencies;
  readonly limits?: Partial<FbxImportLimits>;
}
export interface FbxImporter {
  load(source: ModelSource, options?: Readonly<{ signal?: AbortSignal; integrity?: string }>): Promise<GpuModelDocument>;
  /** Aborts the active operation and permanently denies further work; idempotent. */
  dispose(): void;
}
/** Creates an idle importer. No model, parser or worker is accessed until an authorized load. */
export function createFbxImporter(options: FbxImporterOptions): FbxImporter {
  if (!options || typeof options.resolveFeatureFlag !== "function" || typeof options.createWorker !== "function" ||
    Object.keys(options).some(k => !["resolveFeatureFlag", "createWorker", "dependencies", "limits"].includes(k))) throw new FbxImportError("invalid-input");
  const limits: { -readonly [K in keyof FbxImportLimits]: number } = { ...FBX_IMPORT_LIMITS };
  for (const [key, value] of Object.entries(options.limits ?? {})) {
    if (!(key in limits) || !Number.isInteger(value) || value < 1 || value > limits[key as keyof FbxImportLimits]) throw new FbxImportError("invalid-input");
    limits[key as keyof FbxImportLimits] = value;
  }
  let disposed = false; let active: AbortController | undefined;
  return {
    dispose() { disposed = true; active?.abort(new FbxImportError("disposed")); },
    async load(source, operation = {}) {
      if (disposed) throw new FbxImportError("disposed");
      if (active) throw new FbxImportError("busy");
      const controller = new AbortController(); active = controller;
      const { signal } = controller;
      const check = () => { if (signal.aborted) throw signal.reason; };
      const abort = () => controller.abort(new FbxImportError("aborted"));
      operation.signal?.addEventListener("abort", abort, { once: true }); if (operation.signal?.aborted) abort();
      const timer = setTimeout(() => controller.abort(new FbxImportError("deadline-exceeded")), limits.timeoutMs);
      let rejectAbort: (() => void) | undefined;
      const cancelled = new Promise<never>((_, reject) => { rejectAbort = () => reject(signal.reason); signal.addEventListener("abort", rejectAbort, { once: true }); if (signal.aborted) rejectAbort(); });
      async function granted() {
        check(); let result = false;
        try { result = await options.resolveFeatureFlag(FBX_IMPORT_FEATURE_FLAG); } catch { /* Fail closed without retaining provider exceptions. */ }
        check(); if (result !== true) throw new FbxImportError("disabled");
      }
      async function parse(bytes: Uint8Array): Promise<ParsedFbx> {
        await granted();
        if (!sniffFbx(bytes)) throw new FbxImportError("invalid-fbx");
        let worker: FbxWorker;
        try { worker = options.createWorker(); } catch { throw new FbxImportError("worker-failed"); }
        let cancelWord: Int32Array | undefined;
        try {
          if (typeof SharedArrayBuffer === "function" && globalThis.crossOriginIsolated === true) cancelWord = new Int32Array(new SharedArrayBuffer(4));
          return await new Promise<ParsedFbx>((resolve, reject) => {
            const onAbort = () => { if (cancelWord) Atomics.store(cancelWord, 0, 1); reject(signal.reason); };
            const settle = (fn: () => void) => { signal.removeEventListener("abort", onAbort); fn(); };
            worker.onmessage = event => settle(() => {
              const data = event.data;
              if (data && Object.keys(data).length === 1 && data.result) resolve(data.result);
              else reject(new FbxImportError(({ 1: "invalid-fbx", 2: "unsupported-profile", 3: "limit-exceeded", 4: "deadline-exceeded" } as const)[data?.error as 1] ?? "worker-failed"));
            });
            worker.onerror = () => settle(() => reject(new FbxImportError("worker-failed")));
            worker.onmessageerror = () => settle(() => reject(new FbxImportError("worker-failed")));
            signal.addEventListener("abort", onAbort, { once: true });
            if (signal.aborted) { settle(onAbort); return; }
            try {
              const copy = bytes.slice();
              worker.postMessage({ bytes: copy, parserBytes: limits.parserBytes, allocations: limits.allocations, timeoutMs: limits.timeoutMs, ...(cancelWord ? { cancel: cancelWord.buffer } : {}) }, [copy.buffer]);
            } catch { settle(() => reject(new FbxImportError("worker-failed"))); }
          });
        } catch (error) { check(); if (error instanceof FbxImportError) throw error; throw new FbxImportError("worker-failed"); }
        finally { worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; worker.terminate(); }
      }
      async function work() {
        await granted();
        const { AdapterRegistry, ModelRuntime } = await loadRuntime(); check();
        const registry = new AdapterRegistry().register<ParsedFbx, unknown>({ formatId: "fbx", load: async () => ({ formatId: "fbx", sniff: ({ bytes }) => Boolean(sniffFbx(bytes)), load: async input => ({ canonicalModel: await parse(input.bytes) }) }) });
        const runtime = new ModelRuntime({ registry, dependencies: options.dependencies });
        let result;
        try { result = await runtime.loadModel<ParsedFbx>(source, { signal, integrity: operation.integrity, formatId: "fbx", useCache: false, worker: { mode: "never" }, fetchPolicy: { maxBytes: limits.maxBytes, maxAttempts: 1, timeoutMs: limits.timeoutMs } }); }
        catch (error) { check(); if (error instanceof FbxImportError) throw error; throw new FbxImportError(error instanceof Error && error.name === "ModelResourceTooLargeError" ? "limit-exceeded" : "invalid-input"); }
        check(); await granted();
        const { toDocument } = await import("./document.js");
        let document: GpuModelDocument;
        try { document = await toDocument(result.canonicalModel, result.contentHash, signal); }
        catch { check(); throw new FbxImportError("worker-failed"); }
        check(); await granted(); return document;
      }
      try { return await Promise.race([work(), cancelled]); }
      finally { clearTimeout(timer); operation.signal?.removeEventListener("abort", abort); if (rejectAbort) signal.removeEventListener("abort", rejectAbort); if (active === controller) active = undefined; }
    },
  };
}
