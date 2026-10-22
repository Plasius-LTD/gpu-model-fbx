/* global Worker, document, location, caches, indexedDB, crossOriginIsolated */
import { createFbxImporter } from "fbx-under-test";
let created = 0, terminated = 0, active = 0, highWater = 0;
function createWorker() {
  const worker = new Worker("/fbx-worker.js", { type: "module" });
  worker.addEventListener("error", event => { globalThis.workerFailure = event.message; });
  worker.addEventListener("message", event => { globalThis.workerReply = { error: event.data?.error, result: Boolean(event.data?.result) }; });
  const send = worker.postMessage.bind(worker);
  worker.postMessage = (...args) => { try { return send(...args); } catch (error) { globalThis.workerFailure = `postMessage: ${error.name}: ${error.message}`; throw error; } };
  created++; active++; highWater = Math.max(active, highWater);
  const close = worker.terminate.bind(worker); let closed = false;
  worker.terminate = () => { if (!closed) { closed = true; terminated++; active--; close(); } };
  return worker;
}
const check = (value, message) => { if (!value) throw new Error(message); };
async function rejects(promise, code) {
  try { await promise; throw new Error("Expected rejection"); } catch (error) { check(error.code === code, `Expected ${code}, got ${error.code}`); }
}
async function run() {
  const fixture = await (await fetch("/fixtures.json")).json(); const checks = [];
  let granted = false;
  const importer = createFbxImporter({ resolveFeatureFlag: async () => granted, createWorker });
  await rejects(importer.load({ kind: "url", url: location.origin + "/should-not-load.fbx" }), "disabled");
  check(created === 0, "Denied request allocated a worker"); checks.push("denied-before-io");
  const resourcesBeforeGrant = performance.getEntriesByType("resource").map(entry => new URL(entry.name).pathname);
  granted = true;
  for (const key of ["ascii", "binary", "compressed"]) {
    const document = await importer.load({ kind: "uint8-array", bytes: new Uint8Array(fixture[key]) });
    const { isGpuModelDocument } = await import("@plasius/gpu-model-core"); check(isGpuModelDocument(document), "Core private document brand");
    check(JSON.stringify(document.bounds) === JSON.stringify({ min: [-.5, 0, 0], max: [.5, 1, 0] }), `${key} bounds`);
    check(document.meshes.length === 1 && document.nodes[0].name === "Triangle", `${key} document`);
    check(active === 0, "Worker retained after successful import"); checks.push(key);
  }
  const fetched = await importer.load({ kind: "url", url: location.origin + "/triangle.fbx" }); check(fetched.meshes.length === 1, "Runtime URL acquisition"); checks.push("bounded-url-acquisition");
  const {checkGeometry}=await import("./geometry.mjs");checks.push(...await checkGeometry(importer,fixture,check));
  const quad=await importer.load({kind:"uint8-array",bytes:new Uint8Array(fixture.quad)});check(quad.accessors[0].count===6,"Polygon triangulation");checks.push("polygon-triangulation");
  await rejects(importer.load({kind:"uint8-array",bytes:new Uint8Array(fixture.unsupported)}),"unsupported-profile");
  await rejects(importer.load({ kind: "uint8-array", bytes: new Uint8Array(fixture.binary).slice(0, 100) }), "invalid-fbx");
  await rejects(importer.load({ kind: "uint8-array", bytes: new Uint8Array(fixture.adversarial) }), "invalid-fbx"); checks.push("malformed-unsupported-decompression-rejected");
  await rejects(importer.load({ kind: "uint8-array", bytes: new Uint8Array(fixture.expanded) }), "limit-exceeded"); checks.push("consistent-expanded-array-bounded");
  const beforeRollback = created; granted = false;
  await rejects(importer.load({ kind: "uint8-array", bytes: new Uint8Array(fixture.binary) }), "disabled"); check(created === beforeRollback, "Rollback allocated worker");
  granted = true;
  for (let i = 0; i < 20; i++) { await importer.load({ kind: "uint8-array", bytes: new Uint8Array(fixture.binary) }); check(active === 0, "Repeated operation retained worker"); }
  checks.push("rollback-restore-20-disposals");
  const stop = new AbortController(); stop.abort();
  await rejects(importer.load({ kind: "uint8-array", bytes: new Uint8Array(fixture.binary) }, { signal: stop.signal }), "aborted");
  importer.dispose(); importer.dispose(); await rejects(importer.load({ kind: "uint8-array", bytes: new Uint8Array(fixture.binary) }), "disposed");
  const hung = createFbxImporter({ resolveFeatureFlag: async () => true, limits: { timeoutMs: 100 }, createWorker() {
    const worker = new Worker("/hang-worker.js"); created++; active++; highWater = Math.max(active, highWater);
    const close = worker.terminate.bind(worker); let closed = false; worker.terminate = () => { if (!closed) { closed = true; terminated++; active--; close(); } }; return worker;
  } });
  await rejects(hung.load({ kind: "uint8-array", bytes: new Uint8Array(fixture.binary) }), "deadline-exceeded"); hung.dispose();
  const cancellation = new AbortController();
  const abortable = createFbxImporter({ resolveFeatureFlag: async () => true, createWorker() {
    const worker = new Worker("/hang-worker.js"); created++; active++; highWater = Math.max(active, highWater);
    const close = worker.terminate.bind(worker); let closed = false; worker.terminate = () => { if (!closed) { closed = true; terminated++; active--; close(); } };
    setTimeout(() => cancellation.abort(), 20); return worker;
  } });
  await rejects(abortable.load({ kind: "uint8-array", bytes: new Uint8Array(fixture.binary) }, { signal: cancellation.signal }), "aborted"); abortable.dispose(); checks.push("active-abort-termination");
  check(created === terminated && active === 0 && highWater === 1, "Worker lifecycle not bounded"); checks.push("hard-deadline-termination");
  check(localStorage.length === 0 && sessionStorage.length === 0 && (await caches.keys()).length === 0 && (await indexedDB.databases()).length === 0, "Unexpected persistence");
  return { checks, created, terminated, active, highWater, crossOriginIsolated, userAgent: navigator.userAgent, resourcesBeforeGrant, resourceCount: performance.getEntriesByType("resource").length, resources: [...new Set(performance.getEntriesByType("resource").map(entry => new URL(entry.name).pathname))] };
}
document.querySelector("button").addEventListener("click", async () => {
  const output = document.querySelector("pre"); output.textContent = "Running";
  try { globalThis.fbxProof = await run(); output.textContent = "PASS\n" + JSON.stringify(globalThis.fbxProof, null, 2); }
  catch (error) { globalThis.fbxFailure = String(error); output.textContent = "FAIL\n" + String(error) + "\n" + JSON.stringify({created,terminated,workerFailure: globalThis.workerFailure, workerReply: globalThis.workerReply}); }
});
