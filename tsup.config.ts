import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/fbx-worker.ts"],
  dts: true,
  sourcemap: true,
  clean: true,
  format: ["esm", "cjs"],
  target: "es2022",
  external: ["./ufbx.mjs"],
  esbuildOptions(options, context) {
    options.define = { ...options.define, __FBX_CJS__: JSON.stringify(context.format === "cjs"), __FBX_LOAD_CJS__: context.format === "cjs" ? "require" : "undefined" };
  },
});
