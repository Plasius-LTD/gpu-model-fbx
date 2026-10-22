# FBX animation qualification

Task27 requirements/plan and profile tolerances were recorded before implementation.
See ADR0011 for mappings, source evidence layout, capacities and rollout.

| Acceptance | Requirements-derived evidence |
| --- | --- |
| Takes/timing | Multiple/named/empty/zero-duration clips; negative/nonzero starts, local/reference spans, KTime unit,24/30/60/120/fractional rates, exact final endpoint, deterministic documents. |
| Curve evidence | Constant/linear/cubic interpreted enum, original seconds/value/tangents/extrapolation/default vectors, verified f64 source resource, ordered layer identities/weights/blend flags. |
| Loss boundaries | Separate animation/material consent; default sampled denial; explicit sampled/layer-baked diagnostics; unsupported property, geometric animation, mute/solo and animated layer weight denial. |
| Numeric poses | Independent test-only renderer-buffer evaluator, five fixed times0/.25/.5/.75/1, combined skin+morph, in-between targets, cm/m and Z-up, rotation/pre/post/pivots. Position tolerance1e-5; f32 TRS/coefficients and f64 interpreted evidence. |
| Formats | Self-authored ASCII and binary/compressed animation time/value arrays with combined skin+morph. No external/DCC assets. |
| Trust | Synchronous snapshots, malformed table dimensions/counts/ranges, source-rate/key ordering, quaternion/scale checks, shared/hidden-tail heaps, immutable payloads, forged-document denial, canonical combined metadata budget. |
| Limits/lifecycle | Boundary4096 keys,121 frames/take, total256 frames; overflows, finite rates; existing parser/input/alloc/deadline/cancellation/busy/disposal/transport/persistence tests. Instrumented native parse/evaluation frees all allocations. |
| Public packaging | Unit/native LCOV>=80% with each changed source represented; lint/build/types, frozen install, artifact baseline, pack/dry publish, npm tree/audits/signatures, installed ESM/CJS/types/browser. |
| Delivery | Focused PR and exact-main CI, approved main/cd.yml production release, registry bytes/integrity/provenance and clean installed consumers before Project Done. |

All animation fixtures, binary encoder extensions and test-only host evaluator are
Plasius-authored Apache-2.0 assets. No model downloads, personal data or inferred
fixture rights. Existing MIT parser/source pins and compiler notices remain;
parser licensing is separate from fixture rights. No exporter exists: roundtrip
is explicitly N/A until Task29 and is never inferred from import tests.

NFR evidence: input/table/resource/name bounds and immutable identities for
security; transport denial/no telemetry/cache/persistence for privacy; finite
errors, cancellation/deadline/termination/one-worker concurrency for reliability;
fixed input/parser/native/sample/aggregate capacities for performance/scalability;
strict TS, dedicated animation module, ADR/TDR and requirements tests for
maintainability/testability; finite loss/error reports for observability; pinned
source/compiler, artifact hashes, clean installs and registry signatures for
reproducibility/dependency health. UI/accessibility/SEO and backend data/ACA
secretrefs are N/A for this package-only delivery. Browser qualification covers
the tested engine/isolation modes without claiming all devices or DCC formats.

Unsupported animation rejection includes a canonical strict diagnostic report
(`fbx-animation-unsupported`) without source text. This blocking record remains
rejected with loss consent: unsupported constraints are never silently baked.
