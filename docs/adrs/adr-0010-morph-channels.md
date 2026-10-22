# ADR0010: Preserve FBX morph channels and targets

Date: 2026-10-22. Status: Accepted for Task26 / Feature1151 / coordinator1.
Inherited remote flag: `gpu.model.conversion.enabled`; package-only, no capability.
Extends ADR0008/0009 while retaining ADR0006/0007's pinned dependency boundary.

## Problem and decision

Profile3 rejects morph elements. Baking their default appearance loses authored
channels, sparse membership, targets and deformation. Published core0.6.0 already
provides blendShapes, verified accessors and independent node morphWeights;
renderer0.4.0 exposes those same targets/accessors without baking them. Reuse those
contracts and runtime0.3.2; no owning-package extension or dependency update.

Profile `plasius.fbx-morph/4` and private protocol4 transfer fixed target rows,
position/normal delta arrays, source membership and names. The host snapshots and
revalidates them before yielding. Only core verification grants resource/document
brands. Shared heaps, hidden tails, invalid counts/identities/ranges, duplicate
membership and forged effective weights fail. Match worker assets to package
version and recompile consumers of the exported profile literal.

One source target becomes one canonical blend shape per mesh instance, preserving
shared source shape/channel/deformer identities in sourceMetadata. Names and
channel/threshold/default weights are retained. Sparse control-point membership
is retained in a verified u32 scalar accessor referenced by sourceMetadata's
`affectedControlPointsAccessorId` (omitted for an empty target). Numeric membership
belongs in buffer resources; a potentially30000-entry list must not evade core's
512-element JSON metadata ceiling. Corner-expanded dense deltas preserve zero
values and repeat a source control point across seams/triangles/material groups.

ufbx applies its declared unit/basis conversion policy. Transform position deltas
with geometry-to-node's linear part; never add its translation. Transform normal
offsets by the inverse transpose divided by the length of the transformed base
normal. This keeps base and delta in the same linear normal space; a host
normalizes the final blended normal. Node matrices retain remaining unit/basis
conversion, and the root floor-centre offset is never applied to deltas.

Positive, strictly increasing in-between thresholds are admitted. Canonical
shape/default/node weights carry ufbx's effective piecewise-linear coefficients
at the authored channel default, including negative/default endpoint extrapolation. Revalidate
those coefficients independently on the host. Retained channel metadata allows a
future animation mapper to reconstruct channel-to-target weights. This task does
not claim authored FBX take/layer animation (task27). A host blends morphs in mesh
space before linear skinning or the scene transform. Geometry and bounds remain
at the undeformed base; hosts own dynamic deformation bounds/culling.

## Supported profile and capacities

One blend deformer per mesh, independent additive channels, at most4 targets per
mesh instance and128 instance-targets total. At most120000 expanded target corners
and120000 source membership references, with30000 source control points per mesh.
Retain8MiB input,24MiB parser allocation,50000 allocator attempts,64MiB fixed WASM,
1MiB stack and10s operation deadline. Position/normal morph arrays total at most
2880000bytes; membership resources at most480000bytes. Existing base/skin payloads
at most2160000bytes give5520000aggregate verified bytes, <=480000per resource.
Native/protocol tables are fixed separately and are never retained after import.

Stacked/layered morph deformers, nonpositive/duplicate thresholds, weighted-offset
extensions and orphan morph elements return `unsupported-morph`. Invalid sparse
indices/counts/nonfinite values return `invalid-morph` or parser-level invalid-fbx.
Capacity violations return limit-exceeded. Material loss consent cannot override
these denials. Normal offsets without source base normals reject. Names retain
existing strict bounded Unicode policy. Other unsupported scene/animation element
kinds still fail with unsupported-profile; no silent omission or invented target.

## Alternatives, consequences and qualification

Baking defaults would discard targets; storing authored channel weights directly
as every independent target weight produces wrong in-between deformation. New
private canonical channel types would split ownership and require consumer work.
Instead retain existing canonical targets and source channel metadata, with an
explicit supported interpolation profile. Supporting stacked/layer/weighted
semantics requires separate qualification before expanding admission.

Requirements-derived regressions and the morph qualification cover sparse
positions/normals, seams, source membership, channels/in-betweens/defaults,
instances, skin+morph, compressed binary, coordinate conversions, private trust,
capacity and rollback. Use1e-5 absolute position tolerance for small synthetic
fixtures,1e-8 relative effective-weight validation and Float32 resource precision.
No FBX exporter exists: roundtrip remains N/A until task29; numeric canonical
resource/renderer projection is tested now.

Release through focused signed-off PR, CI after push, exact-main CI and existing
main/cd.yml minor preparation/production OIDC publication. Pipeline owns version
and release entries. Verify registry bytes/provenance and clean installed ESM/CJS
consumers/browser workers before Done. Rollback disables the remote flag and pins
a qualified version. No backend/ACA/configuration/flag mutation is required.
Task26 does not complete tasks27–30, coordinator1 or Feature1151.
