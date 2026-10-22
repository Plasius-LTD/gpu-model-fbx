# ADR0009: Preserve linear FBX skin bindings

Date: 2026-10-22. Status: Accepted for Task25. Parent Feature1151,
coordinator1; inherited remote flag `gpu.model.conversion.enabled`. Package-only,
no capability. This extends ADR0008 and retains ADR0006/0007's dependency boundary.

## Problem

Static profile2 rejects bones and skins. Rendering a default static mesh is not
preservation of skeletal deformation. Shared joints may have different binding
matrices in different meshes, and corner expansion must carry control-point weights.

## Decision

Use published core0.6.0 skeleton/joint/skin and verified JOINTS/WEIGHTS contracts,
runtime0.3.2 acquisition/snapshot authority, and renderer0.4.0 as consumer. No
new dependency or site implementation is required. Pin ufbx/compiler unchanged.
Profile `plasius.fbx-linear-skin/3` and private worker protocol3 transfer fixed
skeletal/pose tables alongside geometry. Snapshot every table/name synchronously
before async verification. Revalidate structure, ownership, cycles, joint TRS,
unit quaternion, palette references, non-singular matrices, indices and weights;
only core grants canonical brands after verifying immutable resource bytes.

Canonical joint identity is deterministic within a source snapshot: joint order
follows source node order; source node/skin/cluster indices and source hash retain
origin mapping. A scene skeleton may contain multiple joint roots; nearest joint
ancestors are linked while scene nodes preserve intervening non-joint transforms.
Joint rest TRS is relative to its scene-node parent. Consumers evaluate scene-node
worlds rather than treating the joint list as a replacement scene hierarchy.
Per-instance skins reference shared joint identities but keep independent palettes
and matrices. Do not assign one global inverse bind matrix to a shared joint.

Positions have geometry-to-node applied exactly once. Therefore inverse bind
matrices are ufbx `mesh_node_to_bone`; retain `geometry_to_bone` and converted
`bind_to_world` separately as metadata. ufbx's explicit FBX Cluster Transform
maps mesh-node space to bone space; TransformLink records link world space.
Explicit bind-pose world matrices are retained after ufbx unit/basis conversion,
before the importer floor-centre offset. Effective joint scene roots receive
the same single floor-centre translation as meshes. Hosts evaluate
`jointWorld * meshNodeToBone * position`, then blend all weights. Do not multiply
by mesh world again. Posing belongs to the host; FBX animation curves remain task27.

## Supported profile and failure policy

64 source nodes/joints,64 skins,128 cluster bindings,8 bind poses/512 entries,
8 influences/control point,30000 expanded corners; retain existing parser/input/
stack/deadline/allocation/WASM ceilings. Verify at most480000bytes/resource and
2160000aggregate bytes, derived from positions/normals/UV0 plus two u8 joint and
f32 weight vec4 sets at maximum corner count. Skeletal protocol tables are bounded
separately. All raw cluster indices/weights are checked before ufbx's consolidated
weight list is used. Weights remain authored (sum tolerance1e-6), padded to4 or8;
no normalization or truncation. Missing/zero-total/invalid weights reject.

Only linear, one-deformer-per-mesh bindings are admitted. Dual quaternion, blend,
rigid, additive/TotalOne, stacked deformers, duplicate bones and non-TRS joint
locals return finite `unsupported-skinning`; numeric weight failures return
`invalid-skin-weights`; capacity failures return `limit-exceeded`. This fail-closed
profile does not claim broader DCC support. Material consent never changes it.

## Alternatives and consequences

Baking the current deformed mesh discards bindings; dropping lesser weights or
substituting linear skinning changes authored motion. Per-mesh duplicate joints
lose shared identity. A new core/renderer contract is unnecessary for this subset.
Shear and stacked-deformer composition require a future owning-package decision
before admission, rather than inventing a private adapter-only representation.

## Validation, release and rollback

See the requirements-derived skin qualification. Numeric tests use hand-derived
bind/changed-pose vertices through actual published renderer palettes, including
unit/basis/geometric conversions, multiple skins, binary compression and8 weights.
Forged messages, snapshot mutation, raw invalid values, mode/capacity failures and
authorization rollback are tested. Require>=80% combined TS/native LCOV with every
changed source represented, strict ESM/CJS, actual browser workers, package
notices/audit/reproducibility and clean installed consumers.

Ship through focused PR, exact-main CI and existing main/cd.yml production OIDC
publication; pipeline owns version/release sections. Verify registry bytes and
provenance before Done. Disable the remote flag and pin a qualified package for
rollback. No backend/ACA, capabilities or remote flag changes are needed. Profile
literal consumers must recompile and deploy worker assets from the same version.
Task25 does not complete tasks26–30, Feature1151 or coordinator1. No FBX exporter
exists; FBX roundtrip is N/A until task29 defines and qualifies an export profile.
