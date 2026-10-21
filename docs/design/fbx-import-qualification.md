# FBX bounded import qualification

Task23 / Feature1151. Profile: `plasius.fbx-static-triangles/1`.
This profile implements the parser/resource boundary; tasks24–30 retain broader
geometry/material/hierarchy, rig/morph/animation/resource/export and repair work.

| Requirement | Check and limit |
| --- | --- |
| Routing and full parsing | Content sniff then pinned ufbx; FBX7400 ASCII/binary, compressed arrays. Names/extensions alone are insufficient. |
| Supported data | Exactly one mesh instance, triangular faces, at most10000 triangles. Other element kinds, user properties, child hierarchy, normals/UVs/colours and DCC features fail explicitly. |
| Canonical fidelity | Right-handed Y-up/metres, reflected winding corrected, floor-centred positions; original units/axes/version/name recorded. Position tolerance1e-5metres. No unsupported model becomes empty. |
| Acquisition | Published runtime0.3.2;8MiB entry ceiling,1attempt, caller signal/integrity, total10s deadline. Trusted file providers enforce limits during reading. |
| Native limits | Shared temp/result allocator24MiB,50000attempts,64node depth; fixed64MiBWasm,1MiBstack,10000triangles/30000vertices/360000output bytes. Only tightening permitted. |
| Cancellation | Progress deadline and optional atomic abort word; hard termination for hanging producers/workers, failed authorization and disposal. One active operation/importer. |
| Ownership | Transfer a bounded input copy; free native input and all parser allocations, transfer only copied positions; terminate fresh worker on every settlement. Caller owns returned core payloads. |
| Privacy/security | No native stdio/external loading, no worker ambient transports, no model upload/storage/analytics. Safe finite error codes; no raw upstream error, source paths or payload logged. |
| Core contract | Revalidate output shape/counts/finiteness, rehash and inspect bounded output resources, then construct a privately verified core0.6.0 document. |
| Browser | Actual module worker in isolated and non-isolated Chromium; denied-before-I/O, rollback/restore, ASCII/binary/compressed/URL, malformed/unsupported/array rejection,20repetitions, active abort and uncooperative deadline termination; all workers released and browser stores empty. |
| Reproducibility | Immutable source SHA256/compiler revision/flags and reviewed glue/Wasm hashes; repeated local build, CI/CD baseline equality, published registry/provenance and clean consumers. |

## Fixtures and rights

`tests/fixtures/fbx.ts` and the binary writer are self-authored Plasius Apache-2.0
test code. The triangle coordinates, generic names and compact ASCII/binary
containers are synthetic; no downloaded example models, Autodesk SDK assets or
third-party fixture rights are assumed. Compressed-array counts intentionally
disagree in the adversarial fixture. ufbx rejects that malformed length before
allocation. A second compressed fixture has a consistent declared/actual count
(4,200,000 doubles,33.6MB expanded) and must hit the shared24MiB allocation
ceiling; it runs in native coverage, worker integration and both browser modes.
The caller-mutation regression also proves the imported payload matches its
source identity across asynchronous hashing using published runtime0.3.2.
ESM and built CJS consumers must recognize the returned private core brand.

Native coverage uses the same bridge and parser compiled to instrumented Wasm,
with a test-only in-memory profile filesystem. The production build disables its
filesystem and carries no profiling runtime. LLVM exports its real counters to
LCOV and the native report is appended to TypeScript LCOV. Tests require>=80%
native lines and existing TypeScript thresholds; every changed runtime source
must appear in combined LCOV. Instrumentation is not a native/WASI substitute for
browser execution; both worker smoke and browser qualification remain required.

## Limits of evidence and NFR disposition

Security/privacy, allocation/decompression/failure bounds, cancellation,
maintainability/testability, package portability and build/release provenance are
checked by the matrix. Worker-lifecycle counters and zero outstanding native
allocations establish parser-resource release; they do not assert browser GC timing
or zero caller-owned model memory. Wall-clock deadlines bound failure; these tests
are not a general FBX performance or DCC conformance benchmark. Only Chromium is
directly qualified here; other browser engines remain unqualified.

There is no product UI, route, backend, transaction, telemetry stream or production
data store. Accessibility/SEO, distributed scaling and ACA secretref validation
are N/A to this package release. The host's eventual UI must meet WCAG2.2AA and
its integration/release requirements. Observability uses safe error codes; no
automatic logging is added. Dependencies are pinned only for the required core,
runtime and reproducible browser/bundler tests. Production rollout remains the
stored feature flag and normal main/cd.yml/production package release.
