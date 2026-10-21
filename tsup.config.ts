import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/fbx-worker.ts"],
  dts: true,
  sourcemap: true,
  clean: true,
  format: ["esm", "cjs"],
  target: "es2022",
  external: ["./ufbx.mjs"],
});
