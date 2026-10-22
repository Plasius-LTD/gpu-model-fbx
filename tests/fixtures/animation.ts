// Self-authored Plasius Apache-2.0 fixtures. No DCC/example-model assets.
import { morphFixture, type MorphOptions } from "./morph.js";
import { skinFixture } from "./skin.js";
import { sceneFixture } from "./scene.js";
export interface AnimationOptions extends MorphOptions {
  takes?: number;
  extraNodes?: number;
  empty?: boolean;
  layers?: number;
  start?: number;
  duration?: number;
  rate?: number;
  interpolation?: number;
  property?: string;
  rotationCurve?: boolean;
  morph?: boolean;
  keyCount?: number;
  layerWeight?: number;
  muted?: boolean;
  constraint?: boolean;
  animatedWeight?: boolean;
  curveEnd?: number;
}
export function animationFixture(o: AnimationOptions = {}): Uint8Array {
  const start = o.start ?? -1,
    end = start + (o.duration ?? 1);
  const ticks = (t: number) => Math.round(t * 46186158000);
  const objects: string[] = [],
    connections: string[] = [];
  let text = new TextDecoder().decode(
    o.morph ? morphFixture(o) : o.skin ? skinFixture(o) : sceneFixture(o),
  );
  if (o.constraint)
    objects.push(
      `Constraint: 60000, "Constraint::Guard", "Position" { Type: "Position From Positions" }`,
    );
  for (let i = 0; i < (o.extraNodes ?? 0); i++) {
    objects.push(
      `Model: ${50000 + i}, "Model::Extra${i}", "Null" { Version: 232 }`,
    );
    connections.push(`C: "OO",${50000 + i},0`);
  }
  text = text
    .replace(
      "GlobalSettings: { Version: 1000",
      `GlobalSettings: { Version: 1000`,
    )
    .replace(
      'P: "UpAxis",',
      `P: "TimeMode", "enum", "", "",14\nP: "CustomFrameRate", "double", "", "",${o.rate ?? 24}\nP: "UpAxis",`,
    );
  for (let t = 0; t < (o.takes ?? 1); t++) {
    const stack = 10000 + t * 1000;
    objects.push(`AnimationStack: ${stack}, "AnimStack::Take${t}", "" { Properties70: {
P: "LocalStart", "KTime", "", "",${ticks(start)}
P: "LocalStop", "KTime", "", "",${ticks(end)}
P: "ReferenceStart", "KTime", "", "",${ticks(start + 3)}
P: "ReferenceStop", "KTime", "", "",${ticks(end + 3)}
} }`);
    for (let l = 0; l < (o.layers ?? 1); l++) {
      const layer = stack + 1 + l * 100;
      objects.push(`AnimationLayer: ${layer}, "AnimLayer::Layer${l}", "" { Properties70: {
P: "Weight", "Number", "", "A",${o.layerWeight ?? 100}
P: "Mute", "bool", "", "",${o.muted ? 1 : 0}
P: "BlendMode", "enum", "", "",${l ? 0 : 1}
} }`);
      connections.push(`C: "OO",${layer},${stack}`);
      if (o.empty) continue;
      const properties = [
        {
          target: o.animatedWeight ? layer : o.skin ? 11 : 2,
          property: o.animatedWeight
            ? "Weight"
            : (o.property ??
              (o.rotationCurve ? "Lcl Rotation" : "Lcl Translation")),
          axis: o.rotationCurve ? "Z" : "Y",
          end: o.rotationCurve ? 90 : 2 * (o.centimetres ? 100 : 1),
          initial: o.skin ? (o.centimetres ? 100 : 1) : 0,
        },
        ...(o.morph
          ? [
              {
                target: 400,
                property: "DeformPercent",
                axis: "X",
                end: 100,
                initial: 0,
              },
            ]
          : []),
      ];
      properties.forEach((p, i) => {
        const value = layer + 1 + i * 10,
          curve = value + 1;
        const count = o.keyCount ?? 2;
        objects.push(`AnimationCurveNode: ${value}, "AnimCurveNode::Value${l}_${i}", "" { Properties70: {
P: "d|X", "Number", "", "A",0
P: "d|Y", "Number", "", "A",${p.axis === "Y" ? p.initial : 0}
P: "d|Z", "Number", "", "A",0
} }
AnimationCurve: ${curve}, "AnimCurve::Curve${l}_${i}", "" {
Default: 0
KeyVer: 4008
KeyTime: *${count} { a: ${Array.from({ length: count }, (_, k) => ticks(start + ((end - start) * k) / Math.max(1, count - 1))).join(",")} }
KeyValueFloat: *${count} { a: ${Array.from({ length: count }, (_, k) => p.initial + ((o.curveEnd ?? p.end) * k) / Math.max(1, count - 1)).join(",")} }
KeyAttrFlags: *1 { a: ${o.interpolation ?? 4} }
KeyAttrDataFloat: *4 { a: 0,0,0,0 }
KeyAttrRefCount: *1 { a: ${count} }
}`);
        connections.push(
          `C: "OO",${value},${layer}`,
          `C: "OP",${value},${p.target},"${p.property}"`,
          `C: "OP",${curve},${value},"d|${p.axis}"`,
        );
      });
    }
  }
  text = text
    .replace("\n}\nConnections:", `\n${objects.join("\n")}\n}\nConnections:`)
    .replace("Connections: {", `Connections: {\n${connections.join("\n")}`);
  return new TextEncoder().encode(text);
}
