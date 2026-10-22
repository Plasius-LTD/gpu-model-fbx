// Self-authored synthetic scenes, Apache-2.0; no external model/texture assets.
export interface SceneOptions {
  centimetres?: boolean;
  leftHanded?: boolean;
  zUp?: boolean;
  quad?: boolean;
  attributes?: boolean;
  materials?: boolean;
  phong?: boolean;
  hierarchy?: boolean;
  inherit?: number;
  parentScale?: readonly number[];
  rotation?: number;
  pivot?: number;
  geometric?: boolean;
  negative?: boolean;
  instances?: boolean;
  twoFaces?: boolean;
  tilted?: boolean;
  scalingPivot?: number;
  preRotation?: number;
  postRotation?: number;
  parentGeometric?: boolean;
  opacity?: boolean;
}
export function sceneFixture(o: SceneOptions = {}): Uint8Array {
  const scale = o.centimetres ? 100 : 1;
  const p = (name: string, values: readonly number[], type = "Vector3D") =>
    `P: "${name}", "${type}", "", "A",${values.join(",")}`;
  const properties = (rows: string[]) =>
    `Properties70: {\n${rows.join("\n")}\n}`;
  const model = (id: number, name: string, rows: string[]) =>
    `Model: ${id}, "Model::${name}", "${name === "Parent" ? "Null" : "Mesh"}" { Version: 232\n${properties(rows)}\n}`;
  const coords =
    o.quad || o.twoFaces
      ? [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]
      : [0, 0, 0, 1, 0, o.tilted ? 1 : 0, 0, 1, 0];
  const count = o.twoFaces ? 6 : o.quad ? 4 : 3;
  const material = (
    id: number,
    name: string,
    colour: number[],
  ) => `Material: ${id}, "Material::${name}", "" {
 Version: 102
 ShadingModel: "${o.phong ? "phong" : "lambert"}"
 ${properties([
   p("DiffuseColor", colour, "Color"),
   p("DiffuseFactor", [1], "Number"),
   ...(o.opacity
     ? [
         p("TransparencyFactor", [0.5], "Number"),
         p("TransparentColor", [1, 1, 1], "Color"),
         p("EmissiveColor", [0.1, 0.2, 0.3], "Color"),
         p("EmissiveFactor", [2], "Number"),
       ]
     : []),
   ...(o.phong
     ? [
         p("SpecularColor", [0.8, 0.7, 0.6], "Color"),
         p("Shininess", [20], "Number"),
       ]
     : []),
 ])}
}`;
  return new TextEncoder().encode(`; FBX 7.4.0 project file
FBXHeaderExtension: { FBXHeaderVersion: 1003
FBXVersion: 7400
}
GlobalSettings: { Version: 1000
 ${properties([p("UpAxis", [o.zUp ? 2 : 1], "int"), p("UpAxisSign", [1], "int"), p("FrontAxis", [o.zUp ? 1 : 2], "int"), p("FrontAxisSign", [(o.zUp ? -1 : 1) * (o.leftHanded ? -1 : 1)], "int"), p("CoordAxis", [0], "int"), p("CoordAxisSign", [1], "int"), p("UnitScaleFactor", [o.centimetres ? 1 : 100], "double")])}
}
Objects: {
 Geometry: 1, "Geometry::Surface", "Mesh" {
  Vertices: *${coords.length} { a: ${coords.map((v) => v * scale).join(",")} }
  PolygonVertexIndex: *${count} { a: ${o.twoFaces ? "0,1,-3,0,2,-4" : o.quad ? "0,1,2,-4" : "0,1,-3"} }
  ${
    o.attributes
      ? `LayerElementNormal: 0 { Version: 101
   Name: "Normals"
   MappingInformationType: "ByPolygonVertex"
   ReferenceInformationType: "Direct"
   Normals: *${count * 3} { a: ${Array(count)
     .fill(o.tilted ? "-0.7071067811865475,0,0.7071067811865475" : "0,0,1")
     .join(",")} }
  }
  LayerElementUV: 0 { Version: 101
   Name: "UV0"
   MappingInformationType: "ByPolygonVertex"
   ReferenceInformationType: "IndexToDirect"
   UV: *8 { a: 0,0,1,0,1,1,0,1 }
   UVIndex: *${count} { a: ${o.twoFaces ? "0,1,2,1,2,3" : o.quad ? "0,1,2,3" : "0,1,3"} }
  }`
      : ""
  }
  ${
    o.materials
      ? `LayerElementMaterial: 0 { Version: 101
   Name: ""
   MappingInformationType: "${o.twoFaces ? "ByPolygon" : "AllSame"}"
   ReferenceInformationType: "IndexToDirect"
   Materials: *${o.twoFaces ? 2 : 1} { a: ${o.twoFaces ? "0,1" : "0"} }
  }`
      : ""
  }
  Layer: 0 { Version: 100
   ${o.attributes ? 'LayerElement: { Type: "LayerElementNormal"\n TypedIndex: 0\n}\nLayerElement: { Type: "LayerElementUV"\n TypedIndex: 0\n}' : ""}
   ${o.materials ? 'LayerElement: { Type: "LayerElementMaterial"\n TypedIndex: 0\n}' : ""}
  }
 }
 ${model(2, "Surface", [p("Lcl Translation", [0, 0, 0], "Lcl Translation"), p("Lcl Rotation", [0, 0, o.rotation ?? 0], "Lcl Rotation"), p("Lcl Scaling", [o.negative ? -2 : 1, 1, 1], "Lcl Scaling"), p("InheritType", [o.inherit ?? 1], "enum"), ...(o.pivot === undefined ? [] : [p("RotationPivot", [o.pivot * scale, 0, 0])]), ...(o.scalingPivot === undefined ? [] : [p("ScalingPivot", [o.scalingPivot * scale, 0, 0])]), ...(o.preRotation === undefined ? [] : [p("PreRotation", [0, 0, o.preRotation]), p("RotationActive", [1], "bool")]), ...(o.postRotation === undefined ? [] : [p("PostRotation", [0, 0, o.postRotation])]), ...(o.geometric ? [p("GeometricTranslation", [scale, 0, 0]), p("GeometricScaling", [2, 3, 1])] : [])])}
 ${o.hierarchy ? model(3, "Parent", [p("Lcl Translation", [2 * scale, 3 * scale, 0], "Lcl Translation"), p("Lcl Scaling", o.parentScale ?? [2, 3, 4], "Lcl Scaling"), ...(o.parentGeometric ? [p("GeometricTranslation", [50 * scale, 0, 0])] : [])]) : ""}
 ${o.instances ? model(4, "Copy", [p("Lcl Translation", [4 * scale, 0, 0], "Lcl Translation")]) : ""}
 ${o.materials ? material(5, "Red", [0.8, 0.2, 0.1]) : ""}
 ${o.materials && o.twoFaces ? material(6, "Blue", [0.1, 0.2, 0.8]) : ""}
}
Connections: {
 C: "OO",1,2
 C: "OO",2,${o.hierarchy ? 3 : 0}
 ${o.hierarchy ? 'C: "OO",3,0' : ""}
 ${o.instances ? 'C: "OO",1,4\n C: "OO",4,0' : ""}
 ${o.materials ? 'C: "OO",5,2' : ""}
 ${o.materials && o.twoFaces ? 'C: "OO",6,2' : ""}
}
`);
}
