# @plasius/gpu-model-fbx

Package boundary and implementation plan for FBX interchange.

This repository is the dedicated package boundary defined by ADR 0094.

## Bootstrap status

This initial repository contains the approved schema baseline, legal and governance files, and a package smoke-test surface. Functional model conversion work is tracked in the repository's [TASK] issues and must flow through the canonical GPU model boundary.

The published API currently exposes `packageName` and `packageBootstrap` metadata.
It does not yet parse, export, animate, or repair FBX files.

## Dependency decision and implementation plan

[ADR 0006](docs/adrs/adr-0006-fbx-dependency-and-licensing-strategy.md)
selects ufbx under its MIT option for the import implementation. The separate
ufbx-write project is the first export candidate, subject to its own qualification;
its work-in-progress status does not establish export fidelity or determinism.
Autodesk FBX SDK is excluded from the default browser/npm distribution. Assimp
remains an alternative if the export candidate cannot meet the declared profile.
No parser, exporter, SDK, or WASM binary is included by this planning change.

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

Requires Node.js 24 and npm.

```bash
npm ci
npm run typecheck
npm test
npm run lint
npm run build
npm pack --dry-run
```

## License

Apache-2.0. See LICENSE, SECURITY.md, and the files under legal/.

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
