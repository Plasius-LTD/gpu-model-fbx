// Self-authored synthetic fixtures; Apache-2.0. No third-party model assets.
import { deflateSync } from "node:zlib";
export const ascii = new TextEncoder().encode(`; FBX 7.4.0 project file
FBXHeaderExtension: {
 FBXHeaderVersion: 1003
 FBXVersion: 7400
}
GlobalSettings: {
 Version: 1000
 Properties70: {
  P: "UpAxis", "int", "Integer", "",1
  P: "UpAxisSign", "int", "Integer", "",1
  P: "FrontAxis", "int", "Integer", "",2
  P: "FrontAxisSign", "int", "Integer", "",-1
  P: "CoordAxis", "int", "Integer", "",0
  P: "CoordAxisSign", "int", "Integer", "",1
  P: "UnitScaleFactor", "double", "Number", "",100
 }
}
Objects: {
 Geometry: 1, "Geometry::Triangle", "Mesh" {
  Vertices: *9 { a: 0,0,0, 1,0,0, 0,1,0 }
  PolygonVertexIndex: *3 { a: 0,1,-3 }
 }
 Model: 2, "Model::Triangle", "Mesh" { Version: 232 }
}
Connections: {
 C: "OO",1,2
 C: "OO",2,0
}
`);
type Node = { name: string; props?: Buffer[]; children?: Node[] };
function scalar(type: string, value: number | string): Buffer {
  if (type === "S") {
    const text = Buffer.from(String(value));
    const out = Buffer.alloc(5 + text.length);
    out.write("S");
    out.writeUInt32LE(text.length, 1);
    text.copy(out, 5);
    return out;
  }
  const out = Buffer.alloc(type === "L" ? 9 : 5);
  out.write(type);
  if (type === "L") out.writeBigInt64LE(BigInt(value), 1);
  else out.writeUInt32LE(Number(value), 1);
  return out;
}
export function binary(
  options: {
    compressed?: boolean;
    skin?: boolean;
    morph?: boolean;
    declaredVertices?: number;
    expandedVertices?: boolean;
    quad?: boolean;
    material?: boolean;
    attributes?: boolean;
    lambert?: boolean;
  } = {},
): Uint8Array {
  function array(
    type: string,
    values: number[],
    declared?: number,
    expanded?: number,
  ): Buffer {
    let bytes = Buffer.alloc(
      (expanded ?? values.length) * (type === "d" ? 8 : 4),
    );
    values.forEach((v, i) =>
      type === "d"
        ? bytes.writeDoubleLE(v, i * 8)
        : bytes.writeInt32LE(v, i * 4),
    );
    if (options.compressed) bytes = deflateSync(bytes);
    const header = Buffer.alloc(13);
    header.write(type);
    header.writeUInt32LE(declared ?? expanded ?? values.length, 1);
    header.writeUInt32LE(options.compressed ? 1 : 0, 5);
    header.writeUInt32LE(bytes.length, 9);
    return Buffer.concat([header, bytes]);
  }
  const S = (v: string) => scalar("S", v),
    L = (v: number) => scalar("L", v),
    I = (v: number) => scalar("I", v);
  const properties = [
    ["UpAxis", 1],
    ["UpAxisSign", 1],
    ["FrontAxis", 2],
    ["FrontAxisSign", -1],
    ["CoordAxis", 0],
    ["CoordAxisSign", 1],
    ["UnitScaleFactor", 100],
  ].map(([key, value]) => {
    const double = Buffer.alloc(9);
    double.write("D");
    double.writeDoubleLE(Number(value), 1);
    const signed = Buffer.alloc(5);
    signed.write("I");
    signed.writeInt32LE(Number(value), 1);
    return {
      name: "P",
      props: [
        S(String(key)),
        S(key === "UnitScaleFactor" ? "double" : "int"),
        S(""),
        S(""),
        key === "UnitScaleFactor" ? double : signed,
      ],
    };
  });
  const nodes: Node[] = [
    {
      name: "FBXHeaderExtension",
      children: [
        { name: "FBXHeaderVersion", props: [I(1003)] },
        { name: "FBXVersion", props: [I(7400)] },
      ],
    },
    {
      name: "GlobalSettings",
      children: [
        { name: "Version", props: [I(1000)] },
        { name: "Properties70", children: properties },
      ],
    },
    {
      name: "Objects",
      children: [
        {
          name: "Geometry",
          props: [L(1), S("Triangle\0\x01Geometry"), S("Mesh")],
          children: [
            {
              name: "Vertices",
              props: [
                array(
                  "d",
                  [
                    0,
                    0,
                    0,
                    1,
                    0,
                    0,
                    0,
                    1,
                    0,
                    ...(options.quad ? [1, 1, 0] : []),
                  ],
                  options.declaredVertices,
                  options.expandedVertices ? 4_200_000 : undefined,
                ),
              ],
            },
            {
              name: "PolygonVertexIndex",
              props: [array("i", options.quad ? [0, 1, 3, -3] : [0, 1, -3])],
            },
            ...(options.attributes
              ? [
                  {
                    name: "LayerElementNormal",
                    props: [I(0)],
                    children: [
                      { name: "Version", props: [I(101)] },
                      {
                        name: "MappingInformationType",
                        props: [S("ByPolygonVertex")],
                      },
                      {
                        name: "ReferenceInformationType",
                        props: [S("Direct")],
                      },
                      {
                        name: "Normals",
                        props: [
                          array(
                            "d",
                            Array(options.quad ? 4 : 3)
                              .fill([0, 0, 1])
                              .flat(),
                          ),
                        ],
                      },
                    ],
                  },
                  {
                    name: "LayerElementUV",
                    props: [I(0)],
                    children: [
                      { name: "Version", props: [I(101)] },
                      {
                        name: "MappingInformationType",
                        props: [S("ByPolygonVertex")],
                      },
                      {
                        name: "ReferenceInformationType",
                        props: [S("IndexToDirect")],
                      },
                      {
                        name: "UV",
                        props: [array("d", [0, 0, 1, 0, 0, 1, 1, 1])],
                      },
                      {
                        name: "UVIndex",
                        props: [
                          array("i", options.quad ? [0, 1, 3, 2] : [0, 1, 2]),
                        ],
                      },
                    ],
                  },
                ]
              : []),
            ...(options.lambert
              ? [
                  {
                    name: "LayerElementMaterial",
                    props: [I(0)],
                    children: [
                      { name: "Version", props: [I(101)] },
                      { name: "MappingInformationType", props: [S("AllSame")] },
                      {
                        name: "ReferenceInformationType",
                        props: [S("IndexToDirect")],
                      },
                      { name: "Materials", props: [array("i", [0])] },
                    ],
                  },
                ]
              : []),
            ...(options.attributes || options.lambert
              ? [
                  {
                    name: "Layer",
                    props: [I(0)],
                    children: [
                      { name: "Version", props: [I(100)] },
                      ...(options.attributes
                        ? ["LayerElementNormal", "LayerElementUV"]
                        : []
                      )
                        .concat(options.lambert ? ["LayerElementMaterial"] : [])
                        .map((type) => ({
                          name: "LayerElement",
                          children: [
                            { name: "Type", props: [S(type)] },
                            { name: "TypedIndex", props: [I(0)] },
                          ],
                        })),
                    ],
                  },
                ]
              : []),
          ],
        },
        {
          name: "Model",
          props: [L(2), S("Triangle\0\x01Model"), S("Mesh")],
          children: [{ name: "Version", props: [I(232)] }],
        },
        ...(options.material
          ? [
              {
                name: "Material",
                props: [L(3), S("Material\0\x01Material"), S("")],
              },
            ]
          : []),
        ...(options.lambert
          ? [
              {
                name: "Material",
                props: [L(4), S("Red\0\x01Material"), S("")],
                children: [
                  { name: "Version", props: [I(102)] },
                  { name: "ShadingModel", props: [S("lambert")] },
                  {
                    name: "Properties70",
                    children: [
                      {
                        name: "P",
                        props: [
                          S("DiffuseColor"),
                          S("Color"),
                          S(""),
                          S("A"),
                          ...[0.8, 0.2, 0.1].map((value) => {
                            const out = Buffer.alloc(9);
                            out.write("D");
                            out.writeDoubleLE(value, 1);
                            return out;
                          }),
                        ],
                      },
                    ],
                  },
                ],
              },
            ]
          : []),
      ],
    },
    {
      name: "Connections",
      children: [
        { name: "C", props: [S("OO"), L(1), L(2)] },
        { name: "C", props: [S("OO"), L(2), L(0)] },
        ...(options.lambert
          ? [{ name: "C", props: [S("OO"), L(4), L(2)] }]
          : []),
      ],
    },
  ];
  if (options.skin) {
    const D = (v: number) => {
      const b = Buffer.alloc(9);
      b.write("D");
      b.writeDoubleLE(v, 1);
      return b;
    };
    const objects = nodes.find((n) => n.name === "Objects")!.children!,
      connections = nodes.find((n) => n.name === "Connections")!.children!;
    for (const [id, name, y] of [
      [10, "Root", 0],
      [11, "Tip", 1],
    ] as const)
      objects.push({
        name: "Model",
        props: [L(id), S(`${name}\0\x01Model`), S("LimbNode")],
        children: [
          { name: "Version", props: [I(232)] },
          {
            name: "Properties70",
            children: [
              {
                name: "P",
                props: [
                  S("Lcl Translation"),
                  S("Lcl Translation"),
                  S(""),
                  S("A"),
                  D(0),
                  D(y),
                  D(0),
                ],
              },
            ],
          },
        ],
      });
    objects.push({
      name: "Deformer",
      props: [L(20), S("Skin\0\x01Deformer"), S("Skin")],
      children: [
        { name: "Version", props: [I(101)] },
        { name: "SkinningType", props: [S("Linear")] },
      ],
    });
    for (const [id, name, weights, y] of [
      [21, "Root", [1, 0.5, 0], 0],
      [22, "Tip", [0, 0.5, 1], 1],
    ] as const)
      objects.push({
        name: "Deformer",
        props: [L(id), S(`${name}\0\x01SubDeformer`), S("Cluster")],
        children: [
          { name: "Version", props: [I(100)] },
          { name: "Indexes", props: [array("i", [0, 1, 2])] },
          { name: "Weights", props: [array("d", [...weights])] },
          {
            name: "Transform",
            props: [
              array("d", [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -y, 0, 1]),
            ],
          },
          {
            name: "TransformLink",
            props: [
              array("d", [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, y, 0, 1]),
            ],
          },
        ],
      });
    for (const [a, b] of [
      [10, 0],
      [11, 10],
      [20, 1],
      [21, 20],
      [22, 20],
      [10, 21],
      [11, 22],
    ])
      connections.push({ name: "C", props: [S("OO"), L(a!), L(b!)] });
  }
  if (options.morph) {
    const D = (v: number) => {
      const b = Buffer.alloc(9);
      b.write("D");
      b.writeDoubleLE(v, 1);
      return b;
    };
    const objects = nodes.find((n) => n.name === "Objects")!.children!,
      connections = nodes.find((n) => n.name === "Connections")!.children!;
    objects.push(
      {
        name: "Deformer",
        props: [L(300), S("Face\0\x01Deformer"), S("BlendShape")],
        children: [{ name: "Version", props: [I(100)] }],
      },
      {
        name: "Deformer",
        props: [L(400), S("Smile0\0\x01SubDeformer"), S("BlendShapeChannel")],
        children: [
          { name: "Version", props: [I(100)] },
          { name: "DeformPercent", props: [D(75)] },
          { name: "FullWeights", props: [array("d", [100])] },
        ],
      },
      {
        name: "Geometry",
        props: [L(401), S("Target0_0\0\x01Geometry"), S("Shape")],
        children: [
          { name: "Version", props: [I(100)] },
          { name: "Indexes", props: [array("i", [1])] },
          { name: "Vertices", props: [array("d", [0, 1, 0])] },
        ],
      },
    );
    for (const [a, b] of [
      [300, 1],
      [400, 300],
      [401, 400],
    ])
      connections.push({ name: "C", props: [S("OO"), L(a!), L(b!)] });
  }
  function encode(node: Node, offset: number): Buffer {
    const name = Buffer.from(node.name);
    const props = Buffer.concat(node.props ?? []);
    const children: Buffer[] = [];
    let cursor = offset + 13 + name.length + props.length;
    for (const child of node.children ?? []) {
      const bytes = encode(child, cursor);
      children.push(bytes);
      cursor += bytes.length;
    }
    if (node.children?.length) {
      children.push(Buffer.alloc(13));
      cursor += 13;
    }
    const header = Buffer.alloc(13);
    header.writeUInt32LE(cursor);
    header.writeUInt32LE(node.props?.length ?? 0, 4);
    header.writeUInt32LE(props.length, 8);
    header.writeUInt8(name.length, 12);
    return Buffer.concat([header, name, props, ...children]);
  }
  const header = Buffer.alloc(27);
  header.write("Kaydara FBX Binary  \0\x1a\0", "binary");
  header.writeUInt32LE(7400, 23);
  const parts = [header];
  let cursor = 27;
  for (const node of nodes) {
    const bytes = encode(node, cursor);
    parts.push(bytes);
    cursor += bytes.length;
  }
  return new Uint8Array(Buffer.concat([...parts, Buffer.alloc(13)]));
}
