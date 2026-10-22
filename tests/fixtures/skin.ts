// Self-authored Plasius Apache-2.0 synthetic skin fixtures. No external assets.
import { ascii } from "./fbx.js";
export interface SkinOptions {
  method?: string;
  weights?: number[];
  indices?: number[];
  multiple?: boolean;
  centimetres?: boolean;
  zUp?: boolean;
  geometric?: boolean;
  linkOffset?: number;
  bindPose?: boolean;
  mode?: string;
  influences?: number;
  stacked?: boolean;
  jointShear?: boolean;
}
export function skinFixture(o: SkinOptions = {}): Uint8Array {
  const s = o.centimetres ? 100 : 1;
  const matrix = (x = 0, y = 0) =>
    `1,0,0,0,0,1,0,0,0,0,1,0,${x * s},${y * s},0,1`;
  const model = (
    id: number,
    name: string,
    y: number,
  ) => `Model: ${id}, "Model::${name}", "LimbNode" { Version: 232
Properties70: { P: "Lcl Translation", "Lcl Translation", "", "A",0,${y * s},0 }
}`;
  const skin = (
    id: number,
    mesh: number,
    offset = 0,
  ) => `Deformer: ${id}, "Deformer::Skin${id}", "Skin" { Version: 101
SkinningType: "${o.method ?? "Linear"}"
}
Deformer: ${id + 1}, "SubDeformer::Root", "Cluster" { Version: 100
Indexes: *3 { a: ${(o.indices ?? [0, 1, 2]).join(",")} }
Weights: *3 { a: ${(o.weights ?? [1, 0.5, 0]).join(",")} }
Transform: *16 { a: ${matrix(offset, 0)} }
TransformLink: *16 { a: ${matrix(0, 0)} }
}
Deformer: ${id + 2}, "SubDeformer::Tip", "Cluster" { Version: 100
Indexes: *3 { a: 0,1,2 }
Weights: *3 { a: 0,.5,1 }
Transform: *16 { a: ${matrix(offset, -(o.linkOffset ?? 1))} }
TransformLink: *16 { a: ${matrix(0, o.linkOffset ?? 1)} }
}`;
  let text = new TextDecoder().decode(ascii);
  text = text.replace("100\n", `${o.centimetres ? 1 : 100}\n`);
  text = text.replace("0,0,0, 1,0,0, 0,1,0", `0,0,0, ${s},0,0, 0,${s},0`);
  if (o.zUp)
    text = text
      .replace('"",1\n  P: "UpAxisSign"', '"",2\n  P: "UpAxisSign"')
      .replace('"",2\n  P: "FrontAxisSign"', '"",1\n  P: "FrontAxisSign"');
  if (o.geometric)
    text = text.replace(
      '"Mesh" { Version: 232 }',
      `"Mesh" { Version: 232\nProperties70: { P: "GeometricTranslation", "Vector3D", "", "A",${s},0,0 }\n}`,
    );
  const extra = `${model(10, "Root", 0)}\n${model(11, "Tip", 1)}\n${skin(20, 1)}\n${o.multiple ? `Geometry: 30, "Geometry::Second", "Mesh" { Vertices: *9 { a: 0,0,0,${s},0,0,0,${s},0 }\nPolygonVertexIndex: *3 { a: 0,1,-3 }\n}\nModel: 31, "Model::Second", "Mesh" { Version: 232\nProperties70: { P: "Lcl Translation", "Lcl Translation", "", "A",${2 * s},0,0 }\n}\n${skin(40, 30, 2)}` : ""}`;
  text = text.replace("\n}\nConnections:", `\n${extra}\n}\nConnections:`);
  text = text.replace(
    ' C: "OO",1,2',
    ` C: "OO",10,0\n C: "OO",11,10\n C: "OO",20,1\n C: "OO",21,20\n C: "OO",22,20\n C: "OO",10,21\n C: "OO",11,22\n${o.multiple ? ' C: "OO",30,31\n C: "OO",31,0\n C: "OO",40,30\n C: "OO",41,40\n C: "OO",42,40\n C: "OO",10,41\n C: "OO",11,42' : ""}\n C: "OO",1,2`,
  );
  if (o.mode)
    text = text.replace(
      '"Cluster" { Version: 100',
      `"Cluster" { Version: 100\nMode: "${o.mode}"`,
    );
  if (o.bindPose) {
    const pose = `Pose: 70, "Pose::Bind", "BindPose" { Type: "BindPose"\nVersion: 100\nNbPoseNodes: 3\n${[2, 10, 11].map((id) => `PoseNode: { Node: ${id}\nMatrix: *16 { a: ${matrix(0, id === 11 ? 1 : 0)} }\n}`).join("\n")}\n}`;
    text = text.replace("\n}\nConnections:", `\n${pose}\n}\nConnections:`);
  }
  if (o.stacked) {
    text = text.replace(
      "\n}\nConnections:",
      `\nDeformer: 60, "Deformer::Stack", "Skin" { Version: 101\nSkinningType: "Linear"\n}\n}\nConnections:`,
    );
    text = text.replace(
      "Connections: {",
      `Connections: {\n C: "OO",60,1\n C: "OO",21,60\n C: "OO",22,60`,
    );
  }
  if (o.influences) {
    const weight = Array(3)
      .fill(1 / o.influences)
      .join(",");
    text = text
      .replace("a: 1,0.5,0", `a: ${weight}`)
      .replace("a: 0,.5,1", `a: ${weight}`);
    const extraBones = Array.from(
      { length: o.influences - 2 },
      (_, i) =>
        `${model(100 + i, `Extra${i}`, 0)}\nDeformer: ${200 + i}, "SubDeformer::Extra${i}", "Cluster" { Version: 100\nIndexes: *3 { a: 0,1,2 }\nWeights: *3 { a: ${weight} }\nTransform: *16 { a: ${matrix()} }\nTransformLink: *16 { a: ${matrix()} }\n}`,
    ).join("\n");
    text = text.replace(
      "\n}\nConnections:",
      `\n${extraBones}\n}\nConnections:`,
    );
    text = text.replace(
      "Connections: {",
      `Connections: {\n${Array.from({ length: o.influences - 2 }, (_, i) => ` C: "OO",${100 + i},10\n C: "OO",${100 + i},${200 + i}\n C: "OO",${200 + i},20`).join("\n")}`,
    );
  }
  if (o.jointShear)
    text = text
      .replace(
        '"A",0,0,0 }',
        '"A",0,0,0\nP: "Lcl Scaling", "Lcl Scaling", "", "A",2,1,1 }',
      )
      .replace(
        '"A",0,1,0 }',
        '"A",0,1,0\nP: "Lcl Rotation", "Lcl Rotation", "", "A",0,0,45\nP: "InheritType", "enum", "", "",0 }',
      );
  return new TextEncoder().encode(text);
}
