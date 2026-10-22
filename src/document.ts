import type {
  GpuModelDocument,
  GpuModelMetadata,
  GpuModelResource,
  GpuModelConversionIssue,
} from "@plasius/gpu-model-core";
import {
  FbxImportError,
  FBX_IMPORT_PROFILE,
  type ParsedFbx,
} from "./policy.js";
import { loadCore, loadRuntime } from "./modules.js";

const transformProperties = [
  "LclTranslation",
  "LclRotation",
  "LclScaling",
  "PreRotation",
  "PostRotation",
  "RotationOffset",
  "RotationPivot",
  "ScalingOffset",
  "ScalingPivot",
  "GeometricTranslation",
  "GeometricRotation",
  "GeometricScaling",
];
const materialProperties = [
  "diffuseFactor",
  "diffuseColor",
  "specularFactor",
  "specularColor",
  "specularExponent",
  "reflectionFactor",
  "reflectionColor",
  "transparencyFactor",
  "transparencyColor",
  "emissionFactor",
  "emissionColor",
  "ambientFactor",
  "ambientColor",
  "normalMap",
  "bump",
  "bumpFactor",
  "displacementFactor",
  "displacement",
  "vectorDisplacementFactor",
  "vectorDisplacement",
];
const invalid = (): never => {
  throw new FbxImportError("worker-failed");
};
const integer = (value: number, min: number, max: number) =>
  Number.isInteger(value) && value >= min && value <= max;
const names = (value: readonly string[], count: number) =>
  Array.isArray(value) &&
  value.length === count &&
  value.every(
    (name) =>
      typeof name === "string" &&
      name.length <= 512 &&
      ![...name].some((character) => {
        const point = character.codePointAt(0)!;
        return (
          point < 0x20 ||
          (point >= 0x7f && point <= 0x9f) ||
          (point >= 0x2028 && point <= 0x202e) ||
          (point >= 0x2066 && point <= 0x2069) ||
          (point >= 0xd800 && point <= 0xdfff)
        );
      }),
  );
function matrix(row: Float64Array, offset: number): number[] {
  return [
    row[offset]!,
    row[offset + 1]!,
    row[offset + 2]!,
    0,
    row[offset + 3]!,
    row[offset + 4]!,
    row[offset + 5]!,
    0,
    row[offset + 6]!,
    row[offset + 7]!,
    row[offset + 8]!,
    0,
    row[offset + 9]!,
    row[offset + 10]!,
    row[offset + 11]!,
    1,
  ];
}
function multiply(a: readonly number[], b: readonly number[]): number[] {
  return Array.from({ length: 16 }, (_, i) => {
    let sum = 0;
    for (let k = 0; k < 4; k++)
      sum += a[k * 4 + (i % 4)]! * b[Math.floor(i / 4) * 4 + k]!;
    return sum;
  });
}
/** Revalidates every untrusted worker table before privately verifying canonical resources. */
export async function toDocument(
  value: ParsedFbx,
  sourceHash: string,
  signal: AbortSignal,
  allowMaterialLoss = false,
): Promise<GpuModelDocument> {
  if (
    !value ||
    Object.keys(value).sort().join() !==
      "ascii,axes,materialNames,materialShaders,materialTable,meshNames,nodeNames,nodeTable,normals,positions,primitiveTable,protocol,unitMetres,uvs,version" ||
    value.protocol !== 2 ||
    !(value.positions instanceof Float32Array) ||
    value.positions.length < 9 ||
    value.positions.length > 90000 ||
    value.positions.length % 9 ||
    !(value.normals instanceof Float32Array) ||
    value.normals.length !== value.positions.length ||
    !(value.uvs instanceof Float32Array) ||
    value.uvs.length !== (value.positions.length / 3) * 2 ||
    !(value.nodeTable instanceof Float64Array) ||
    !integer(value.nodeTable.length / 67, 1, 64) ||
    !(value.primitiveTable instanceof Float64Array) ||
    !integer(value.primitiveTable.length / 6, 1, 128) ||
    !(value.materialTable instanceof Float64Array) ||
    !integer(value.materialTable.length / 126, 0, 32) ||
    typeof value.ascii !== "boolean" ||
    value.version !== 7400 ||
    !Number.isFinite(value.unitMetres) ||
    value.unitMetres <= 0 ||
    !Array.isArray(value.axes) ||
    value.axes.length !== 3 ||
    value.axes.some((n) => !integer(n, 0, 5)) ||
    new Set(value.axes.map((n) => Math.floor(n / 2))).size !== 3 ||
    !names(value.nodeNames, value.nodeTable.length / 67) ||
    !names(value.meshNames, value.nodeTable.length / 67) ||
    !names(value.materialShaders, value.materialTable.length / 126) ||
    !names(value.materialNames, value.materialTable.length / 126) ||
    !/^[a-f0-9]{64}$/u.test(sourceHash)
  )
    invalid();
  const arrays = [
    value.positions,
    value.normals,
    value.uvs,
    value.nodeTable,
    value.primitiveTable,
    value.materialTable,
  ];
  if (arrays.some((array) => !(array.buffer instanceof ArrayBuffer))) invalid();
  // Take ownership synchronously. Neither a hostile producer nor a shared heap
  // may change already-admitted values while core/resource verification yields.
  value = {
    ...value,
    positions: value.positions.slice(),
    normals: value.normals.slice(),
    uvs: value.uvs.slice(),
    nodeTable: value.nodeTable.slice(),
    primitiveTable: value.primitiveTable.slice(),
    materialTable: value.materialTable.slice(),
    nodeNames: [...value.nodeNames],
    meshNames: [...value.meshNames],
    materialNames: [...value.materialNames],
    materialShaders: [...value.materialShaders],
    axes: [...value.axes],
  };
  for (const array of [
    value.positions,
    value.normals,
    value.uvs,
    value.nodeTable,
    value.primitiveTable,
    value.materialTable,
  ])
    for (const number of array)
      if (!Number.isFinite(number) || Math.abs(number) > 100000000) invalid();
  if (signal.aborted) throw new FbxImportError("aborted");
  const core = await loadCore();
  const { sha256Hex } = await loadRuntime();
  const nodeCount = value.nodeNames.length,
    materialCount = value.materialNames.length,
    primitiveCount = value.primitiveTable.length / 6;
  const nodeRows = Array.from({ length: nodeCount }, (_, i) =>
    value.nodeTable.subarray(i * 67, (i + 1) * 67),
  );
  const primitiveRows = Array.from({ length: primitiveCount }, (_, i) =>
    value.primitiveTable.subarray(i * 6, (i + 1) * 6),
  );
  const local = nodeRows.map((row) => matrix(row, 3));
  const worlds: number[][] = [];
  const visiting = new Set<number>();
  function world(i: number): number[] {
    if (worlds[i]) return worlds[i]!;
    if (visiting.has(i)) invalid();
    visiting.add(i);
    const parent = nodeRows[i]![0]!;
    if (!integer(parent, -1, nodeCount - 1) || parent === i) invalid();
    const result =
      parent === -1 ? local[i]! : multiply(world(parent), local[i]!);
    visiting.delete(i);
    worlds[i] = result;
    return result;
  }
  nodeRows.forEach((row, i) => {
    if (
      !integer(row[1]!, 0, primitiveCount) ||
      !integer(row[2]!, 0, primitiveCount) ||
      row[1]! + row[2]! > primitiveCount ||
      !integer(row[63]!, 0, 2) ||
      !integer(row[64]!, 0, 6) ||
      !integer(row[65]!, 0, 2) ||
      !integer(row[66]!, -1, 63)
    )
      invalid();
    world(i);
  });
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  let cursor = 0;
  for (const [index, row] of primitiveRows.entries()) {
    const [node, first, count, material, normal, uv] = row;
    if (
      !integer(node!, 0, nodeCount - 1) ||
      first !== cursor ||
      !integer(count!, 3, 30000) ||
      count! % 3 ||
      first! + count! > value.positions.length / 3 ||
      !integer(material!, -1, materialCount - 1) ||
      !integer(normal!, 0, 1) ||
      !integer(uv!, 0, 1)
    )
      invalid();
    const owner = nodeRows[node!]!;
    if (index < owner[1]! || index >= owner[1]! + owner[2]! || owner[66] === -1)
      invalid();
    const m = worlds[node!]!;
    for (let vertex = first!; vertex < first! + count!; vertex++) {
      const p = value.positions.subarray(vertex * 3, vertex * 3 + 3);
      for (let k = 0; k < 3; k++) {
        const w =
          m[k]! * p[0]! + m[4 + k]! * p[1]! + m[8 + k]! * p[2]! + m[12 + k]!;
        if (
          !Number.isFinite(w) ||
          Math.abs(w) > 1000000 ||
          Math.abs(p[k]!) > 1000000
        )
          invalid();
        min[k] = Math.min(min[k]!, w);
        max[k] = Math.max(max[k]!, w);
      }
      if (
        normal === 1 &&
        Math.abs(
          Math.hypot(...value.normals.subarray(vertex * 3, vertex * 3 + 3)) - 1,
        ) > 1e-5
      )
        invalid();
      if (
        uv === 1 &&
        (Math.abs(value.uvs[vertex * 2]!) > 1000000 ||
          Math.abs(value.uvs[vertex * 2 + 1]!) > 1000000)
      )
        invalid();
    }
    cursor += count!;
  }
  if (cursor !== value.positions.length / 3) invalid();
  nodeRows.forEach((row, i) => {
    if (primitiveRows.filter((p) => p[0] === i).length !== row[2]) invalid();
  });
  const offset = [(min[0]! + max[0]!) / 2, min[1]!, (min[2]! + max[2]!) / 2];
  const issues: GpuModelConversionIssue[] = [];
  const materials = Array.from({ length: materialCount }, (_, i) => {
    const row = value.materialTable.subarray(i * 126, (i + 1) * 126);
    const sourceMaps: Record<
      string,
      { present: boolean; components: number; value: number[] }
    > = Object.create(null);
    for (let j = 0; j < 20; j++) {
      const present = row[6 + j * 6]!,
        components = row[7 + j * 6]!;
      if (!integer(present, 0, 1) || !integer(components, 0, 4)) invalid();
      sourceMaps[materialProperties[j]!] = {
        present: present === 1,
        components,
        value: [...row.subarray(8 + j * 6, 12 + j * 6)],
      };
    }
    if (!integer(row[0]!, 0, 64)) invalid();
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    const transparency = [
      row[6 + 8 * 6 + 2]!,
      row[6 + 8 * 6 + 3]!,
      row[6 + 8 * 6 + 4]!,
    ];
    const opacity =
      row[0] === 1 || row[0] === 2
        ? 1 -
          (row[6 + 7 * 6 + 2]! *
            (transparency[0]! + transparency[1]! + transparency[2]!)) /
            3
        : row[5]!;
    const colouredTransparency =
      transparency[0] !== transparency[1] ||
      transparency[1] !== transparency[2];
    const colour = [
      row[2]! * row[1]!,
      row[3]! * row[1]!,
      row[4]! * row[1]!,
      opacity,
    ];
    // Lambert diffuse/emission has a named custom workflow. Phong/other shader
    // lobes are retained as source values but require explicit approximation consent.
    const extra = Object.entries(sourceMaps).some(
      ([key, map]) =>
        ![
          "diffuseFactor",
          "diffuseColor",
          "emissionFactor",
          "emissionColor",
          "transparencyFactor",
          "transparencyColor",
        ].includes(key) &&
        map.present &&
        map.value.some((v) => v !== 0),
    );
    const emissionFactor = row[6 + 9 * 6 + 2]!;
    const emission = [0, 1, 2].map(
      (k) => row[6 + 10 * 6 + 2 + k]! * emissionFactor,
    );
    if (
      row[0] !== 1 ||
      extra ||
      colouredTransparency ||
      emission.some((n) => n < 0) ||
      colour.some((n) => n !== clamp(n))
    )
      issues.push({
        kind: "loss",
        code: "fbx-material-shading-approximation",
        path: `/materials/${i}`,
        message:
          "Source shader semantics require a diffuse preview approximation; bounded source values are retained.",
        effect: "approximated",
      });
    return {
      id: `material-${i}`,
      ...(value.materialNames[i] ? { name: value.materialNames[i] } : {}),
      workflow: "custom",
      alphaMode: colour[3]! < 1 ? "blend" : "opaque",
      baseColorFactor: colour.map(clamp),
      emissiveFactor: emission.map((n) => Math.max(0, n)),
      textures: {},
      extensions: { fbxShaderType: row[0]!, fbxDiffuseWorkflow: "lambert" },
      sourceMetadata: {
        format: "fbx",
        shadingModel: value.materialShaders[i]!,
        shaderType: row[0]!,
        maps: sourceMaps,
      },
    };
  });
  const report = core.evaluateGpuModelDiagnostics({
    standard: "fbx",
    mode: "strict",
    allowLoss: allowMaterialLoss,
    issues,
  });
  if (!report.accepted) throw new FbxImportError("unsupported-profile", report);
  const resources: GpuModelResource[] = [];
  const resourcesToVerify = [
    { id: "positions", data: value.positions },
    { id: "normals", data: value.normals },
    { id: "uvs", data: value.uvs },
  ].filter(
    (_, i) =>
      i === 0 || primitiveRows.some((row) => row[i === 1 ? 4 : 5] === 1),
  );
  for (const { id, data } of resourcesToVerify) {
    if (signal.aborted) throw new FbxImportError("aborted");
    const bytes = data.slice();
    resources.push({
      id,
      kind: "buffer",
      contentHash: await sha256Hex(new Uint8Array(bytes.buffer)),
      byteLength: bytes.byteLength,
      mimeType: "application/octet-stream",
      payload: new Blob([bytes.buffer], { type: "application/octet-stream" }),
    });
  }
  const accessors = primitiveRows.flatMap((row, index) =>
    resourcesToVerify
      .filter(
        (a) => a.id === "positions" || row[a.id === "normals" ? 4 : 5] === 1,
      )
      .map(({ id }) => {
        const width = id === "uvs" ? 2 : 3;
        const bounds =
          id === "positions"
            ? {
                min: [Infinity, Infinity, Infinity],
                max: [-Infinity, -Infinity, -Infinity],
              }
            : undefined;
        if (bounds)
          for (let vertex = row[1]!; vertex < row[1]! + row[2]!; vertex++)
            for (let k = 0; k < 3; k++) {
              const number = value.positions[vertex * 3 + k]!;
              bounds.min[k] = Math.min(bounds.min[k]!, number);
              bounds.max[k] = Math.max(bounds.max[k]!, number);
            }
        return {
          id: `${id}-${index}`,
          resourceId: id,
          byteOffset: row[1]! * width * 4,
          count: row[2]!,
          componentType: "f32",
          elementType: width === 2 ? "vec2" : "vec3",
          ...bounds,
        };
      }),
  );
  const nodes = nodeRows.map((row, i) => {
    const localMatrix = [...local[i]!];
    if (row[0] === -1)
      for (let k = 0; k < 3; k++) localMatrix[12 + k]! -= offset[k]!;
    const sourceTransform = Object.fromEntries(
      transformProperties.map((key, j) => [
        key,
        [...row.subarray(27 + j * 3, 30 + j * 3)],
      ]),
    );
    return {
      id: `node-${i}`,
      ...(value.nodeNames[i] ? { name: value.nodeNames[i] } : {}),
      children: nodeRows.flatMap((child, j) =>
        child[0] === i ? [`node-${j}`] : [],
      ),
      ...(row[2]! > 0 ? { meshId: `mesh-${i}` } : {}),
      localMatrix,
      metadata: {
        sourceTransform,
        sourceInheritType: row[63]!,
        sourceRotationOrder: row[64]!,
        sourceInheritMode: row[65]!,
        sourceMeshIndex: row[66]!,
        geometryToNode: matrix(row, 15),
      },
    };
  });
  const meshes = nodeRows.flatMap((row, i) =>
    row[2] === 0
      ? []
      : [
          {
            id: `mesh-${i}`,
            ...(value.meshNames[i] ? { name: value.meshNames[i] } : {}),
            primitives: primitiveRows.flatMap((p, j) =>
              p[0] !== i
                ? []
                : [
                    {
                      id: `primitive-${j}`,
                      topology: "triangles",
                      attributes: [
                        { semantic: "POSITION", accessorId: `positions-${j}` },
                        ...(p[4] === 1
                          ? [{ semantic: "NORMAL", accessorId: `normals-${j}` }]
                          : []),
                        ...(p[5] === 1
                          ? [{ semantic: "TEXCOORD_0", accessorId: `uvs-${j}` }]
                          : []),
                      ],
                      ...(p[3] === -1
                        ? {}
                        : { materialId: `material-${p[3]}` }),
                    },
                  ],
            ),
          },
        ],
  );
  const document = {
    schemaVersion: core.GPU_MODEL_DOCUMENT_SCHEMA_VERSION,
    coordinateSystem: core.CANONICAL_GPU_MODEL_COORDINATE_SYSTEM,
    roots: nodes.filter((_, i) => nodeRows[i]![0] === -1).map((n) => n.id),
    nodes,
    resources,
    accessors,
    meshes,
    materials,
    textures: [],
    skeletons: [],
    joints: [],
    skins: [],
    blendShapes: [],
    animations: [],
    analyticGeometry: [],
    bounds: {
      min: min.map((v, k) => v - offset[k]!),
      max: max.map((v, k) => v - offset[k]!),
    },
    provenance: {
      sourceFormat: "fbx",
      sourceContentHash: sourceHash,
      converterId: "plasius.gpu-model-fbx",
      converterVersion: "2",
      metadata: { profile: FBX_IMPORT_PROFILE },
    },
    diagnostics: report.losses.map((loss) => ({
      severity: "warning",
      code: loss.code,
      message: loss.message,
      path: loss.path,
      metadata: { kind: loss.kind, effect: loss.effect },
    })),
    metadata: {
      profile: FBX_IMPORT_PROFILE,
      fbxVersion: value.version,
      ascii: value.ascii,
      sourceUnitMetres: value.unitMetres,
      sourceAxes: [...value.axes],
      floorCentreOffsetMetres: offset,
      materialDiagnosticReport: report as unknown as GpuModelMetadata,
    },
  };
  return core.createAndVerifyGpuModelDocument(
    document,
    {
      async digestSha256(chunks) {
        const parts: Uint8Array[] = [];
        let length = 0;
        for await (const part of chunks) {
          length += part.byteLength;
          if (length > 360000) invalid();
          parts.push(part);
        }
        const bytes = new Uint8Array(length);
        let cursor = 0;
        for (const part of parts) {
          bytes.set(part, cursor);
          cursor += part.length;
        }
        return sha256Hex(bytes);
      },
      async inspectResource(chunks) {
        for await (const _part of chunks)
          if (signal.aborted) throw new FbxImportError("aborted");
        return { valid: true, detectedMimeType: "application/octet-stream" };
      },
    },
    {
      signal,
      limits: {
        maxResourceBytes: 360000,
        maxAggregateBytes: 960000,
        timeoutMs: 10000,
      },
    },
  );
}
