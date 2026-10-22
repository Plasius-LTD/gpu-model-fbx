import { prepareGpuModelRendererInput } from "@plasius/gpu-model-renderer";

/** Independent requirements assertions run with the real browser worker + published bridge. */
export async function checkGeometry(importer, fixtures, check) {
  const load = (key) =>
    importer.load({
      kind: "uint8-array",
      bytes: new Uint8Array(fixtures[key]),
    });
  const attributes = await load("attributes");
  const view = await prepareGpuModelRendererInput(attributes, {
    conversionEnabled: true,
  });
  check(
    view.primitives.length === 2 &&
      view.primitives[0].materialSlot === 0 &&
      view.primitives[1].materialSlot === 1,
    "Per-face material identity",
  );
  check(
    JSON.stringify([...view.geometry[0].texcoords]) === "[0,0,1,0,1,1]" &&
      JSON.stringify([...view.geometry[1].texcoords]) === "[1,0,1,1,0,1]",
    "Per-corner UV seam",
  );
  check(
    view.geometry.every((g) => g.normals.length === 9),
    "Authored normals",
  );
  const metre = await load("geometryMetres"),
    cm = await load("geometryCentimetres");
  check(
    JSON.stringify(metre.bounds) === JSON.stringify(cm.bounds),
    "Metres/centimetres converted once",
  );
  const mView = await prepareGpuModelRendererInput(metre, {
    conversionEnabled: true,
  });
  check(
    JSON.stringify([...mView.geometry[0].positions]) === "[1,0,0,3,0,0,1,3,0]",
    "Geometric transform retained",
  );
  const hierarchy = await load("hierarchy");
  const parent = hierarchy.nodes.find((n) => n.name === "Parent"),
    child = hierarchy.nodes.find((n) => n.name === "Surface");
  check(
    parent.children.includes(child.id) &&
      child.metadata.sourceInheritType === 0,
    "Hierarchy/inherit metadata",
  );
  const bytes = new Uint8Array(fixtures.phong);
  let denied = false;
  try {
    await importer.load({ kind: "uint8-array", bytes });
  } catch (error) {
    denied =
      error.code === "unsupported-profile" &&
      error.diagnosticReport?.losses.length === 1 &&
      !error.diagnosticReport.accepted;
  }
  check(denied, "Material loss fails closed");
  const consent = await importer.load(
    { kind: "uint8-array", bytes },
    { allowMaterialLoss: true },
  );
  check(
    consent.metadata.materialDiagnosticReport.accepted &&
      consent.diagnostics.length === 1,
    "Explicit material loss consent",
  );
  const bin = await load("binaryAttributes");
  const bView = await prepareGpuModelRendererInput(bin, {
    conversionEnabled: true,
  });
  check(
    bView.geometry[0].texcoords.length === 6 && bView.materials.length === 1,
    "Compressed binary attributes/materials",
  );
  return [
    "scene-material-groups-uv-seams",
    "scene-geometric-cm-metres",
    "scene-hierarchy-inherit",
    "scene-material-loss-consent",
    "scene-compressed-binary-attributes",
  ];
}
