# FBX static scene qualification

Task24 / Feature1151. Profile `plasius.fbx-static-scene/2`, worker protocol2.
See [ADR0008](../adrs/adr-0008-static-scene-fidelity.md).

| Requirement | Evidence and profile boundary |
| --- | --- |
| Meshes/attributes | Self-authored ASCII polygons, binary/compressed arrays, indexed per-corner normals/UV0, UV seams and per-face material groups through published renderer0.4.0. Polygons3–64corners; total10000triangles/30000corners across instances. Other vertex attributes/UV sets reject. |
| Units/basis | Equivalent cm/m fixtures with geometric translation/scale; right/left-handed and Z-up fixtures, reflected winding consistent with transformed authored normals. Explicit root conversion once; no per-mesh re-normalization. |
| Transforms | Parent/child hierarchy, nonuniform/negative scale, rotation pivot, all3FBX inherit modes, geometric transforms and separately transformed instances. Effective local matrices reproduce hand-derived world vertices. Geometric transforms do not leak to other instances or children. Source pivots/pre/post rotations/offsets/scaling and rotation/inherit metadata retained. Singular/near-singular effective matrices reject. |
| Materials/loss | Lambert diffuse/emission/opacity factors plus source name/shader/common maps; custom Lambert workflow. Phong/unknown/unsupported channels/coloured transparency/clamped previews require explicit consent with core loss records. Denial error carries a frozen safe report; accepted documents retain report and diagnostics. No custom graph fidelity claim. |
| Determinism | Repeated same source yields equal canonical documents/resource hashes; grouping follows source node/material slot order, not nondeterministic hash order. |
| Resource identity | Runtime snapshots input before async hash; output arrays copied into immutable Blobs and privately reverified. Workers cannot transfer a canonical brand. The complete bounded message is snapshotted synchronously before async verification; shared output heaps are rejected. Max360000bytes/resource and960000aggregate; node64/material32/primitive128 tables fixed. |
| Failure/security | Protocol shape/length/count/graph/cycle/material/ownership/finiteness/unit/axis/name/normal/UV tests. Native allocation/decompressed-array bounds, malformed inputs, unsupported scene elements and hard worker deadlines remain exercised. Disabled before I/O; rollback/restore and per-operation authorization remain enforced. |
| Browser/performance | Real isolated/non-isolated module workers, published renderer projection, bounded URL reads, repeated operations, active abort and hard deadline termination; worker count returns to0 and persistence remains empty. Numeric fixture runtime measured by the test runner; no universal throughput/device claim. |
| Reproducibility/dependency | Frozen npm install, registry-only dependencies, pinned ufbx/compiler/flags, native+TypeScript coverage, exact compiled artifact/notice baseline, pack checks and clean published ESM/CJS declarations/consumers. Only renderer0.4.0 added as dev verification dependency. |

Positions are Float32 and matrices double precision. Small synthetic fixture
coordinates/matrices/normals/UVs use1e-5absolute tolerance. General imported
positions retain normal Float32 quantization (relative error up to about1e-7);
the profile's1e6coordinate ceiling is a resource/numeric bound, not a claim of
micrometre accuracy at that magnitude. Original source identity is retained.

`tests/fixtures/scene.ts`, extensions to the synthetic binary writer and every
new numeric fixture are self-authored Plasius Apache-2.0 test assets. No downloaded
models, textures or upstream test fixture licenses are inferred from the MIT
parser. Parser/compiler/runtime legal notices are unchanged and must remain
byte-identical in source and npm artifacts. The reviewed manifest's bridge/glue/
Wasm hashes change only for the new bounded mapping and exported table getters.

NFR acceptance: security/privacy checked through finite error/protocol boundaries,
no external parser authority and denied transport/persistence; reliability through
abort/deadline/budget/ownership tests; maintainability/testability through tracked
profile/ADR and>=80%native+TS LCOV with every changed source represented; performance
through fixed limits and bounded worker lifecycle; portability through actual
Chromium isolation modes and strict ESM/CJS consumers. Accessibility, SEO, server
auth/transaction/telemetry/ACA secretref are N/A for this package-only change.
This does not claim full browser/device coverage or graphical material equivalence.
