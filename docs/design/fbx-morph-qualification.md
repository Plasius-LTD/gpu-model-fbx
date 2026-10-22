# FBX morph qualification

Requirements defined before source implementation in Task26's start/plan comment.
Profile plasius.fbx-morph/4; protocol4. See ADR0010 for mapping and derived limits.

| Acceptance | Evidence required |
| --- | --- |
| Sparse fidelity | Synthetic sparse positions/normals, affected source membership resource, zero deltas, duplicate/index/count/nonfinite failures. Preserve source channel/shape names, defaults and identities. |
| Channels/in-betweens | Independent channels, positive increasing thresholds; defaults0/25/50/75/100/125%, effective coefficients and numeric result; explicit unsupported-morph for stacked/weighted/nonpositive/duplicate semantics. |
| Shared meshes and seams | Per-instance targets with shared source identity; triangulated multi-face/material groups repeat affected corners without altering base attributes. |
| Coordinates | Metre/centimetre, Z-up, reflected basis, geometric nonuniform transforms and translation; deltas use directions and the normal/base normalization convention. |
| Skin composition | Morph mesh positions first, then actual published renderer skin palette; bind and changed-pose numeric results. No FBX take import is claimed. |
| Formats | ASCII, binary and compressed binary sparse shape arrays, including combined skin. |
| Trust and bounds | Native and host counts/ranges, control-point uniqueness, names, effective coefficients, immutable snapshot and shared-heap denial. Fixed capacities/input/parser/deadline/allocator, worker cleanup, no ambient transport/persistence. |
| Rollout | Remote flag read before implementation; disabled/enabled/rollback/restore tests fail before I/O or worker allocation. No capability or local flag substitute. |
| Release | Frozen install, TS/native LCOV>=80% and all changed source files present; strict ESM+CJS, lint/build/artifacts/pack/dry publish, audit/tree/signatures. PR/exact-main CI, main/cd.yml production, registry integrity/provenance and clean installed consumers. |

Small synthetic position results use1e-5 absolute tolerance. Effective coefficient
validation uses1e-8 relative tolerance; output deltas use Float32. Coordinate
ceilings are safety bounds, not universal precision promises. Bounds represent
the undeformed base; host dynamic bounds/culling must include deformation.
The independent test-only host evaluator reads published renderer accessors and
per-node weights, blends morphs, then applies scene transforms/skin palettes.

All morph fixtures (ASCII/binary/compressed) and host evaluators are self-authored
Plasius Apache-2.0 test assets, containing no PII or downloaded models. ParserMIT
licensing does not grant fixture rights; none are inferred. Five existing parser/
compiler notices and pinned upstream/compiler versions remain unchanged.
No exporter exists; FBX roundtrip remains N/A pending Task29 rather than waived
export acceptance. Canonical resource and renderer deformation are verified now.

NFR disposition: security/privacy checked through raw input/table/resource bounds,
shared-heap denial, transport denial, immutable verified payloads, finite errors
and no persistence/telemetry; reliability through deadlines/cancellation/cleanup;
performance/scalability through fixed target/corner/membership/allocator capacities
and no cache; maintainability/testability through ADR/profile/regressions;
observability through bounded error codes/source ledgers; reproducibility and
dependency health through clean installs, audits, signatures, immutable source/
compiler and package integrity. No dependency version change. Accessibility/SEO/
server transactions/backendACAsecretref are N/A for this package-only change.
Actual isolated/nonisolated browser workers qualify that tested engine, with no
universal browser/device performance claim.
