# FBX skeletal qualification

Task25 / Feature1151. Profile `plasius.fbx-linear-skin/3`, protocol3.
See [ADR0009](../adrs/adr-0009-linear-skin-bindings.md) for exact mapping and limits.

| Requirement | Qualification |
| --- | --- |
| Skeleton/bone identity | Deterministic scene-node/joint mapping, nearest joint parent and scene hierarchy; repeated imports have equal canonical documents/hashes. Shared bones across two independently bound mesh skins. |
| Bind/link/mesh matrices | Per-skin inverse binds, source cluster mesh/geometry/link matrices and explicit bind poses retained; published renderer palette evaluated at hand-computed bind and changed poses. |
| Weights | Control-point weights expand with corner order; 4/8 influences, zero entries, binary/compressed arrays; nonfinite/negative/out-of-range/non-unit/zero-total and invalid raw indices reject, never silently normalize/truncate. |
| Coordinates | Equivalent metre/centimetre, Z-up and geometric-translation fixtures; source units/axes retained, root floor-centre offset once; jointWorld*inverseBind convention produces expected positions. |
| Unsupported modes | Explicit finite unsupported-skinning for dual quaternion/blend, additive/TotalOne, stacked deformers and unrepresented joint shear. More than8 influences fails capacity. No loss consent substitutes deformation. |
| Trust/failure | Synchronous ownership of all skeletal/pose tables, shared heaps denied, forged shape/count/reference/weight/quaternion/matrix/TRS rejected, private core verification; allocation/deadline/abort/disposal tests retained. |
| Rollout | Registered remote gpu.model.conversion.enabled; denied before resource/worker allocation, enabled and rollback/restore tested. Package-only, no capability. |
| Portability | Published renderer projection, strict ESM/CJS types/consumers, actual isolated/nonisolated module workers; all workers terminate and persistence remains empty. |
| Reproducibility | Frozen install, no dependency changes, pinned parser/compiler, native+TS LCOV>=80% with every changed source present, artifact hashes/notices, approved exact-main CI/CD, registry integrity/provenance and clean consumers. |

Small synthetic positions use1e-5absolute tolerance, matrices/TRS reconstruction
1e-8relative and unit quaternion/weight sums1e-6. Positions/weight resources use
Float32; general coordinate accuracy remains bounded by Float32 quantization.
The1e6coordinate ceiling is a safety bound, not a micrometre accuracy claim.
A test-only host evaluator changes the Tip joint world translation by1metre;
expected weighted displacement is0,.5,1metre for the three authored vertices.
This validates exposed deformation data without claiming FBX take import or a
production animation evaluator. Arbitrary motion/bounds/culling remain host-owned.

All skin/binary/pose fixtures and host evaluators are self-authored Plasius
Apache-2.0 test assets. No downloaded model/fixture rights are inferred from
ufbxMIT. Parser/compiler/runtime versions and their five notices remain unchanged.
No exporter is present: FBX roundtrip is explicitly N/A until task29 qualifies it.

NFR: security/privacy checked through fixed input/native/protocol/resource bounds,
raw validation, finite errors, denied external transport and no persistence;
reliability through cancellation/deadline/resource disposal and ownership;
performance/scalability through fixed8-influence/corner/skin capacities and no
retained cache; maintainability/testability through ADR/profile and regression
coverage; reproducibility/dependency health through frozen install/audit/signatures
and compiled/public package checks. Observability uses bounded error codes and
canonical ledgers; no telemetry is added. Accessibility/SEO/server transactions/
ACAsecretref are N/A for this library-only change. Actual Chromium qualification
covers the stated isolation modes, not universal browser/device performance.
