// Test-only host: morph in mesh space, then skin or scene transform. No renderer bake.
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mul = (a, b) =>
  Array.from({ length: 16 }, (_, i) =>
    Array.from(
      { length: 4 },
      (_, k) => a[k * 4 + (i % 4)] * b[Math.floor(i / 4) * 4 + k],
    ).reduce((x, y) => x + y, 0),
  );
const point = (m, p) =>
  [0, 1, 2].map(
    (k) => m[k] * p[0] + m[4 + k] * p[1] + m[8 + k] * p[2] + m[12 + k],
  );
export function morphPositions(view, weightOverride, tipDelta = 0) {
  const world = (id) => {
    const n = view.nodes.find((n) => n.id === id),
      parent = view.nodes.find((n) => n.children.includes(id));
    return mul(parent ? world(parent.id) : identity, n.localMatrix);
  };
  return view.nodes
    .filter((n) => n.meshId)
    .map((node) => {
      const shapes = view.blendShapes.filter((s) => s.meshId === node.meshId);
      const skin = view.skins.find((s) => s.id === node.skinId);
      const palette = skin?.jointIds.map((id, i) => {
        const joint = view.joints.find((j) => j.id === id),
          m = world(joint.nodeId);
        if (joint.name === "Tip") m[13] += tipDelta;
        return mul(m, [
          ...skin.inverseBindMatrices.slice(i * 16, (i + 1) * 16),
        ]);
      });
      return view.primitives
        .filter((p) => p.meshId === node.meshId)
        .flatMap((primitive) => {
          const positions = primitive.attributes.POSITION,
            set = skin?.weightSets.find(
              (s) => s.primitiveId === primitive.primitiveId,
            );
          return Array.from({ length: positions.length / 3 }, (_, v) => {
            const p = [...positions.slice(v * 3, v * 3 + 3)];
            for (const shape of shapes) {
              const delta = shape.deltas.find(
                  (d) => d.primitiveId === primitive.primitiveId,
                ),
                a = view.accessors[delta.positionAccessorId];
              const w =
                weightOverride ??
                node.morphWeights.find((w) => w.blendShapeId === shape.id)
                  .weight;
              for (let k = 0; k < 3; k++) p[k] += a[v * 3 + k] * w;
            }
            let result;
            if (set) {
              result = [0, 0, 0];
              for (let j = 0; j < set.influencesPerVertex; j++) {
                const slot = v * set.influencesPerVertex + j,
                  q = point(palette[set.joints[slot]], p);
                for (let k = 0; k < 3; k++)
                  result[k] += set.weights[slot] * q[k];
              }
            } else result = point(world(node.id), p);
            return result.map(
              (n, k) => n + view.document.metadata.floorCentreOffsetMetres[k],
            );
          });
        });
    });
}
export async function checkMorphs(importer, fixtures, check) {
  const { prepareGpuModelRendererInput } =
    await import("@plasius/gpu-model-renderer");
  for (const name of [
    "morph",
    "morphNegative",
    "morphCentimetres",
    "morphInstances",
    "morphSkin",
    "morphInbetween",
  ]) {
    const d = await importer.load({
      kind: "uint8-array",
      bytes: new Uint8Array(fixtures[name]),
    });
    const view = await prepareGpuModelRendererInput(d, {
      conversionEnabled: true,
    });
    const base = morphPositions(view, 0),
      posed = morphPositions(view);
    const delta = Math.max(
      ...posed.flatMap((points, i) =>
        points.map((p, j) => Math.hypot(...p.map((n, k) => n - base[i][j][k]))),
      ),
    );
    check(
      Math.abs(
        delta -
          (name === "morphInbetween"
            ? 1.5
            : name === "morphNegative"
              ? 0.25
              : 0.75),
      ) < 1e-5,
      "Morph numeric displacement",
    );
    check(
      d.blendShapes.length ===
        (name === "morphInstances" || name === "morphInbetween" ? 2 : 1),
      "Morph targets preserved",
    );
  }
  return [
    "sparse-morph-defaults",
    "morph-units-instances",
    "combined-morph-skin",
    "inbetween-effective-weights",
  ];
}
