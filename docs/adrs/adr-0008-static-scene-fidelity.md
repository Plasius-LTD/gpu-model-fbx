# ADR 0008: Static FBX scene fidelity

Status: accepted, 2026-10-22. Task24, parent Feature1151, coordinator1.
Remote flag: `gpu.model.conversion.enabled`; no capability for package-only code.

## Problem and decision

The released parser boundary rejected authored attributes/materials and hierarchy.
A static scene cannot be flattened into one mesh without losing source nodes,
material assignment, pivot semantics or nonuniform inherited scale.

Extend this existing package's pinned ufbx bridge; keep core0.6.0/runtime0.3.2 as
published dependencies. Do not duplicate parsing or extend core unnecessarily.
Use ufbx triangulation and polygon-corner indices, with separate vertices at UV
seams. Bake each instance's geometric transform into its attributes only. Store
its effective static local matrix as inverse(parent world) × node world, retaining
source hierarchy and numeric transform/pivot/inherit properties separately.
This compensates nonstandard scale inheritance without adding unowned canonical
transform semantics. It preserves evaluated static poses; it does not promise
editable DCC pivot behavior or animation, which remains task27 scope.

Root world matrices include ufbx's unit/axis conversion. Explicitly retain source
winding during that conversion; reverse emitted triangles exactly when the full
geometry-to-world determinant is negative. Transform normals with inverse
transpose of the geometric matrix, then normalize; the node matrix stays with
the canonical renderer input. Compute world bounds from emitted Float32 geometry,
then subtract one world floor-centre offset from root translations only.

Preserve source node/mesh/material names, axes/units/version and the twelve
numeric node transform properties with their original units/degrees. Canonical
safe keys spell `LclTranslation`, `LclRotation`, `LclScaling` without spaces;
other FBX property names remain unchanged. Names with embedded NUL/unsafe controls
fail. Reject singular or ill-conditioned transformations outside profile bounds.

Map Lambert diffuse/emission/opacity into a named custom Lambert workflow rather
than asserting equivalence to a metallic BRDF. Preserve all20 common FBX material
maps with presence/component counts and the source shader name/type. Phong and
other shader semantics, unsupported channels and colour clamping use core loss
ledgers and deny by default. `allowMaterialLoss:true` consents only to the declared
diffuse preview approximation. Arbitrary custom shader graphs are not preserved;
this remains an explicit loss. Resource/rig/animation exclusions cannot be bypassed
by material consent. No tolerant repairs or full task30 diagnostic mode is implied.

## Alternatives, bounds and impact

Flattening would discard node identity. Naive local matrices would mis-evaluate
componentwise/segment-compensated scale. Extending core with DCC-specific pivot
fields would couple every consumer to FBX despite existing effective matrix and
source-metadata contracts. Source transforms are therefore retained as provenance,
with exact static effective poses at the canonical boundary.

The version2 protocol transfers copied positions/normals/UV0 plus fixed native
node/primitive/material/name tables. The host validates counts, finite values,
normal lengths, parent graph, complete primitive ownership and references before
rehashing/inspecting resources and using the private core document factory.
Total attribute output is960000bytes (30000corners ×8floats); the24MiB parser,
64MiB fixed Wasm,1MiB stack,8MiB entry,50000allocations and10s deadline do not rise.
A fresh worker terminates for all outcomes. No ambient external loading, model
upload, persistence, retry loop or new cache is introduced.

## Tests, dependencies and release

See the requirements-derived [qualification matrix](../design/fbx-static-scene-qualification.md).
Fixtures were added and failed against the released profile before implementation.
Renderer0.4.0 is a new exact dev dependency solely for canonical consumer tests;
no runtime dependency version changes or new packages are introduced. Parser,
compiler and notice pins remain unchanged. The2026-10-22 primary
[advisory read](https://github.com/ufbx/ufbx/security/advisories) still lists the two
September advisories covered by the pinned
[v0.23.1 fixes](https://github.com/ufbx/ufbx/releases/tag/v0.23.1); this is a dated
review, not an assurance against future vulnerabilities.

Review changed bridge/export hashes and require reproducible source/compiled
baseline equality,>=80% combined LCOV and every changed source represented,
unit/native/browser/strict ESM+CJS checks and full dependency audit. Deliver by
PR/exact-main CI and main/cd.yml/production npm publication; verify registry bytes,
provenance and clean installed consumers. UI/SEO/ACA mapping is N/A: no site,
backend, entitlement surface or environment secrets change. Rollback disables the
stored remote flag and pins the last qualified version; local env flags do not
replace that decision. Broader coordinator/Feature acceptance remains incomplete.
