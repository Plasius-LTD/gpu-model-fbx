# ADR0011: Preserve animation takes with explicit sampled motion

Date: 2026-10-22. Status: Accepted for Task27 / Feature1151 / coordinator1.
Inherited remote flag: `gpu.model.conversion.enabled`; no capability for this package.
Extends ADR0006–0010; requirements/plan and fail-first fixtures precede implementation.

## Problem and decision

Profile4 rejects animation. Directly replacing authored curves with sampled motion
would lose layer editing and interpolation semantics without caller knowledge.
Core0.6.0 also rejects empty clips. Owning-package prerequisites core#47 and
renderer#34 released core0.7.0 and renderer0.5.0 before adoption here. Use those
exact public versions, retain runtime0.3.2 acquisition, and preserve the core's
private resource/document identity. No overrides, local dependencies or new package.
The runtime retains its separately versioned acquisition seam; it never brands
our final document. Renderer projection shares core0.7.0 with the producer.

Profile `plasius.fbx-animation/5`, private protocol5, preserves named stacks and
ordered layers with source identities, layer weights/blend/composition flags,
local/reference span presence, original begin/end, time-mode, rate and KTime unit
(46186158000 ticks/second). Empty stacks retain timing but no dummy channel or
resource. Missing names are omitted from canonical metadata, never invented.

For supported node TRS/pre/post rotation/pivot/offset and morph DeformPercent
properties, pinned ufbx evaluates each take at begin+i/rate and the exact end.
A zero-duration nonempty take has one sample. Samples cover all source nodes,
including unchanged ones, and every per-instance morph target. Local transforms
are derived from evaluated world/parent matrices and reconstructed to reject
shear; geometric transforms must remain constant. Geometry/unit/basis policy
remains ADR0008/0009. Only roots receive the one floor-centre offset. Quaternion
signs choose a continuous hemisphere. Effective morph coefficients are per-target,
including in-between shapes; blend morphs before skinning. Rest/defaults remain
unchanged. Static geometry bounds remain base bounds; hosts own dynamic bounds.

Canonical f32 time/TRS/weight accessors and inline sampler arrays match verified
bytes; canonical channels target source node IDs. Duration is end-begin and keys
are zero-based. The original interpreted curves are separate evidence rather
than falsely labeled canonical exact curves. Each ordered layer's curve records
identify source value/curve indices and names (if present), target kind/index,
property/component, default vector and extrapolation. Property indices0–8 mean
LclTranslation, LclRotation, LclScaling, PreRotation, PostRotation, RotationOffset,
RotationPivot, ScalingOffset, ScalingPivot; morph property0 means DeformPercent.

Each record references `fbx-animation-keys` by keyResourceId (only when nonempty),
keyByteOffset and keyCount. A key is seven little-endian Float64 values (56bytes):
interpreted seconds, value, ufbx interpolation enum0 constant-previous/1 constant-next/
2 linear/3 cubic, left.dx, left.dy, right.dx, right.dy. Extrapolation tuples carry
ufbx mode and repeat count. Values/tangents are interpreted source units (morph
percent); runtime samples use canonical units/weights. These are ufbx's resolved
semantics, not raw FBX attribute flags or an exact editable DOM. Retain original
source bytes outside the importer when future export needs them.

Every nonempty sampled take emits a canonical loss record `fbx-animation-sampled`:
source-rate linear interpolation and layer baking approximate between-grid
motion/editability. Default denial returns unsupported-animation and the canonical
report. Only `allowAnimationLoss:true` admits it; material consent is independent.
Unsupported constraints/properties, animated layer weights, mute/solo, changing
geometric transforms, singular transforms or unrepresentable local shear reject,
even with consent. No constraint-baking or general-DCC fidelity claim is made.

## Bounds and trust

Fixed native tables:8 stacks (12 f64 columns),32 layer occurrences (10),128
component curve rows (16),4096 key occurrences (7),256 total frames,64 nodes,
128 per-instance morph targets. Each sampled take has <=120 intervals/121 frames;
rate in(0,120]. Unsupported KTime bases/rates/spans fail. Original times/values
and TRS/weights have a1e6 magnitude ceiling; all numbers must be finite. Names
retain existing512-character safe Unicode policy. Shared/hidden-tail animation
heaps, forged dimensions/indices, holes/trailing tables, key-order/grid/quaternion/
scale errors fail host admission before core verification. All tables/names are
synchronously snapshotted before any asynchronous resource verification.

Retain8MiB input,24MiB aggregate live parser allocations,50000 allocation attempts,
64MiB fixed Wasm,1MiB stack and10s whole operation timeout. Evaluation uses the same
bounded allocator and checks cancellation/deadline between samples; outer worker
termination bounds uncooperative work. Every evaluated scene is freed, and
outstanding parser allocations must be0 before transferring results. No external
file loading, ambient network, persistence, cache or telemetry is introduced.

Extra verified bytes are bounded by256*4 time +256*64*10*4 TRS +256*128*4 weights
+4096*7*8 source keys =1016832. With ADR0010's5520000, maximum6536832 fits the
6600000 aggregate ceiling; per-resource480000 remains. Core's4096 metadata-value
budget, other canonical limits and resource verification remain enforced. Core
limit errors map to finite limit-exceeded, never relaxed validation.

## Alternatives and consequences

Reimplementing curve/layer evaluation would duplicate pinned ufbx and increase
compatibility risk. Canonical exact cubic curves cannot encode all FBX layers,
pivots/inherit behavior and morph in-betweens faithfully. Baking without consent
hides loss; dummy channels misrepresent empty takes. Use explicit sampled motion
plus immutable original semantic evidence. Full editable/export roundtrip remains
Task29; no exporter is available to qualify now.

Public option is additive. The exported profile literal/private protocol advances
to5; match worker assets and recompile profile-literal consumers. Release a minor
through focused PR, exact-main CI and approved main/cd.yml production OIDC path.
The pipeline owns versions/release entries. Verify public registry bytes/SLSA and
fresh installed ESM/CJS, strict declarations and browser consumers before Done.

## Qualification and rollback

See the animation qualification for source fixtures, independent fixed-time skin/
morph/rotation/pivot/axis/unit poses at1e-5 absolute tolerance, original f64 evidence,
binary/compressed data, malformed protocol, limits, cancellation and resource
identity. Float32 precision and source-grid tolerance do not imply arbitrary-scale
or continuous-curve accuracy. Every changed TS/native file must execute in LCOV,
with combined>=80%. No unrelated dependency updates.

Backend remote `gpu.model.conversion.enabled` is evaluated on each operation and
before resource access/allocation; disabled, enabled, rollback and restoration
remain tested. Disable that stored flag for rollback; no local env override or
capability substitute. Package-only: UI/accessibility, SEO, backend transactions
and ACA sensitive secretrefs are N/A; no site/server deployment is performed.
