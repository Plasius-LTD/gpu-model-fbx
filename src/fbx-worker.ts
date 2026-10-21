import { FBX_IMPORT_LIMITS, sniffFbx, type ParsedFbx } from "./policy.js";
interface WasmModule {
  HEAPU8: Uint8Array; HEAPF32: Float32Array; HEAPF64: Float64Array;
  deadline: number; cancelWord?: Int32Array;
  _malloc(n: number): number; _free(p: number): void;
  _fbx_parse(p: number, n: number, memory: number, allocations: number): number;
  _fbx_header(): number; _fbx_output(): number; _fbx_name(): number; _fbx_name_size(): number; _fbx_outstanding(): number;
}
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
// The parser may consume only admitted message bytes and its fixed module asset.
// Disable ambient transport APIs even if a future compiler glue fallback tries one.
function denyTransport(): never { throw new Error("FBX worker transport denied"); }
Object.assign(globalThis, { fetch: denyTransport, XMLHttpRequest: denyTransport, WebSocket: denyTransport, EventSource: denyTransport, importScripts: denyTransport });
let used = false;
scope.onmessage = async (event: MessageEvent) => {
  if (used) return; used = true;
  let wasm: WasmModule | undefined; let pointer = 0;
  try {
    const { bytes, parserBytes, allocations, timeoutMs, cancel } = event.data;
    if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > FBX_IMPORT_LIMITS.maxBytes ||
      !sniffFbx(bytes) || !Number.isInteger(parserBytes) || parserBytes < 1 || parserBytes > FBX_IMPORT_LIMITS.parserBytes ||
      !Number.isInteger(allocations) || allocations < 1 || allocations > FBX_IMPORT_LIMITS.allocations ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > FBX_IMPORT_LIMITS.timeoutMs ||
      (cancel !== undefined && (!(cancel instanceof SharedArrayBuffer) || cancel.byteLength !== 4))) throw 1;
    // Generated from pinned source; no FS, Node glue, dynamic evaluation or fetch.
    const { default: createWasm } = await import("./ufbx.mjs");
    wasm = await createWasm({ print() {}, printErr() {} }) as WasmModule;
    wasm.deadline = performance.now() + timeoutMs;
    if (cancel) wasm.cancelWord = new Int32Array(cancel);
    pointer = wasm._malloc(bytes.byteLength); if (!pointer) throw 3;
    wasm.HEAPU8.set(bytes, pointer);
    const code = wasm._fbx_parse(pointer, bytes.byteLength, parserBytes, allocations);
    if (code) throw code;
    if (wasm._fbx_outstanding() !== 0) throw 3;
    const header = wasm.HEAPF64.subarray(wasm._fbx_header() / 8, wasm._fbx_header() / 8 + 8);
    if (!Number.isInteger(header[0]) || header[0]! < 3 || header[0]! > 30_000) throw 3;
    const positions = wasm.HEAPF32.slice(wasm._fbx_output() / 4, wasm._fbx_output() / 4 + header[0]! * 3);
    const name = new TextDecoder("utf-8", { fatal: true }).decode(wasm.HEAPU8.subarray(wasm._fbx_name(), wasm._fbx_name() + wasm._fbx_name_size()));
    const result: ParsedFbx = { protocol: 1, positions, version: header[1]!, ascii: Boolean(header[2]), unitMetres: header[3]!, axes: [header[4]!, header[5]!, header[6]!], name };
    scope.postMessage({ result }, [positions.buffer]);
  } catch (error) {
    scope.postMessage({ error: typeof error === "number" && error >= 1 && error <= 4 ? error : 5 });
  } finally {
    if (pointer) wasm!._free(pointer);
  }
};
