// Test-only host linear evaluator; production renderer intentionally exposes data only.
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a, b) {
  return Array.from({ length: 16 }, (_, i) =>
    Array.from(
      { length: 4 },
      (_, k) => a[k * 4 + (i % 4)] * b[Math.floor(i / 4) * 4 + k],
    ).reduce((x, y) => x + y, 0),
  );
}
export function deform(view, tipDelta = 0) {
  const world = (id) => {
    const n = view.nodes.find((n) => n.id === id),
      p = view.nodes.find((n) => n.children.includes(id));
    return multiply(p ? world(p.id) : identity, n.localMatrix);
  };
  return view.nodes
    .filter((n) => n.skinId)
    .map((node) => {
      const skin = view.skins.find((s) => s.id === node.skinId);
      const palette = skin.jointIds.map((id, i) => {
        const joint = view.joints.find((j) => j.id === id);
        const m = world(joint.nodeId);
        if (joint.name === "Tip") m[13] += tipDelta;
        return multiply(m, [
          ...skin.inverseBindMatrices.slice(i * 16, (i + 1) * 16),
        ]);
      });
      return skin.weightSets.flatMap((set) => {
        const p = view.primitives.find((p) => p.primitiveId === set.primitiveId)
          .attributes.POSITION;
        return Array.from({ length: p.length / 3 }, (_, v) =>
          [0, 1, 2].map((k) => {
            let total = 0;
            for (let j = 0; j < set.influencesPerVertex; j++) {
              const slot = v * set.influencesPerVertex + j,
                m = palette[set.joints[slot]];
              total +=
                set.weights[slot] *
                (m[k] * p[v * 3] +
                  m[4 + k] * p[v * 3 + 1] +
                  m[8 + k] * p[v * 3 + 2] +
                  m[12 + k]);
            }
            return total + view.document.metadata.floorCentreOffsetMetres[k];
          }),
        );
      });
    });
}
export async function checkSkins(importer, fixtures, check) {
  const { prepareGpuModelRendererInput } =
    await import("@plasius/gpu-model-renderer");
  for (const name of ["skin", "skinCentimetres", "skinMultiple"]) {
    const d = await importer.load({
      kind: "uint8-array",
      bytes: new Uint8Array(fixtures[name]),
    });
    const view = await prepareGpuModelRendererInput(d, {
      conversionEnabled: true,
    });
    const bind = deform(view),
      posed = deform(view, 1);
    check(bind.length === (name === "skinMultiple" ? 2 : 1), "Skin bindings");
    const sort = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    bind.forEach((vertices, i) =>
      vertices.sort(sort).forEach((p, v) =>
        p.forEach((n, k) =>
          check(
            Math.abs(
              n -
                [
                  [i * 2, 0, 0],
                  [1 + i * 2, 0, 0],
                  [i * 2, 1, 0],
                ].sort(sort)[v][k],
            ) < 1e-5,
            "Bind positions",
          ),
        ),
      ),
    );
    posed.forEach((vertices, i) =>
      vertices.sort(sort).forEach((p, v) =>
        p.forEach((n, k) =>
          check(
            Math.abs(
              n -
                [
                  [i * 2, 0, 0],
                  [1 + i * 2, 0.5, 0],
                  [i * 2, 2, 0],
                ].sort(sort)[v][k],
            ) < 1e-5,
            "Posed positions",
          ),
        ),
      ),
    );
  }
  return [
    "linear-bind-and-changed-pose",
    "shared-joints-multiple-skins",
    "skinned-unit-conversion",
  ];
}
