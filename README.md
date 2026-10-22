# @plasius/gpu-model-fbx

Bounded, worker-backed FBX import through the canonical GPU model boundary.

This repository is the dedicated package boundary defined by ADR 0094.

## Supported import profile

`createFbxImporter` imports the `plasius.fbx-animation/5` profile: FBX 7400
ASCII or binary (including compressed arrays), static mesh instances and source
hierarchies, bones, linear skin clusters, sparse morph channels/targets and bounded animation takes. Polygons of 3–64 corners are triangulated by pinned ufbx, with
per-corner normals/UV0 and per-face material groups preserved. The profile allows
64 source nodes, 32 materials, 128 material groups and 10,000 triangles across all
instances. Positions use Float32 resources; matrices retain double precision.

The importer converts axes and units to canonical right-handed Y-up metres once.
Geometric transforms affect mesh attributes only. Effective local matrices
preserve evaluated static FBX pivots and all three inherit modes, including
nonuniform/negative scale. Reflected winding and inverse-transpose normals remain
consistent. Only root translations receive the single world floor-centre offset.
Source units/axes/version, node/mesh/material names, numeric transform properties,
rotation/inherit modes and the 20 common FBX material maps remain in metadata.
Names with control characters and singular transforms fail explicitly.

Lambert diffuse/emission/opacity factors map to a named custom Lambert workflow;
consumers must support that workflow. Phong/other shader lobes, unsupported
material channels and out-of-range colour preview clamping produce canonical
`loss` records. Import rejects these by default with `unsupported-profile` and
`error.diagnosticReport`. A caller may explicitly use `{ allowMaterialLoss: true }`
for the diffuse preview approximation; inspect `document.diagnostics` and
`document.metadata.materialDiagnosticReport`. Common numeric source maps and the
shading-model name are retained; arbitrary custom shader graphs are not preserved.
Consent never admits unsupported scene elements or resource acquisition.

Textures, additional UV sets, vertex colours/tangents, user properties,
cameras, lights and other element kinds still fail with
`unsupported-profile`. Unattached meshes and unsupported scenes never become
empty models. Texture/export/repair work remains in tasks28–30;
this package does not yet implement general DCC interchange or an exporter.
The legacy `packageName`/`packageBootstrap` metadata remains compatible.

Linear skins retain deterministic source-scoped bone identity, hierarchy,
per-instance palettes, and independent inverse bind matrices when meshes share
bones. Cluster mesh-node-to-bone, geometry-to-bone and link-to-world matrices,
plus explicit bind poses, remain in metadata. Geometry transforms are baked into
attributes once, so canonical skin matrices use the mesh-node-to-bone convention.
The published renderer bridge exposes the palette and verified JOINTS/WEIGHTS
accessors; hosts own pose evaluation (`jointWorld * inverseBind * position`).
The bridge exposes animation samplers; the host applies the sampled pose before skinning.

The profile admits at most64 joints,64 mesh-instance skins,128 cluster bindings,
8 bind poses/512 pose entries and8 influences per control point. Corner expansion
preserves weights through triangulation/material seams. Weights must be finite,
non-negative, in[0,1] and sum to1 within1e-6; zero entries are permitted but
zero-total vertices fail with `invalid-skin-weights`. No truncation, normalization
repair or invented fallback joint occurs. JOINTS/WEIGHTS use4 or8 padded slots.
`unsupported-skinning` explicitly denies rigid/dual-quaternion/blended methods,
additive/TotalOne cluster modes, stacked deformers, duplicate-bone palettes and
joint-local shear that cannot be preserved as canonical rest TRS. Capacity
violations return `limit-exceeded`. No loss consent overrides these denials.

See [ADR0009](docs/adrs/adr-0009-linear-skin-bindings.md) and
[the skin qualification](docs/design/fbx-skin-qualification.md) for conventions,
limits and test evidence. Static profile2 inputs remain supported; the exported
profile literal and private worker protocol advance to5, requiring matching
package worker assets and recompilation of literal-typed profile consumers.

Morphs retain sparse source control-point membership in verified u32 accessors,
expanded position/normal deltas, target/channel names and source identities.
`blendShapes` exposes independent targets; node `morphWeights` and shape
`defaultWeight` expose effective coefficients at the authored channel default.
Source metadata retains `channelWeight`, `targetWeight`, `keyIndex`,
`affectedControlPointCount` and `affectedControlPointsAccessorId` when nonempty.
Positive increasing in-between thresholds preserve every target, including targets
with zero default contribution. Apply morphs in mesh space before skinning or the
scene transform; normalize the blended normal. Deltas receive geometric linear
transforms once and never receive translation. Node matrices carry any remaining
unit/basis conversion. Bounds describe the undeformed base; hosts own posed bounds.

At most4 targets per instance,128 instance-targets,120000 expanded target corners
and120000 source membership references are admitted. Stacked/layered deformers,
weighted-offset extensions, orphan elements and nonpositive/duplicate thresholds
fail with `unsupported-morph`; invalid sparse data fails with `invalid-morph` or
`invalid-fbx`. Normal offsets require base normals. No consent bakes or drops
unsupported targets. See [ADR0010](docs/adrs/adr-0010-morph-channels.md) and
[the morph qualification](docs/design/fbx-morph-qualification.md). Authored morph defaults remain separate from sampled take weights.

Animation takes retain names, ordered layers, static weights/blend modes, local
and reference spans, original start/end, KTime seconds and clip frame rate. Empty
takes have no samplers, channels or invented motion. Nonempty takes evaluate node
TRS/pivots and independent bone/morph channels on a source-rate grid, including
both endpoints, then expose zero-based canonical linear samplers. Root samples
receive the same floor-centre offset as rest transforms. Quaternions retain unit
length and a continuous hemisphere; morph coefficients use canonical target order.

Sampling and layer baking require separate `{ allowAnimationLoss: true }` consent.
Material consent does not authorize animation approximation. Inspect
`document.metadata.animationDiagnosticReport` and `fbx-animation-sampled` diagnostics.
The original interpreted key times/values/interpolation/tangents/extrapolation and
layer identities remain source evidence; samples do not claim exact curves,
between-grid fidelity, layer editability or FBX DOM roundtrip. Source key evidence
is a verified little-endian Float64 resource described in
[ADR0011](docs/adrs/adr-0011-animation-takes-and-sampling.md).

The animation profile permits 8 takes, 32 layer occurrences, 128 component curve
rows, 4096 source key occurrences, 256 total sampled frames and 121 frames per
take; rates are finite in (0,120]. Reused layers/curves count per occurrence.
Canonical metadata additionally has its published 4096-value aggregate budget;
combined scenes exceeding it fail `limit-exceeded`. Unsupported animated properties,
constraints, animated layer weights, mute/solo, changing geometric transforms,
singular scale and local shear fail closed with `unsupported-animation`.
No consent discards those semantics. See [the animation qualification](docs/design/fbx-animation-qualification.md).

```ts
import { createFbxImporter } from "@plasius/gpu-model-fbx";

const importer = createFbxImporter({
  // Use your authoritative stored remote decision on every evaluation.
  resolveFeatureFlag: key => featureFlags.evaluate(key),
  // Copy the package's dist directory to this admitted same-origin location,
  // or use your bundler's module-worker asset support.
  createWorker: () => new Worker("/vendor/fbx/fbx-worker.js", { type: "module" }),
});
try {
  const document = await importer.load({ kind: "blob", blob: selectedFile });
  consumeCanonicalDocument(document);
} finally {
  importer.dispose();
}
```

The host supplies the trusted worker factory and runtime acquisition ports. Keep
the worker's shared chunk and `ufbx.mjs` alongside it. ESM and CJS consumers share
the same public API; `@plasius/gpu-model-fbx/worker` resolves the module-worker
asset and `/provenance` resolves its build manifest. Use a bundler with dynamic
import splitting to retain lazy core/runtime acquisition. No parser or worker is
allocated at import/constructor time or while the remote gate denies access.

The API accepts canonical `ModelSource` descriptors and optional caller signal
and integrity evidence. Runtime acquisition is reused from the published
`@plasius/gpu-model-runtime@0.3.2`; canonical validation is owned by
`@plasius/gpu-model-core@0.7.0`. There are no workspace/local package references.
File-provider injections must enforce the supplied byte ceiling while reading.

`FBX_IMPORT_LIMITS` fixes 8 MiB input, 24 MiB aggregate parser allocations,
50,000 allocation attempts and a 10-second whole-operation deadline. Optional
`limits` can only tighten these values. The parser has a fixed 64 MiB Wasm memory,
1 MiB stack and 64-node depth ceiling. Each attribute buffer is at most
480,000 bytes; all verified resources total at most 6,600,000 bytes (derived maximum 6,536,832).
Native node/material/primitive/name skeletal and morph tables have fixed capacities.
Each importer admits one operation at a time, creates one fresh worker, and
terminates it on success, failure, abort, timeout or disposal. It retains no model
cache. Returned model payloads belong to the caller; no engine GC timing claim
is implied by disposal. A shared abort word is used when isolation permits it;
hard termination works without cross-origin isolation. If the host uses COOP/COEP,
serve its worker scripts with the matching embedding policy too.

The worker accepts only bounded message bytes, disables ambient transports and
implicit external files, and embeds Wasm in its fixed JavaScript asset. It has no
Node/native SDK dependency. No network upload, persistence or telemetry is added.
Errors use finite `FbxImportError.code` values. For an unsupported profile, retain
the source for a future qualified adapter rather than weakening validation.

## Dependency decision and implementation plan

[ADR 0006](docs/adrs/adr-0006-fbx-dependency-and-licensing-strategy.md)
selects ufbx under its MIT option for the import implementation. The separate
ufbx-write project is the first export candidate, subject to its own qualification;
its work-in-progress status does not establish export fidelity or determinism.
Autodesk FBX SDK is excluded from the default browser/npm distribution. Assimp
remains an alternative if the export candidate cannot meet the declared profile.
The importer pins ufbx v0.23.1 / `26a482ae66871d7de36eb722aa060bce95bce274`
under MIT. [ADR 0007](docs/adrs/adr-0007-bounded-browser-fbx-import.md)
records the compiled worker boundary and toolchain.
[ADR 0008](docs/adrs/adr-0008-static-scene-fidelity.md) and
[the geometry qualification](docs/design/fbx-static-scene-qualification.md)
define static mapping, losses, tolerances and qualification evidence.

[TDR 0001](docs/tdrs/tdr-0001-fbx-implementation-and-qualification.md)
maps the dependency review to tracked import, geometry/metadata, skinning,
blend-shape, animation, resource, export, and diagnostic work. It defines the
license-notice, browser worker, resource-budget, fidelity, and release evidence
required before those implementations ship. Runtime acquisition and canonical
contracts belong to the existing `@plasius/gpu-model-runtime` and
`@plasius/gpu-model-core` packages.

## Rollout

- Feature flag: gpu.model.conversion.enabled
- Capability: none for this package-only layer
- Rollback: disable the feature flag and keep the published package version pinned to the last validated release

## Development

Requires the pinned Node.js version in `.nvmrc`, npm, and Emscripten 5.0.7.
Install the official SDK at immutable installer revision
`d7b4130688bfa348392b921ab04015aa15c4f154`, then run `emsdk install 5.0.7`
and `emsdk activate 5.0.7`. Set `EMCC` to its absolute
`upstream/emscripten/emcc` path. No global installation or SDK EULA is required.
Builds fetch only hash-verified immutable upstream files into `.fbx-build-cache/`;
set `FBX_BUILD_CACHE` to choose another local cache.

```bash
npm ci
npm run typecheck
npm test
npm run lint
npm run build
npm run test:coverage
npm run artifacts:fbx
node node_modules/playwright-core/cli.js install chromium --only-shell
npm run test:browser
npm pack --dry-run
```

## License

Apache-2.0 for package-owned code. ufbx and Emscripten use their selected MIT
options; musl and compiler-rt retain their component notices. See
`legal/third-party/`; identical notices, the bridge and a source/compiler/glue/Wasm
hash manifest ship in npm. The reviewed baseline is `native/artifact-baseline.json`.
`artifacts:fbx` rejects a changed baseline, non-fixed memory, missing notices or
unexpected module artifacts. Synthetic fixture rights are recorded separately in
[the qualification design](docs/design/fbx-import-qualification.md).

<!-- BEGIN PLASIUS RELEASE INTEGRITY -->
## Release integrity

CI keeps the administrative contributor registry outside Git and npm package
artifacts using exact, case-normalised path checks. CI runs on explicit
GitHub-hosted runners. Publication uses the GitHub-hosted `production` job with
Node 24 and a pinned npm 11.6.2 client. It is token-free and proceeds only while
the prepared SHA is the exact `main` head after successful push-triggered CI.
The completed `0.1.0` bootstrap path has been removed; subsequent releases must
use npm trusted publishing.
<!-- END PLASIUS RELEASE INTEGRITY -->

Unsupported animation rejection includes a canonical strict diagnostic report
(`fbx-animation-unsupported`) without source text. This blocking record remains
rejected with loss consent: unsupported constraints are never silently baked.
