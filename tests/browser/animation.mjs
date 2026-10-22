// Independent test-only evaluator. Reads the published renderer's decoded samples.
import { morphPositions } from "./morph.mjs";
export function animationPose(view, time, clipIndex = 0) {
  const clip = view.animations[clipIndex];
  const nodes = view.nodes.map((n) => ({
    ...n,
    morphWeights: (n.morphWeights ?? []).map((w) => ({ ...w })),
  }));
  const trs = new Map();
  for (const channel of clip.channels) {
    const node = nodes.find((n) => n.id === channel.targetId);
    const sampler = clip.samplers.find((s) => s.id === channel.samplerId);
    const times = sampler.input,
      values = sampler.output;
    let index = 0;
    while (index + 1 < times.length && times[index + 1] <= time) index++;
    const next = Math.min(index + 1, times.length - 1),
      alpha =
        next === index
          ? 0
          : (time - times[index]) / (times[next] - times[index]);
    const width = values.length / times.length;
    const sample = Array.from(
      { length: width },
      (_, k) =>
        values[index * width + k] * (1 - alpha) +
        values[next * width + k] * alpha,
    );
    if (channel.targetType === "node-weights")
      node.morphWeights.forEach((w, k) => (w.weight = sample[k]));
    else {
      const state = trs.get(node.id) ?? {};
      state[channel.targetType] = sample;
      trs.set(node.id, state);
    }
  }
  for (const node of nodes) {
    const state = trs.get(node.id);
    if (!state) continue;
    const [x, y, z, w] = state["node-rotation"],
      [sx, sy, sz] = state["node-scale"],
      [tx, ty, tz] = state["node-translation"];
    const norm = Math.hypot(x, y, z, w),
      q = [x / norm, y / norm, z / norm, w / norm],
      [a, b, c, d] = q;
    node.localMatrix = [
      (1 - 2 * (b * b + c * c)) * sx,
      2 * (a * b + c * d) * sx,
      2 * (a * c - b * d) * sx,
      0,
      2 * (a * b - c * d) * sy,
      (1 - 2 * (a * a + c * c)) * sy,
      2 * (b * c + a * d) * sy,
      0,
      2 * (a * c + b * d) * sz,
      2 * (b * c - a * d) * sz,
      (1 - 2 * (a * a + b * b)) * sz,
      0,
      tx,
      ty,
      tz,
      1,
    ];
  }
  return { ...view, nodes };
}
export async function checkAnimations(importer, fixtures, check) {
  const { prepareGpuModelRendererInput } =
    await import("@plasius/gpu-model-renderer");
  for (const name of [
    "animation",
    "animationBinary",
    "animationCompressed",
    "animationCentimetres",
    "animationZup",
  ]) {
    const document = await importer.load(
      { kind: "uint8-array", bytes: new Uint8Array(fixtures[name]) },
      { allowAnimationLoss: true },
    );
    const view = await prepareGpuModelRendererInput(document, {
      conversionEnabled: true,
    });
    for (const time of [0, 0.25, 0.5, 0.75, 1]) {
      const order = (a, b) =>
        Math.round(a[0] * 1e5) - Math.round(b[0] * 1e5) ||
        Math.round(a[1] * 1e5) - Math.round(b[1] * 1e5) ||
        Math.round(a[2] * 1e5) - Math.round(b[2] * 1e5);
      const points = morphPositions(animationPose(view, time))[0].sort(order);
      const expected =
        name === "animationZup"
          ? [
              [0, 0, 0],
              [1, 0, -2 * time],
              [0, 0, -1 - 2 * time],
            ]
          : [
              [0, 0, 0],
              [1, 2 * time, 0],
              [0, 1 + 2 * time, 0],
            ];
      expected.sort(order);
      for (let i = 0; i < 3; i++)
        for (let k = 0; k < 3; k++)
          check(
            Math.abs(points[i][k] - expected[i][k]) < 1e-5,
            `${name} pose ${time} vertex${i}/${k}`,
          );
    }
    check(
      document.animations[0].sourceMetadata.originalStartSeconds === -1,
      "Source start retained",
    );
    check(
      document.diagnostics.some((d) => d.code === "fbx-animation-sampled"),
      "Sampling loss explicit",
    );
  }
  const empty = await importer.load({
    kind: "uint8-array",
    bytes: new Uint8Array(fixtures.animationEmpty),
  });
  check(
    empty.animations.length === 2 &&
      empty.animations.every(
        (a) => a.channels.length === 0 && a.samplers.length === 0,
      ),
    "Empty takes have no invented motion",
  );
  return [
    "sampled-takes-timing",
    "fixed-time-skin-morph-poses",
    "animation-axis-units",
    "binary-compressed-animation",
    "empty-takes",
  ];
}
