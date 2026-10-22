import type {
  GpuModelAnimation,
  GpuModelAccessor,
  GpuModelConversionIssue,
  GpuModelMetadata,
} from "@plasius/gpu-model-core";
import { FbxImportError, type ParsedFbx } from "./policy.js";
const reject = (): never => {
  throw new FbxImportError("worker-failed");
};
const integer = (n: number, min: number, max: number) =>
  Number.isInteger(n) && n >= min && n <= max;
const specifications = {
  animationStacks: [12, 8],
  animationLayers: [10, 32],
  animationCurves: [16, 128],
  animationKeys: [7, 4096],
  animationTimes: [1, 256],
  animationTransforms: [10, 16384],
  animationWeights: [1, 32768],
} as const;
/** Snapshot private animation tables synchronously before any resource-verification yield. */
export function snapshotAnimation(
  value: ParsedFbx,
  validNames: (names: readonly string[], count: number) => boolean,
): Partial<ParsedFbx> {
  const result: Record<string, Float64Array> = {};
  for (const [key, [stride, max]] of Object.entries(specifications)) {
    const array = value[key as keyof typeof specifications];
    if (
      !(array instanceof Float64Array) ||
      !(array.buffer instanceof ArrayBuffer) ||
      array.byteOffset !== 0 ||
      array.byteLength !== array.buffer.byteLength ||
      !integer(array.length / stride, 0, max)
    )
      reject();
    if (array.some((n) => !Number.isFinite(n) || Math.abs(n) > 100000000))
      reject();
    result[key] = array.slice();
  }
  for (const [name, count] of [
    ["animationStackNames", value.animationStacks.length / 12],
    ["animationLayerNames", value.animationLayers.length / 10],
    ["animationCurveNames", value.animationCurves.length / 16],
    ["animationValueNames", value.animationCurves.length / 16],
  ] as const)
    if (!validNames(value[name], count)) reject();
  const hasStacks = value.animationStacks.length > 0;
  if (
    hasStacks
      ? !Number.isFinite(value.framesPerSecond) ||
        value.framesPerSecond <= 0 ||
        value.framesPerSecond > 120 ||
        !integer(value.timeMode, 0, 17) ||
        value.ktimeSecond !== 46186158000
      : value.framesPerSecond !== 0 ||
        value.timeMode !== 0 ||
        value.ktimeSecond !== 0
  )
    reject();
  return {
    ...result,
    animationStackNames: [...value.animationStackNames],
    animationLayerNames: [...value.animationLayerNames],
    animationCurveNames: [...value.animationCurveNames],
    animationValueNames: [...value.animationValueNames],
  };
}
/** Map independently admitted samples into the published canonical animation contracts. */
export function prepareAnimations(value: ParsedFbx, offset: readonly number[]) {
  const rows = (array: Float64Array, stride: number) =>
    Array.from({ length: array.length / stride }, (_, i) =>
      array.subarray(i * stride, (i + 1) * stride),
    );
  const stacks = rows(value.animationStacks, 12),
    layers = rows(value.animationLayers, 10),
    curves = rows(value.animationCurves, 16),
    keys = rows(value.animationKeys, 7);
  const nodes = value.nodeNames.length,
    morphs = value.morphTable.length / 14,
    frames = value.animationTimes.length;
  if (
    value.animationTransforms.length !== frames * nodes * 10 ||
    value.animationWeights.length !== frames * morphs
  )
    reject();
  const resources: { id: string; data: Float32Array | Uint8Array }[] = [];
  const accessors: GpuModelAccessor[] = [],
    animations: GpuModelAnimation[] = [],
    issues: GpuModelConversionIssue[] = [];
  let layerCursor = 0,
    curveCursor = 0,
    keyCursor = 0,
    frameCursor = 0;
  const buffer = (
    id: string,
    data: Float32Array,
    elementType: "scalar" | "vec3" | "vec4",
    width: number,
  ) => {
    resources.push({ id, data });
    accessors.push({
      id,
      resourceId: id,
      byteOffset: 0,
      componentType: "f32",
      elementType,
      count: data.length / width,
    });
    return id;
  };
  for (const [si, stack] of stacks.entries()) {
    const [
      begin,
      end,
      localStart,
      localEnd,
      referenceStart,
      referenceEnd,
      mask,
      firstLayer,
      layerCount,
      firstFrame,
      count,
      hasProps,
    ] = [...stack] as number[];
    if (
      end! < begin! ||
      Math.abs(begin!) > 1000000 ||
      Math.abs(end!) > 1000000 ||
      !integer(mask!, 0, 15) ||
      firstLayer !== layerCursor ||
      !integer(layerCount!, 0, 32) ||
      layerCursor + layerCount! > layers.length ||
      firstFrame !== frameCursor ||
      !integer(count!, 0, 121) ||
      count! + frameCursor > frames ||
      !integer(hasProps!, 0, 1) ||
      (hasProps === 0) !== (count === 0)
    )
      reject();
    for (const t of stack.subarray(2, 6)) if (Math.abs(t) > 1000000) reject();
    const layerMetadata: GpuModelMetadata[] = [];
    let props = 0;
    for (let li = layerCursor; li < layerCursor + layerCount!; li++) {
      const l = layers[li]!;
      if (
        l[0] !== si ||
        !integer(l[1]!, 0, 31) ||
        Math.abs(l[2]!) > 1000000 ||
        [3, 4, 5, 6].some((k) => !integer(l[k]!, 0, 1)) ||
        l[7] !== 0 ||
        l[8] !== curveCursor ||
        !integer(l[9]!, 0, 128) ||
        curveCursor + l[9]! > curves.length ||
        l[9]! % 3
      )
        reject();
      if (layerMetadata.some((m) => m.sourceLayerIndex === l[1])) reject();
      const evidence: GpuModelMetadata[] = [];
      for (let ci = curveCursor; ci < curveCursor + l[9]!; ci++) {
        const c = curves[ci]!;
        if (
          c[0] !== li ||
          !integer(c[1]!, 0, 1) ||
          !integer(c[2]!, 0, c[1] === 0 ? nodes - 1 : 127) ||
          !integer(c[3]!, 0, c[1] === 0 ? 8 : 0) ||
          c[4] !== (ci - curveCursor) % 3 ||
          !integer(c[5]!, 0, 127) ||
          !integer(c[6]!, -1, 127) ||
          c[7] !== keyCursor ||
          !integer(c[8]!, 0, 4096) ||
          c[8]! + keyCursor > keys.length ||
          (c[6] === -1 && c[8] !== 0) ||
          !integer(c[12]!, 0, 4) ||
          !integer(c[14]!, 0, 4) ||
          !integer(c[13]!, -2147483648, 2147483647) ||
          !integer(c[15]!, -2147483648, 2147483647)
        )
          reject();
        if (
          c[1] === 1 &&
          !Array.from(
            { length: morphs },
            (_, mi) => value.morphTable[mi * 14 + 3],
          ).includes(c[2])
        )
          reject();
        if (c[4] !== 0) {
          const previous = curves[ci - 1]!;
          if ([1, 2, 3, 5, 9, 10, 11].some((k) => c[k] !== previous[k]))
            reject();
        }
        let previous = -Infinity;
        for (let ki = keyCursor; ki < keyCursor + c[8]!; ki++) {
          const k = keys[ki]!;
          if (
            k[0]! <= previous ||
            Math.abs(k[0]!) > 1000000 ||
            Math.abs(k[1]!) > 1000000 ||
            !integer(k[2]!, 0, 3) ||
            [3, 4, 5, 6].some((i) => Math.abs(k[i]!) > 1000000)
          )
            reject();
          previous = k[0]!;
        }
        evidence.push({
          sourceValueIndex: c[5]!,
          ...(value.animationValueNames[ci]
            ? { valueName: value.animationValueNames[ci]! }
            : {}),
          sourceCurveIndex: c[6]!,
          ...(value.animationCurveNames[ci]
            ? { curveName: value.animationCurveNames[ci]! }
            : {}),
          targetType: c[1] === 0 ? "node-property" : "morph-channel",
          targetIndex: c[2]!,
          propertyIndex: c[3]!,
          component: c[4]!,
          defaultValue: [...c.subarray(9, 12)],
          keyByteOffset: keyCursor * 56,
          keyCount: c[8]!,
          ...(c[8] ? { keyResourceId: "fbx-animation-keys" } : {}),
          preExtrapolation: [c[12]!, c[13]!],
          postExtrapolation: [c[14]!, c[15]!],
        });
        keyCursor += c[8]!;
        props++;
      }
      curveCursor += l[9]!;
      layerMetadata.push({
        sourceLayerIndex: l[1]!,
        ...(value.animationLayerNames[li]
          ? { name: value.animationLayerNames[li]! }
          : {}),
        weight: l[2]!,
        blended: l[3] === 1,
        additive: l[4] === 1,
        composeRotation: l[5] === 1,
        composeScale: l[6] === 1,
        curves: evidence,
      });
    }
    layerCursor += layerCount!;
    if ((props === 0) !== (hasProps === 0)) reject();
    const samplers: GpuModelAnimation["samplers"][number][] = [],
      channels: GpuModelAnimation["channels"][number][] = [];
    if (count) {
      const intervals = Math.ceil(
        (end! - begin!) * value.framesPerSecond - 1e-9,
      );
      if (intervals > 120 || count !== intervals + 1) reject();
      const times = Float32Array.from(
        value.animationTimes.subarray(firstFrame!, firstFrame! + count),
        (t) => t - begin!,
      );
      for (let fi = 0; fi < count; fi++) {
        const expected =
          fi + 1 === count ? end! : begin! + fi / value.framesPerSecond;
        if (
          Math.abs(value.animationTimes[firstFrame! + fi]! - expected) > 1e-8 ||
          (fi > 0 && times[fi]! <= times[fi - 1]!)
        )
          reject();
      }
      const timeId = buffer(`animation-${si}-times`, times, "scalar", 1);
      const add = (
        id: string,
        values: Float32Array,
        width: number,
        targetType:
          "node-translation" | "node-rotation" | "node-scale" | "node-weights",
        node: number,
      ) => {
        const output = buffer(
          id,
          values,
          width === 3
            ? "vec3"
            : width === 4 && targetType !== "node-weights"
              ? "vec4"
              : "scalar",
          targetType === "node-weights" ? 1 : width,
        );
        samplers.push({
          id,
          inputAccessorId: timeId,
          outputAccessorId: output,
          inputTimesSeconds: [...times],
          outputValues: [...values],
          interpolation: "linear",
          sourceMetadata: { representation: "evaluated-samples" },
        });
        channels.push({
          id,
          samplerId: id,
          targetType,
          targetId: `node-${node}`,
          sourceMetadata: { representation: "evaluated-samples" },
        });
      };
      for (let ni = 0; ni < nodes; ni++) {
        const translation = new Float32Array(count * 3),
          rotation = new Float32Array(count * 4),
          scale = new Float32Array(count * 3);
        for (let fi = 0; fi < count; fi++) {
          const base = ((firstFrame! + fi) * nodes + ni) * 10;
          const t = value.animationTransforms.subarray(base, base + 10);
          if (
            Math.abs(Math.hypot(...t.subarray(3, 7)) - 1) > 1e-6 ||
            t.subarray(7).some((n) => Math.abs(n) < 1e-12) ||
            t.some((n) => Math.abs(n) > 1000000)
          )
            reject();
          for (let k = 0; k < 3; k++) {
            translation[fi * 3 + k] =
              t[k]! - (value.nodeTable[ni * 67] === -1 ? offset[k]! : 0);
            scale[fi * 3 + k] = t[7 + k]!;
          }
          const sign =
            fi &&
            [...t.subarray(3, 7)].reduce(
              (sum, n, k) => sum + n * rotation[(fi - 1) * 4 + k]!,
              0,
            ) < 0
              ? -1
              : 1;
          for (let k = 0; k < 4; k++) rotation[fi * 4 + k] = t[3 + k]! * sign;
        }
        add(
          `animation-${si}-node-${ni}-translation`,
          translation,
          3,
          "node-translation",
          ni,
        );
        add(
          `animation-${si}-node-${ni}-rotation`,
          rotation,
          4,
          "node-rotation",
          ni,
        );
        add(`animation-${si}-node-${ni}-scale`, scale, 3, "node-scale", ni);
        const targets = Array.from({ length: morphs }, (_, mi) => mi).filter(
          (mi) => value.morphTable[mi * 14] === ni,
        );
        if (targets.length) {
          const weights = Float32Array.from(
            { length: count * targets.length },
            (_, i) =>
              value.animationWeights[
                (firstFrame! + Math.floor(i / targets.length)) * morphs +
                  targets[i % targets.length]!
              ]!,
          );
          if (weights.some((n) => !Number.isFinite(n) || Math.abs(n) > 1000000))
            reject();
          add(
            `animation-${si}-node-${ni}-weights`,
            weights,
            targets.length,
            "node-weights",
            ni,
          );
        }
      }
      issues.push({
        kind: "loss",
        code: "fbx-animation-sampled",
        path: `/animations/${si}`,
        message:
          "Effective transforms and morph weights use source-rate linear samples; authored curves and ordered layers remain evidence. Between-sample motion and layer editing are approximated.",
        effect: "approximated",
      });
    }
    animations.push({
      id: `animation-${si}`,
      ...(value.animationStackNames[si]
        ? { name: value.animationStackNames[si] }
        : {}),
      durationSeconds: end! - begin!,
      samplers,
      channels,
      sourceMetadata: {
        sourceStackIndex: si,
        originalStartSeconds: begin!,
        originalEndSeconds: end!,
        ...(mask! & 1 ? { localStartSeconds: localStart! } : {}),
        ...(mask! & 2 ? { localEndSeconds: localEnd! } : {}),
        ...(mask! & 4 ? { referenceStartSeconds: referenceStart! } : {}),
        ...(mask! & 8 ? { referenceEndSeconds: referenceEnd! } : {}),
        framesPerSecond: value.framesPerSecond,
        timeMode: value.timeMode,
        ktimeSecond: value.ktimeSecond,
        representation: count ? "sampled-linear" : "empty",
        layers: layerMetadata,
      },
    });
    frameCursor += count!;
  }
  if (
    layerCursor !== layers.length ||
    curveCursor !== curves.length ||
    keyCursor !== keys.length ||
    frameCursor !== frames
  )
    reject();
  if (keys.length) {
    const data = new Uint8Array(keys.length * 56),
      view = new DataView(data.buffer);
    value.animationKeys.forEach((n, i) => view.setFloat64(i * 8, n, true));
    resources.push({ id: "fbx-animation-keys", data });
  }
  return { resources, accessors, animations, issues };
}
