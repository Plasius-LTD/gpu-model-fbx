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
function determinant(m: readonly number[]): number {
  return (
    m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) -
    m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) +
    m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!)
  );
}
function jointMatrix(row: Float64Array): number[] {
  const [x, y, z, w] = row.subarray(4, 8),
    [sx, sy, sz] = row.subarray(8, 11);
  return [
    (1 - 2 * (y! * y! + z! * z!)) * sx!,
    2 * (x! * y! + z! * w!) * sx!,
    2 * (x! * z! - y! * w!) * sx!,
    0,
    2 * (x! * y! - z! * w!) * sy!,
    (1 - 2 * (x! * x! + z! * z!)) * sy!,
    2 * (y! * z! + x! * w!) * sy!,
    0,
    2 * (x! * z! + y! * w!) * sz!,
    2 * (y! * z! - x! * w!) * sz!,
    (1 - 2 * (x! * x! + y! * y!)) * sz!,
    0,
    row[1]!,
    row[2]!,
    row[3]!,
    1,
  ];
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
      "ascii,axes,channelNames,clusterTable,influenceTable,jointTable,materialNames,materialShaders,materialTable,meshNames,morphIndices,morphNames,morphNormals,morphPositions,morphTable,nodeNames,nodeTable,normals,poseNames,poseTable,positions,primitiveTable,protocol,skinTable,unitMetres,uvs,version" ||
    value.protocol !== 4 ||
    !(value.morphTable instanceof Float64Array) ||
    !integer(value.morphTable.length / 14, 0, 128) ||
    !(value.morphIndices instanceof Float64Array) ||
    value.morphIndices.length > 120000 ||
    !(value.morphPositions instanceof Float32Array) ||
    value.morphPositions.length > 360000 ||
    value.morphPositions.length % 3 !== 0 ||
    !(value.morphNormals instanceof Float32Array) ||
    value.morphNormals.length !== value.morphPositions.length ||
    !names(value.morphNames, value.morphTable.length / 14) ||
    !names(value.channelNames, value.morphTable.length / 14) ||
    !(value.poseTable instanceof Float64Array) ||
    !integer(value.poseTable.length / 14, 0, 512) ||
    !Array.isArray(value.poseNames) ||
    value.poseNames.length > 8 ||
    !names(value.poseNames, value.poseNames.length) ||
    !(value.jointTable instanceof Float64Array) ||
    !integer(value.jointTable.length / 11, 0, 64) ||
    !(value.skinTable instanceof Float64Array) ||
    !integer(value.skinTable.length / 3, 0, 64) ||
    !(value.clusterTable instanceof Float64Array) ||
    !integer(value.clusterTable.length / 39, 0, 128) ||
    !(value.influenceTable instanceof Float64Array) ||
    value.influenceTable.length !== (value.positions?.length / 3) * 16 ||
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
    value.morphTable,
    value.morphIndices,
    value.morphPositions,
    value.morphNormals,
    value.positions,
    value.normals,
    value.uvs,
    value.nodeTable,
    value.primitiveTable,
    value.materialTable,
    value.poseTable,
    value.jointTable,
    value.skinTable,
    value.clusterTable,
    value.influenceTable,
  ];
  if (arrays.some((array) => !(array.buffer instanceof ArrayBuffer))) invalid();
  // Take ownership synchronously. Neither a hostile producer nor a shared heap
  // may change already-admitted values while core/resource verification yields.
  value = {
    ...value,
    morphTable: value.morphTable.slice(),
    morphIndices: value.morphIndices.slice(),
    morphPositions: value.morphPositions.slice(),
    morphNormals: value.morphNormals.slice(),
    morphNames: [...value.morphNames],
    channelNames: [...value.channelNames],
    poseTable: value.poseTable.slice(),
    poseNames: [...value.poseNames],
    jointTable: value.jointTable.slice(),
    skinTable: value.skinTable.slice(),
    clusterTable: value.clusterTable.slice(),
    influenceTable: value.influenceTable.slice(),
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
    value.morphTable,
    value.morphIndices,
    value.morphPositions,
    value.morphNormals,
    value.positions,
    value.normals,
    value.uvs,
    value.nodeTable,
    value.primitiveTable,
    value.materialTable,
    value.poseTable,
    value.jointTable,
    value.skinTable,
    value.clusterTable,
    value.influenceTable,
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
  const poseRows = Array.from({ length: value.poseTable.length / 14 }, (_, i) =>
    value.poseTable.subarray(i * 14, (i + 1) * 14),
  );
  const poseKeys = new Set<string>();
  for (const row of poseRows) {
    const key = `${row[0]}:${row[1]}`;
    if (
      !integer(row[0]!, 0, value.poseNames.length - 1) ||
      !integer(row[1]!, 0, nodeCount - 1) ||
      poseKeys.has(key)
    )
      invalid();
    poseKeys.add(key);
  }
  if (value.poseNames.some((_, i) => !poseRows.some((row) => row[0] === i)))
    invalid();
  const jointRows = Array.from(
    { length: value.jointTable.length / 11 },
    (_, i) => value.jointTable.subarray(i * 11, (i + 1) * 11),
  );
  const skinRows = Array.from({ length: value.skinTable.length / 3 }, (_, i) =>
    value.skinTable.subarray(i * 3, (i + 1) * 3),
  );
  const clusterRows = Array.from(
    { length: value.clusterTable.length / 39 },
    (_, i) => value.clusterTable.subarray(i * 39, (i + 1) * 39),
  );
  const jointByNode = new Map<number, number>();
  jointRows.forEach((row, i) => {
    if (!integer(row[0]!, 0, nodeCount - 1) || jointByNode.has(row[0]!))
      invalid();
    if (
      Math.abs(Math.hypot(...row.subarray(4, 8)) - 1) > 1e-6 ||
      row.subarray(8, 11).some((n) => Math.abs(n) < 1e-12)
    )
      invalid();
    if (
      jointMatrix(row).some(
        (n, k) =>
          Math.abs(n - local[row[0]!]![k]!) > 1e-8 * Math.max(1, Math.abs(n)),
      )
    )
      invalid();
    jointByNode.set(row[0]!, i);
  });
  const skinByNode = new Map<number, number>();
  let clusterCursor = 0;
  skinRows.forEach((row, i) => {
    const [node, first, count] = row;
    if (
      !integer(node!, 0, nodeCount - 1) ||
      skinByNode.has(node!) ||
      nodeRows[node!]![2] === 0 ||
      first !== clusterCursor ||
      !integer(count!, 1, 64) ||
      first! + count! > clusterRows.length
    )
      invalid();
    skinByNode.set(node!, i);
    clusterCursor += count!;
    const bones = new Set<number>();
    for (const cluster of clusterRows.slice(first!, first! + count!)) {
      if (
        !jointByNode.has(cluster[0]!) ||
        bones.has(cluster[0]!) ||
        !integer(cluster[1]!, 0, 127) ||
        !integer(cluster[2]!, 0, 63)
      )
        invalid();
      if (
        [3, 15, 27].some(
          (offset) => Math.abs(determinant(matrix(cluster, offset))) < 1e-12,
        )
      )
        invalid();
      bones.add(cluster[0]!);
    }
  });
  if (clusterCursor !== clusterRows.length) invalid();
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
  for (let vertex = 0; vertex < value.positions.length / 3; vertex++) {
    const owner = primitiveRows.find(
      (p) => vertex >= p[1]! && vertex < p[1]! + p[2]!,
    )!;
    const skinIndex = skinByNode.get(owner[0]!);
    const row = value.influenceTable.subarray(vertex * 16, (vertex + 1) * 16);
    let sum = 0;
    const seen = new Set<number>();
    for (let k = 0; k < 8; k++) {
      const joint = row[k]!,
        weight = row[8 + k]!;
      if (
        !integer(
          joint,
          0,
          skinIndex === undefined ? 0 : skinRows[skinIndex]![2]! - 1,
        ) ||
        weight < 0 ||
        weight > 1 ||
        (weight > 0 && Math.fround(weight) === 0)
      )
        invalid();
      if (weight > 0 && seen.has(joint)) invalid();
      if (weight > 0) seen.add(joint);
      sum += weight;
    }
    if (Math.abs(sum - (skinIndex === undefined ? 0 : 1)) > 1e-6) invalid();
  }
  const morphRows = Array.from(
    { length: value.morphTable.length / 14 },
    (_, i) => value.morphTable.subarray(i * 14, (i + 1) * 14),
  );
  if (
    value.morphPositions.some((n) => Math.abs(n) > 1000000) ||
    value.morphNormals.some((n) => Math.abs(n) > 1000000)
  )
    invalid();
  const channels = new Map<string, number[]>();
  const perNode = new Map<number, number>();
  const nodeMorphSource = new Map<number, readonly number[]>();
  let morphCursor = 0,
    refCursor = 0;
  morphRows.forEach((row, i) => {
    const [
      node,
      start,
      count,
      channel,
      shape,
      threshold,
      weight,
      effective,
      normal,
      deformer,
      refStart,
      refCount,
      key,
      controlPoints,
    ] = row;
    if (
      !integer(node!, 0, nodeCount - 1) ||
      start !== morphCursor ||
      !integer(count!, 3, 30000) ||
      count! % 3 ||
      !integer(channel!, 0, 127) ||
      !integer(shape!, 0, 127) ||
      threshold! <= 0 ||
      threshold! > 1000000 ||
      Math.abs(weight!) > 1000000 ||
      Math.abs(effective!) > 1000000 ||
      !integer(normal!, 0, 1) ||
      !integer(deformer!, 0, 63) ||
      refStart !== refCursor ||
      !integer(refCount!, 0, 30000) ||
      !integer(key!, 0, 3) ||
      !integer(controlPoints!, 1, 30000) ||
      start! + count! > value.morphPositions.length / 3 ||
      refStart! + refCount! > value.morphIndices.length
    )
      invalid();
    const primitives = primitiveRows.filter((p) => p[0] === node);
    if (
      primitives.reduce((n, p) => n + p[2]!, 0) !== count ||
      (normal === 1 && primitives.some((p) => p[4] !== 1))
    )
      invalid();
    if (
      normal === 0 &&
      value.morphNormals
        .subarray(start! * 3, (start! + count!) * 3)
        .some((n) => n !== 0)
    )
      invalid();
    const targets = (perNode.get(node!) ?? 0) + 1;
    if (targets > 4) invalid();
    perNode.set(node!, targets);
    const source = nodeMorphSource.get(node!);
    if (source && (source[0] !== deformer || source[1] !== controlPoints))
      invalid();
    nodeMorphSource.set(node!, [deformer!, controlPoints!]);
    for (let k = 0; k < refCount!; k++) {
      const index = value.morphIndices[refStart! + k]!;
      if (
        !integer(index, 0, controlPoints! - 1) ||
        (k > 0 && index <= value.morphIndices[refStart! + k - 1]!)
      )
        invalid();
    }
    const channelKey = `${node}:${channel}`;
    const group = channels.get(channelKey) ?? [];
    if (key !== group.length) invalid();
    if (group.length) {
      const prev = morphRows[group[group.length - 1]!]!;
      if (
        threshold! <= prev[5]! ||
        weight !== prev[6] ||
        deformer !== prev[9] ||
        controlPoints !== prev[13] ||
        value.channelNames[i] !== value.channelNames[group[0]!]
      )
        invalid();
    }
    if (group.some((j) => morphRows[j]![4] === shape)) invalid();
    group.push(i);
    channels.set(channelKey, group);
    morphCursor += count!;
    refCursor += refCount!;
  });
  if (
    morphCursor !== value.morphPositions.length / 3 ||
    refCursor !== value.morphIndices.length
  )
    invalid();
  for (const group of channels.values()) {
    const weight = morphRows[group[0]!]![6]!,
      expected = group.map(() => 0);
    if (weight > 0) {
      let next = group.findIndex((i) => morphRows[i]![5]! > weight);
      if (next < 0) next = group.length - 1;
      const prev = next - 1,
        low = prev < 0 ? 0 : morphRows[group[prev]!]![5]!,
        high = morphRows[group[next]!]![5]!;
      const t = (weight - low) / (high - low);
      expected[next] = t;
      if (prev >= 0) expected[prev] = 1 - t;
    }
    group.forEach((i, k) => {
      if (
        Math.abs(morphRows[i]![7]! - expected[k]!) >
        1e-8 * Math.max(1, Math.abs(expected[k]!))
      )
        invalid();
    });
  }
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
  const skinSets = skinRows.length
    ? Array.from({ length: value.positions.length / 3 }, (_, i) =>
        value.influenceTable.subarray(i * 16 + 12, i * 16 + 16),
      ).some((row) => row.some((n) => n > 0))
      ? 2
      : 1
    : 0;
  const resourcesToVerify = [
    {
      id: "positions",
      baseVertex: 0,
      data: value.positions,
      width: 3,
      componentType: "f32",
      semantic: "POSITION",
      enabled: () => true,
    },
    {
      id: "normals",
      baseVertex: 0,
      data: value.normals,
      width: 3,
      componentType: "f32",
      semantic: "NORMAL",
      enabled: (row: Float64Array) => row[4] === 1,
    },
    {
      id: "uvs",
      baseVertex: 0,
      data: value.uvs,
      width: 2,
      componentType: "f32",
      semantic: "TEXCOORD_0",
      enabled: (row: Float64Array) => row[5] === 1,
    },
    ...Array.from({ length: skinSets }, (_, set) => [
      {
        id: `joints${set}`,
        baseVertex: 0,
        data: Uint8Array.from(
          { length: (value.positions.length / 3) * 4 },
          (_, i) =>
            value.influenceTable[Math.floor(i / 4) * 16 + set * 4 + (i % 4)]!,
        ),
        width: 4,
        componentType: "u8",
        semantic: `JOINTS_${set}`,
        enabled: (row: Float64Array) => skinByNode.has(row[0]!),
      },
      {
        id: `weights${set}`,
        baseVertex: 0,
        data: Float32Array.from(
          { length: (value.positions.length / 3) * 4 },
          (_, i) =>
            value.influenceTable[
              Math.floor(i / 4) * 16 + 8 + set * 4 + (i % 4)
            ]!,
        ),
        width: 4,
        componentType: "f32",
        semantic: `WEIGHTS_${set}`,
        enabled: (row: Float64Array) => skinByNode.has(row[0]!),
      },
    ]).flat(),
    ...morphRows.flatMap((row, i) => [
      {
        id: `morph-position-${i}`,
        baseVertex:
          nodeRows[row[0]!]![1]! < primitiveRows.length
            ? primitiveRows[nodeRows[row[0]!]![1]!]![1]!
            : 0,
        data: value.morphPositions.slice(row[1]! * 3, (row[1]! + row[2]!) * 3),
        width: 3,
        componentType: "f32",
        semantic: "POSITION",
        enabled: (p: Float64Array) => p[0] === row[0],
      },
      ...(row[8] === 1
        ? [
            {
              id: `morph-normal-${i}`,
              baseVertex: primitiveRows[nodeRows[row[0]!]![1]!]![1]!,
              data: value.morphNormals.slice(
                row[1]! * 3,
                (row[1]! + row[2]!) * 3,
              ),
              width: 3,
              componentType: "f32",
              semantic: "NORMAL",
              enabled: (p: Float64Array) => p[0] === row[0],
            },
          ]
        : []),
    ]),
  ].filter((a) => primitiveRows.some((row) => a.enabled(row)));
  // Source control-point membership is numeric resource data, not oversized JSON metadata.
  const sourceRefs = morphRows.flatMap((row, i) =>
    row[11] === 0
      ? []
      : [
          {
            id: `morph-controlpoints-${i}`,
            data: Uint32Array.from(
              value.morphIndices.subarray(row[10]!, row[10]! + row[11]!),
            ),
          },
        ],
  );
  for (const { id, data } of [...resourcesToVerify, ...sourceRefs]) {
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
  const accessors = [
    ...primitiveRows.flatMap((row, index) =>
      resourcesToVerify
        .filter((a) => a.enabled(row))
        .map(({ id, width, componentType, data, baseVertex }) => {
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
            byteOffset: (row[1]! - baseVertex) * width * data.BYTES_PER_ELEMENT,
            count: row[2]!,
            componentType,
            elementType: width === 2 ? "vec2" : width === 4 ? "vec4" : "vec3",
            ...bounds,
          };
        }),
    ),
    ...sourceRefs.map(({ id, data }) => ({
      id,
      resourceId: id,
      byteOffset: 0,
      count: data.length,
      componentType: "u32",
      elementType: "scalar",
    })),
  ];
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
      ...(skinByNode.has(i) ? { skinId: `skin-${skinByNode.get(i)}` } : {}),
      ...(perNode.has(i)
        ? {
            morphWeights: morphRows.flatMap((m, j) =>
              m[0] === i ? [{ blendShapeId: `morph-${j}`, weight: m[7]! }] : [],
            ),
          }
        : {}),
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
                        ...resourcesToVerify
                          .filter(
                            (a) => !a.id.startsWith("morph-") && a.enabled(p),
                          )
                          .map((a) => ({
                            semantic: a.semantic,
                            accessorId: `${a.id}-${j}`,
                          })),
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
  const parentJoint = (node: number): number | undefined => {
    let parent = nodeRows[node]![0]!;
    while (parent !== -1) {
      const index = jointByNode.get(parent);
      if (index !== undefined) return index;
      parent = nodeRows[parent]![0]!;
    }
    return undefined;
  };
  const joints = jointRows.map((row, i) => {
    const n = row[0]!,
      parent = parentJoint(n),
      translation = [...row.subarray(1, 4)];
    if (nodeRows[n]![0] === -1)
      for (let k = 0; k < 3; k++) translation[k]! -= offset[k]!;
    return {
      id: `joint-${i}`,
      nodeId: `node-${n}`,
      ...(value.nodeNames[n] ? { name: value.nodeNames[n] } : {}),
      ...(parent === undefined ? {} : { parentJointId: `joint-${parent}` }),
      restLocalTransform: {
        translation,
        rotation: [...row.subarray(4, 8)],
        scale: [...row.subarray(8, 11)],
      },
      sourceMetadata: {
        format: "fbx",
        sourceNodeIndex: n,
        sourceRestLocalMatrix: local[n]!,
      },
    };
  });
  const skeletons = joints.length
    ? [
        {
          id: "skeleton-0",
          jointIds: joints.map((j) => j.id),
          rootJointIds: joints.filter((j) => !j.parentJointId).map((j) => j.id),
          sourceMetadata: { format: "fbx" },
        },
      ]
    : [];
  const skins = skinRows.map((row, i) => {
    const clusters = clusterRows.slice(row[1]!, row[1]! + row[2]!);
    return {
      id: `skin-${i}`,
      skeletonId: "skeleton-0",
      jointIds: clusters.map((c) => `joint-${jointByNode.get(c[0]!)}`),
      inverseBindMatrices: clusters.map((c) => matrix(c, 3)),
      weightSets: primitiveRows.flatMap((p, j) =>
        p[0] !== row[0]
          ? []
          : [
              {
                primitiveId: `primitive-${j}`,
                influencesPerVertex: skinSets * 4,
                joints: Array.from({ length: p[2]! }, (_, k) => [
                  ...value.influenceTable.subarray(
                    (p[1]! + k) * 16,
                    (p[1]! + k) * 16 + skinSets * 4,
                  ),
                ]),
                weights: Array.from({ length: p[2]! }, (_, k) => [
                  ...value.influenceTable.subarray(
                    (p[1]! + k) * 16 + 8,
                    (p[1]! + k) * 16 + 8 + skinSets * 4,
                  ),
                ]),
              },
            ],
      ),
      sourceMetadata: {
        format: "fbx",
        method: "linear",
        sourceSkinIndex: clusters[0]![2]!,
        clusters: clusters.map((c) => ({
          sourceClusterIndex: c[1]!,
          geometryToBone: matrix(c, 15),
          bindToWorld: matrix(c, 27),
          meshNodeToBone: matrix(c, 3),
        })),
      },
    };
  });
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
    skeletons,
    joints,
    skins,
    blendShapes: morphRows.map((row, i) => ({
      id: `morph-${i}`,
      meshId: `mesh-${row[0]}`,
      ...(value.morphNames[i] ? { name: value.morphNames[i] } : {}),
      defaultWeight: row[7]!,
      deltas: primitiveRows.flatMap((p, j) =>
        p[0] === row[0]
          ? [
              {
                primitiveId: `primitive-${j}`,
                positionAccessorId: `morph-position-${i}-${j}`,
                ...(row[8] === 1
                  ? { normalAccessorId: `morph-normal-${i}-${j}` }
                  : {}),
              },
            ]
          : [],
      ),
      sourceMetadata: {
        format: "fbx",
        sourceChannelIndex: row[3]!,
        sourceShapeIndex: row[4]!,
        sourceDeformerIndex: row[9]!,
        channelName: value.channelNames[i]!,
        channelWeight: row[6]!,
        targetWeight: row[5]!,
        keyIndex: row[12]!,
        affectedControlPointCount: row[11]!,
        ...(row[11] === 0
          ? {}
          : { affectedControlPointsAccessorId: `morph-controlpoints-${i}` }),
      },
    })),
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
      converterVersion: "4",
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
      sourceBindPoses: value.poseNames.map((name, i) => ({
        name,
        nodes: poseRows
          .filter((row) => row[0] === i)
          .map((row) => ({
            nodeId: `node-${row[1]}`,
            boneToWorld: matrix(row, 2),
          })),
      })),
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
          if (length > 480000) invalid();
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
        maxResourceBytes: 480000,
        maxAggregateBytes: 5520000,
        timeoutMs: 10000,
      },
    },
  );
}
