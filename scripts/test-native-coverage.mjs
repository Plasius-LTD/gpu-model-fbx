import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { sceneFixture } from "../tests/fixtures/scene.ts";
import { overLimitFixture } from "../tests/fixtures/limits.ts";
import { ascii, binary } from "../tests/fixtures/fbx.ts";
const emcc = process.env.EMCC ?? "emcc";
const build = path.resolve(process.env.FBX_BUILD_CACHE ?? ".fbx-build-cache");
const output = path.join(build, "coverage"); await mkdir(output, { recursive: true });
const bin = path.resolve(path.dirname(emcc), "../bin");
const run = (command, args) => { const r = spawnSync(command, args, { encoding: "utf8" }); if (r.status) throw new Error(`${command}: ${r.stderr || r.stdout}`); return r.stdout; };
const bridge = path.join(output, "bridge.o"); const parser = path.join(output, "parser.o");
run(emcc, ["-O0", "-fprofile-instr-generate", "-fcoverage-mapping", "-I", build, "-c", "native/bridge.c", "-o", bridge]);
run(emcc, ["-O2", "-DUFBX_NO_STDIO", "-DUFBX_NO_FORMAT_OBJ", "-DUFBX_NO_GEOMETRY_CACHE", "-c", path.join(build, "ufbx.c"), "-o", parser]);
await writeFile(path.join(output, "profile.c"), "#include <stdint.h>\nextern uint64_t __llvm_profile_get_size_for_buffer(void);\nextern int __llvm_profile_write_buffer(char*);\nunsigned coverage_size(void){return (unsigned)__llvm_profile_get_size_for_buffer();}\nint coverage_write(char *p){return __llvm_profile_write_buffer(p);}\n");
const moduleFile = path.join(output, "instrumented.mjs");
run(emcc, [bridge, parser, path.join(output, "profile.c"), "-fprofile-instr-generate", "-sMODULARIZE=1", "-sEXPORT_ES6=1", "-g", "-sENVIRONMENT=worker", "-sINITIAL_MEMORY=67108864", "-sALLOW_MEMORY_GROWTH=0", "-sSTACK_SIZE=1048576", "-sFILESYSTEM=1", "-sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPF32,HEAPF64", "-sEXPORTED_FUNCTIONS=_malloc,_free,_fbx_parse,_fbx_header,_fbx_output,_fbx_normals,_fbx_uvs,_fbx_nodes,_fbx_primitives,_fbx_materials,_fbx_node_names,_fbx_material_names,_fbx_mesh_names,_fbx_material_shaders,_fbx_outstanding,_coverage_size,_coverage_write", "-o", moduleFile]);
const processValue = globalThis.process;
globalThis.WorkerGlobalScope = class {}; globalThis.self = globalThis; globalThis.importScripts = () => { throw new Error("Unexpected resource access"); };
let wasm;
try { delete globalThis.process; const { default: factory } = await import(pathToFileURL(moduleFile).href); wasm = await factory({ wasmBinary: new Uint8Array(await readFile(moduleFile.replace(".mjs", ".wasm"))), print() {}, printErr() {} }); }
finally { globalThis.process = processValue; }
let tests = 0;
function parse(bytes, expected, memory = 25165824, allocations = 50000, deadline = performance.now() + 10000) {
  wasm.deadline = deadline; const p = wasm._malloc(bytes.length || 1); assert.ok(p); wasm.HEAPU8.set(bytes, p);
  try {
    assert.equal(wasm._fbx_parse(p, bytes.length, memory, allocations), expected);
    assert.equal(wasm._fbx_outstanding(), 0);
    if (!expected) { assert.ok(wasm.HEAPF64[wasm._fbx_header()/8] >= 3); assert.ok(wasm._fbx_output()); assert.ok(wasm._fbx_node_names()); }
    tests++;
  } finally { wasm._free(p); }
}
for (let i = 0; i < 20; i++) { parse(ascii, 0); parse(binary(), 0); parse(binary({ compressed: true }), 0); }
parse(binary().slice(0, 100), 1); parse(new Uint8Array(), 3); parse(new Uint8Array(8388609), 3);
parse(binary({ quad: true }), 0); parse(binary({ material: true }), 0);
for(const kind of ["triangles","nodes","materials"]) parse(overLimitFixture(kind),3);
for (const opts of [{quad:true,attributes:true,materials:true},{centimetres:true,geometric:true,attributes:true},{leftHanded:true,negative:true,attributes:true},{hierarchy:true,rotation:90,pivot:.25,inherit:0},{hierarchy:true,rotation:90,inherit:1},{hierarchy:true,rotation:90,inherit:2},{instances:true,attributes:true},{materials:true,phong:true}]) parse(sceneFixture(opts),0);
// ufbx rejects the inconsistent compressed-array length before allocating.
parse(binary({ compressed: true, declaredVertices: 0x20000000 }), 1);
parse(binary({ compressed: true, expandedVertices: true }), 3);
parse(ascii, 3, 1); parse(ascii, 3, 25165824, 1); parse(ascii, 3, 25165825); parse(ascii, 3, 0); parse(ascii, 3, 25165824, 0); parse(ascii, 3, 25165824, 50001);
parse(ascii, 4, 25165824, 50000, 0);
wasm.cancelWord = new Int32Array(new SharedArrayBuffer(4)); Atomics.store(wasm.cancelWord, 0, 1);
parse(ascii, 4); wasm.cancelWord = undefined;
const size = wasm._coverage_size(), pointer = wasm._malloc(size); assert.ok(pointer); assert.equal(wasm._coverage_write(pointer), 0);
const raw = path.join(output, "bridge.profraw"); await writeFile(raw, wasm.HEAPU8.slice(pointer, pointer + size)); wasm._free(pointer);
run(path.join(bin, "llvm-profdata"), ["merge", "-sparse", raw, "-o", path.join(output, "bridge.profdata")]);
const lcov = run(path.join(bin, "llvm-cov"), ["export", moduleFile.replace(".mjs", ".wasm"), "-instr-profile=" + path.join(output, "bridge.profdata"), "-format=lcov", "native/bridge.c"]);
await mkdir("coverage", { recursive: true }); await writeFile("coverage/native-lcov.info", lcov);
const lf = [...lcov.matchAll(/^LF:(\d+)/gm)].reduce((sum, match) => sum + Number(match[1]), 0);
const lh = [...lcov.matchAll(/^LH:(\d+)/gm)].reduce((sum, match) => sum + Number(match[1]), 0);
assert.ok(lf > 0 && lh / lf >= .8, `Native line coverage ${lh}/${lf} below80%`);
await writeFile("coverage/lcov.info", await readFile("coverage/lcov.info", "utf8") + lcov);
console.log(`Instrumented WASM bridge: ${tests} checks; native LCOV ${lh}/${lf} (${(100*lh/lf).toFixed(2)}%)`);
