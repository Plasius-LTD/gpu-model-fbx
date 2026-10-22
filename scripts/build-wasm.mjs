import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile, cp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { wasmBytes } from "./wasm-bytes.mjs";
const revision = "26a482ae66871d7de36eb722aa060bce95bce274";
const sources = {
  "ufbx.c": "4a956c26a708e40d82ecb0aeaee54da709d5ba7c144c9642174970059bda7e1d",
  "ufbx.h": "f787be529af577efc04f3e3e735844a08556718dbb613d1211c2b313d72895dc",
  LICENSE: "0dd48ebadf52273c736256325c8f078c03c8bb4facee22a4122de0ad3f615391",
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const directory = path.resolve(
  process.env.FBX_BUILD_CACHE ?? ".fbx-build-cache",
);
await mkdir(directory, { recursive: true });
for (const [name, expected] of Object.entries(sources)) {
  const destination = path.join(directory, name);
  let bytes;
  try {
    bytes = await readFile(destination);
  } catch {
    /* Download only immutable source, verified below. */
  }
  if (!bytes || hash(bytes) !== expected) {
    const response = await fetch(
      `https://raw.githubusercontent.com/ufbx/ufbx/${revision}/${name}`,
      { signal: AbortSignal.timeout(30_000) },
    );
    if (!response.ok)
      throw new Error(`Pinned ufbx source unavailable: ${name}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== expected)
      throw new Error(`Pinned ufbx source integrity failed: ${name}`);
    await writeFile(destination, bytes);
  }
}
const emcc = process.env.EMCC ?? "emcc";
const version = spawnSync(emcc, ["--version"], { encoding: "utf8" });
if (
  version.status ||
  !version.stdout.includes("5.0.7 (263db4cffa6f9fc2ec514a70abac81362ea41849)")
)
  throw new Error("Build requires pinned Emscripten 5.0.7; see README");
await copyFile("native/bridge.c", path.join(directory, "bridge.c"));
const flags = [
  "ufbx.c",
  "bridge.c",
  "-O2",
  "-DUFBX_NO_STDIO",
  "-DUFBX_NO_FORMAT_OBJ",
  "-DUFBX_NO_GEOMETRY_CACHE",
  "-sENVIRONMENT=worker",
  "-sFILESYSTEM=0",
  "-sDYNAMIC_EXECUTION=0",
  "-sALLOW_MEMORY_GROWTH=0",
  "-sINITIAL_MEMORY=67108864",
  "-sSTACK_SIZE=1048576",
  "-sSTACK_OVERFLOW_CHECK=2",
  "-sMALLOC=emmalloc",
  "-sASSERTIONS=1",
  "-sMODULARIZE=1",
  "-sEXPORT_ES6=1",
  "-sSINGLE_FILE=1",
  "-sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPF32,HEAPF64",
  "-sEXPORTED_FUNCTIONS=_malloc,_free,_fbx_parse,_fbx_header,_fbx_output,_fbx_normals,_fbx_uvs,_fbx_nodes,_fbx_primitives,_fbx_materials,_fbx_node_names,_fbx_material_names,_fbx_mesh_names,_fbx_material_shaders,_fbx_poses,_fbx_pose_names,_fbx_joints,_fbx_skins,_fbx_clusters,_fbx_influences,_fbx_morphs,_fbx_morph_indices,_fbx_morph_positions,_fbx_morph_normals,_fbx_morph_names,_fbx_channel_names,_fbx_animation_stacks,_fbx_animation_layers,_fbx_animation_curves,_fbx_animation_keys,_fbx_animation_times,_fbx_animation_transforms,_fbx_animation_weights,_fbx_animation_stack_names,_fbx_animation_layer_names,_fbx_animation_curve_names,_fbx_animation_value_names,_fbx_outstanding",
  "-o",
  "ufbx.mjs",
];
const compiled = spawnSync(emcc, flags, { cwd: directory, stdio: "inherit" });
if (compiled.status) process.exit(compiled.status ?? 1);
await mkdir("dist", { recursive: true });
await copyFile(path.join(directory, "ufbx.mjs"), "dist/ufbx.mjs");
await copyFile(path.join(directory, "LICENSE"), "dist/UFBX-LICENSE.txt");
await copyFile("native/bridge.c", "dist/bridge.c");
await cp("legal/third-party", "dist/notices", { recursive: true });
const glue = await readFile("dist/ufbx.mjs");
const wasm = wasmBytes(glue);
await writeFile(
  "dist/ufbx-provenance.json",
  JSON.stringify(
    {
      upstream: {
        repository: "https://github.com/ufbx/ufbx",
        revision,
        license: "MIT",
        sha256: sources,
      },
      compiler: {
        emsdkRevision: "d7b4130688bfa348392b921ab04015aa15c4f154",
        sdkBackend: "6cd98e86d7749ff98b82b7f2ae78eb4f01942788",
        version: version.stdout.split("\n")[0],
      },
      flags,
      bridgeSha256: hash(await readFile("native/bridge.c")),
      glueSha256: hash(glue),
      wasmSha256: hash(wasm),
    },
    null,
    2,
  ) + "\n",
);
