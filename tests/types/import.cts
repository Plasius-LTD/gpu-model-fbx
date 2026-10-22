import {
  createFbxImporter,
  FbxImportError,
  FBX_IMPORT_PROFILE,
  type FbxImporter,
} from "../../dist/index.cjs";
import type {
  GpuModelDocument,
  GpuModelDiagnosticReport,
} from "@plasius/gpu-model-core";

const importer: FbxImporter = createFbxImporter({
  resolveFeatureFlag: async (key) => key === "gpu.model.conversion.enabled",
  createWorker: () => new Worker("fbx-worker.js", { type: "module" }),
});
const document: Promise<GpuModelDocument> = importer.load(
  { kind: "uint8-array", bytes: new Uint8Array() },
  { allowMaterialLoss: true, signal: new AbortController().signal },
);
const profile: "plasius.fbx-linear-skin/3" = FBX_IMPORT_PROFILE;
const report: GpuModelDiagnosticReport | undefined = new FbxImportError(
  "unsupported-profile",
).diagnosticReport;
// @ts-expect-error Loss consent must be an explicit boolean.
importer.load({ kind: "blob", blob: new Blob() }, { allowMaterialLoss: "yes" });
void document;
void profile;
void report;
importer.dispose();
