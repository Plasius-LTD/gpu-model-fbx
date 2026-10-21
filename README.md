# @plasius/gpu-model-fbx

Bounded, worker-backed FBX import through the canonical GPU model boundary.

This repository is the dedicated package boundary defined by ADR 0094.

## Supported import profile

`createFbxImporter` imports the `plasius.fbx-static-triangles/1` profile: FBX 7400
ASCII or binary (including compressed arrays), one static triangle-mesh instance,
at most 10,000 triangular faces. It normalizes world geometry to right-handed
Y-up metres, corrects reflected winding, and floor-centres the result. The core
verifies the output buffer and the complete immutable document. Source name,
units, axes and version remain in the model; errors never echo source text.

Materials, textures, vertex normals/UVs/colours, multiple mesh instances, child
hierarchies, user properties, skins, morphs, animation, cameras, lights and other
element kinds fail with `unsupported-profile`. Unsupported scenes never become
empty models. Broader fidelity and export remain separate work; this release does
not implement general DCC interchange, tolerant repair or an exporter. The legacy
`packageName`/`packageBootstrap` metadata remains compatible.

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
`@plasius/gpu-model-runtime@0.3.1`; canonical validation is owned by
`@plasius/gpu-model-core@0.6.0`. There are no workspace/local package references.
File-provider injections must enforce the supplied byte ceiling while reading.

`FBX_IMPORT_LIMITS` fixes 8 MiB input, 24 MiB aggregate parser allocations,
50,000 allocation attempts and a 10-second whole-operation deadline. Optional
`limits` can only tighten these values. The parser has a fixed 64 MiB Wasm memory,
1 MiB stack, 64-node depth ceiling and 360,000-byte position output ceiling.
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
records the compiled worker boundary, toolchain and qualification decisions.

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
