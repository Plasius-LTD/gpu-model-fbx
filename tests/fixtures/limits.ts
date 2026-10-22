// Synthetic workload limits, Apache-2.0. No external assets.
import { ascii } from "./fbx.js";
export function overLimitFixture(
  kind: "triangles" | "nodes" | "materials",
): Uint8Array {
  let text = new TextDecoder().decode(ascii);
  if (kind === "triangles")
    text = text.replace(
      "PolygonVertexIndex: *3 { a: 0,1,-3 }",
      `PolygonVertexIndex: *30003 { a: ${Array(10001).fill("0,1,-3").join(",")} }`,
    );
  if (kind === "nodes") {
    text = text.replace(
      "Objects: {",
      `Objects: {\n${Array.from({ length: 64 }, (_, i) => `Model: ${i + 3}, "Model::Instance${i}", "Mesh" {Version:232\n}`).join("\n")}`,
    );
    text = text.replace(
      "Connections: {",
      `Connections: {\n${Array.from({ length: 64 }, (_, i) => `C: "OO",1,${i + 3}\n C: "OO",${i + 3},0`).join("\n")}`,
    );
  }
  if (kind === "materials")
    text = text.replace(
      "Objects: {",
      `Objects: {\n${Array.from({ length: 33 }, (_, i) => `Material: ${i + 100}, "Material::Synthetic${i}", "" {}`).join("\n")}`,
    );
  return new TextEncoder().encode(text);
}
