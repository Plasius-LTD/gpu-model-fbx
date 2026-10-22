# TDR 0001: FBX implementation and qualification

Date: 2026-10-21. Decision: [ADR 0006](../adrs/adr-0006-fbx-dependency-and-licensing-strategy.md).
Parent Feature: site 1151. Bootstrap: site 1167/package 22.
Existing [coordinator 1](https://github.com/Plasius-LTD/gpu-model-fbx/issues/1)
keeps its complete adapter acceptance. This records the original dependency plan from bootstrap22. Task23 established
the bounded import profile; Task24 extends static scene fidelity. Remaining
rig/resource/animation/export/conformance tasks retain their own delivery gates.

## Work packages and dependency order

Every task is in the organisation Project and belongs to Feature 1151. Tasks
inherit `gpu.model.conversion.enabled`, strict-by-default fault tolerance, and
the canonical ownership decision. No capability is added.

| Task | Scope and requirements-derived evidence | Prerequisites |
| --- | --- | --- |
| [23](https://github.com/Plasius-LTD/gpu-model-fbx/issues/23) | Bounded ASCII/binary import; pinned MIT source, compiler/WASM provenance, lazy worker, abort/termination/disposal, real browser and public-module qualification. | Released dependency decision 22 |
| [24](https://github.com/Plasius-LTD/gpu-model-fbx/issues/24) | Geometry/materials, pivots/hierarchy, original units/axes; cm/m, handedness/winding, negative/nonuniform transform and canonical-renderer fixtures. | 23 |
| [25](https://github.com/Plasius-LTD/gpu-model-fbx/issues/25) | Skeleton identity, bind poses, cluster weights; linear skinning and diagnosed unsupported modes; evaluated deformed fixtures. | 24 |
| [26](https://github.com/Plasius-LTD/gpu-model-fbx/issues/26) | Sparse blend shapes, channel defaults/in-betweens; explicit loss boundaries and combined deformation tests. | 24 |
| [27](https://github.com/Plasius-LTD/gpu-model-fbx/issues/27) | Named takes/stacks/layers, time spans/rates/interpolation, bone/morph curves; measured sampling/baking losses and fixed-time poses. | 25, 26 |
| [28](https://github.com/Plasius-LTD/gpu-model-fbx/issues/28) | Embedded/relative textures, binding/color space/resource identity; bounded integrity-aware acquisition, path/scheme policy and independent asset rights. | 23 |
| [29](https://github.com/Plasius-LTD/gpu-model-fbx/issues/29) | Qualify exporter candidate and canonical subset; deterministic IDs/order/time/compression/resources, repeated byte equality and independent reader roundtrip. | 24–28 |
| [30](https://github.com/Plasius-LTD/gpu-model-fbx/issues/30) | Strict/tolerant/forensic diagnostics and end-to-end conformance; malformed/resource-exhaustion/repair/loss evidence and fixture inventory. | 23–29 |

Define conformance fixtures early with task 30; implementation closure follows
the dependency order. Do not postpone malformed-input or bounded-worker tests
until final integration. Tasks 25/26 are independent after 24, and 28 after 23;
this describes dependencies, not authorization for concurrent claims.

## Canonical and runtime boundaries

`@plasius/gpu-model-core` owns documents, resources, validation, skin/morph/timing
contracts and repair/loss records. `@plasius/gpu-model-runtime` owns acquisition
and orchestration. `@plasius/gpu-model-renderer` projects canonical outputs; it
does not parse FBX. Use published versions and release extensions in the owning
package first. Conversion must preserve authored source metadata alongside any
canonical coordinate normalization and name its supported profile.

The implementation must map source control-point/polygon-vertex indexing,
triangulation and UV/material association deliberately. Do not apply unit/axis
conversion twice or drop bind transforms, pivots, blend channels or animation
layers just because a renderer has a narrower view. Unsupported values need
explicit fidelity evidence; a successful parse alone is not preservation.

## Browser, failure and resource policy

The ufbx header provides allocator memory/allocation controls, progress
cancellation, optional external-file loading and host file callbacks. Configure
these explicitly in task 23. Disable implicit native/file/network access; route
all external resources through admitted runtime requests. Reject traversal,
local absolute paths and unapproved schemes; preserve the host's integrity,
redirect, origin and authorization rules. A worker must have no ambient file or
credential authority.

Before implementation, define numeric entry/aggregate/decompressed/vertex/image,
allocation/stack and output limits, worker memory maximum, total deadline and
finite request policy in tests. Values must be derived from the declared workload,
not inherited silently from unlimited parser defaults. Cancellation must bound
uncooperative producers and parser work through worker termination. Test repeated
load/free/dispose, use-after-free boundaries and transfer ownership. Do not claim
that native WASI testing proves a browser worker or that progress callbacks can
interrupt every synchronous instruction.

Strict is default. Tolerant mode repairs only allowlisted recoverable conditions
and records before/after evidence. Forensic mode keeps bounded safe source evidence
and loss/repair ledgers; it is not permission to log model payloads, filesystem
paths or credentials. Reuse the family fault-tolerance policy and validators.
Cache identity must include external revisions and relevant options; no entry-URL
cache may silently serve stale nested resources.

## Export and dependency qualification

ufbx-write is a separate MIT candidate, not a write function supplied by ufbx.
Task 29 must prove its supported mesh/material/skin/morph/take/resource profile
and reproducible browser/native build. Repeated output must match after fixing
non-semantic metadata; compare normalized semantics through the independent
reader at declared numeric tolerances. Never hide unsupported animation by
inventing motion or calling a baked result exact preservation.

An Assimp fallback requires an explicit backend decision, component/license
inventory, build-size/memory measurements and canonical mapping evidence. Its
reviewed exporter constructs creation timestamps; deterministic behavior cannot
be assumed from an export API. Autodesk integration remains excluded by ADR0006.

Record upstream revision/license, local patches, compiler/runtime flags and
artifact hashes; ship required notices in source and npm/WASM distributions.
Audit maintained supported versions at adoption. Synthetic fixtures are preferred;
third-party example-model rights are independent of parser licenses. No automatic
SDK download, agreement acceptance or new public npm wrapper is authorized here.

## Validation and release acceptance

Implementation tasks must establish failing regressions/fixtures before changes,
run >=80% coverage with all changed source files in LCOV, strict declarations,
unit/integration/browser/roundtrip tests and clean public ESM/CJS consumers.
Pin dependencies only for scoped compatibility/security needs. Record NFR checks
for input/resource security, privacy, reliability, portability, memory/performance,
testability and diagnostics, plus explicit N/A reasons for UI/SEO/server concerns.
No runtime benchmark or fidelity claim follows from this documentation review.

For bootstrap 22/1167, review the source/license comparison, task/Project/native
parent/dependency links, baseline files and Markdown links. Rerun existing tests,
typecheck, lint, build, full dependency audit/tree/signatures, package and private
artifact checks. No new runtime behavior means no invented parser regression.
Release the README through normal PR/CI, approved `main`/`cd.yml` production
patch release, exact registry integrity/provenance and installed metadata checks.
Retain the bootstrap status in public APIs until a separate implemented profile
is qualified. The feature flag is an implementation gate, not a claim of an
already-shipped converter. Rollback uses its remote decision and a qualified
pinned package; no new local environment control or backend deployment applies.

## Task24 static scene implementation

Task24 implements the profile and bounds in [ADR0008](../adrs/adr-0008-static-scene-fidelity.md)
and [the static scene qualification](../design/fbx-static-scene-qualification.md).
Core0.6.0 already represents effective matrices, source metadata, attributes and
loss ledgers; no owning-package extension is required. Renderer0.4.0 is pinned
as a development-only consumer check; existing runtime dependencies do not change.
Task24 completion does not complete tasks25–30 or Feature1151/coordinator1.

## Task25 linear skeletal bindings

Task25 extends the supported profile through [ADR0009](../adrs/adr-0009-linear-skin-bindings.md)
and [the skin qualification](../design/fbx-skin-qualification.md). Published
core0.6.0 and renderer0.4.0 already cover the admitted skeletal representation;
no dependency changes or owning-package extension is needed. Complete weight
rows and accessor payloads agree; per-skin inverse binds preserve shared joint
identity. Unsupported deformation composition and joint shear reject explicitly.
Task25 does not complete remaining tasks26–30 or Feature1151/coordinator1.
