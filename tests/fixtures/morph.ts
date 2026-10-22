// Self-authored Plasius Apache-2.0 synthetic morphs; no third-party assets.
import { sceneFixture, type SceneOptions } from "./scene.js";
import { skinFixture } from "./skin.js";
export interface MorphOptions extends SceneOptions {
  skin?: boolean;
  inbetween?: boolean;
  channels?: number;
  weight?: number;
  thresholds?: number[];
  indices?: number[];
  delta?: number[];
  normals?: boolean;
  stacked?: boolean;
  offsetWeights?: boolean;
}
export function morphFixture(o: MorphOptions = {}): Uint8Array {
  const scale = o.centimetres ? 100 : 1;
  let text = new TextDecoder().decode(
    o.skin ? skinFixture(o) : sceneFixture({ ...o, attributes: o.normals }),
  );
  const thresholds = o.thresholds ?? (o.inbetween ? [50, 100] : [100]);
  const channels = o.channels ?? 1;
  const indices = o.indices ?? [1];
  const objects = [
    'Deformer: 300, "Deformer::Face", "BlendShape" { Version: 100 }',
  ];
  const connections = [' C: "OO",300,1'];
  for (let c = 0; c < channels; c++) {
    const id = 400 + c * 20;
    objects.push(`Deformer: ${id}, "SubDeformer::Smile${c}", "BlendShapeChannel" { Version: 100
DeformPercent: ${o.weight ?? 75}
FullWeights: *${thresholds.length} { a: ${thresholds.join(",")} }
}`);
    connections.push(` C: "OO",${id},300`);
    for (let t = 0; t < thresholds.length; t++) {
      const delta = o.delta ?? [0, (t + 1) * scale, 0];
      objects.push(`Geometry: ${id + t + 1}, "Geometry::Target${c}_${t}", "Shape" { Version: 100
Indexes: *${indices.length} { a: ${indices.join(",")} }
Vertices: *${delta.length} { a: ${delta.join(",")} }
${o.normals ? `Normals: *3 { a: 0,.25,0 }` : ""}
${o.offsetWeights ? "Weights: *1 { a: .5 }" : ""}
}`);
      connections.push(` C: "OO",${id + t + 1},${id}`);
    }
  }
  if (o.stacked) {
    objects.push(
      'Deformer: 900, "Deformer::Stack", "BlendShape" { Version: 100 }',
    );
    connections.push(' C: "OO",900,1', ' C: "OO",400,900');
  }
  text = text.replace(
    "\n}\nConnections:",
    `\n${objects.join("\n")}\n}\nConnections:`,
  );
  text = text.replace(
    "Connections: {",
    `Connections: {\n${connections.join("\n")}`,
  );
  return new TextEncoder().encode(text);
}
