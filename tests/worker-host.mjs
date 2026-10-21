// Isolated Node worker harness; real browser qualification is a separate gate.
import { parentPort, workerData } from "node:worker_threads";
globalThis.self = globalThis;
globalThis.WorkerGlobalScope = class {};
globalThis.importScripts = () => { throw new Error("Unexpected importScripts"); };
delete globalThis.process;
globalThis.postMessage = (message, transfer) => parentPort.postMessage(message, transfer);
await import(workerData.module);
parentPort.on("message", data => globalThis.onmessage({ data }));
parentPort.postMessage({ ready: true });
