import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { wasmBytes } from "./wasm-bytes.mjs";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const manifest = JSON.parse(await readFile("dist/ufbx-provenance.json", "utf8"));
const baseline = JSON.parse(await readFile("native/artifact-baseline.json", "utf8"));
assert.deepEqual(manifest, baseline, "Compiled output differs from reviewed source/compiler/artifact baseline");
const glue = await readFile("dist/ufbx.mjs"); const wasm = wasmBytes(glue);
assert.equal(hash(glue), manifest.glueSha256); assert.equal(hash(wasm), manifest.wasmSha256);
assert.equal(hash(await readFile("native/bridge.c")), manifest.bridgeSha256);
assert.equal(hash(await readFile("dist/bridge.c")), manifest.bridgeSha256);
assert.ok(!/\beval\s*\(|\bimport\s*\(|\brequire\s*\(/u.test(glue.toString()), "No dynamic evaluation or Node loader");
const imports = WebAssembly.Module.imports(new WebAssembly.Module(wasm));
assert.ok(imports.every(item => item.kind === "function" && ["env", "wasi_snapshot_preview1"].includes(item.module)), "No imported memory or ambient runtime");
// Decode the memory declaration directly: one internal memory with a hard 64MiB maximum.
let cursor = 8; const uleb = () => { let value = 0, shift = 0, byte; do { byte = wasm[cursor++]; value += (byte & 127) * 2 ** shift; shift += 7; } while (byte & 128); return value; };
let memory;
while (cursor < wasm.length) { const id = wasm[cursor++], size = uleb(), end = cursor + size; if (id === 5) memory = [uleb(), uleb(), uleb(), uleb()]; cursor = end; }
assert.deepEqual(memory, [1, 1, 1024, 1024]);
const notices = await readdir("legal/third-party");
for (const file of notices) assert.equal(hash(await readFile(`dist/notices/${file}`)), hash(await readFile(`legal/third-party/${file}`)));
for (const file of ["dist/index.js", "dist/index.cjs", "dist/index.d.ts", "dist/index.d.cts", "dist/fbx-worker.js"]) assert.ok((await readFile(file)).length > 0);
console.log(`FBX artifact baseline, hard memory cap and ${notices.length} notices verified; WASM ${wasm.length} bytes; imports ${imports.map(item => item.name).join(",")}`);
