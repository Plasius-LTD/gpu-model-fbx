# ADR 0007: Bounded browser FBX import

Status: accepted, 2026-10-21. Delivery: package Task23, parent Feature1151;
coordinator1 and fidelity tasks24–30 remain independent. Inherited stored remote
flag: `gpu.model.conversion.enabled`; package-only, no capability.

## Problem and decision

ADR0006 selected a reader direction, not a qualified browser artifact. A parser
must not acquire files, grow memory indefinitely, block the UI, silently lose
unsupported scene data, or bypass the family's verified canonical boundary.

Pin ufbx v0.23.1 at `26a482ae66871d7de36eb722aa060bce95bce274` under MIT.
The 2026-10-21 primary advisory read found GHSA-6j9m-9g7j-w7vg and
GHSA-7m5m-93fx-xcf5 both patched in0.23.1; upstream's dated changelog also names
malformed array/NURBS, UTF-8 and truncated DEFLATE fixes. This is a dated review,
not a promise of absence of future advisories. Sources:
[release](https://github.com/ufbx/ufbx/releases/tag/v0.23.1),
[advisories](https://github.com/ufbx/ufbx/security/advisories), and
[changelog](https://github.com/ufbx/ufbx/blob/26a482ae66871d7de36eb722aa060bce95bce274/misc/changelog.md).

Compile this package's small C bridge with Emscripten5.0.7,
source`263db4cffa6f9fc2ec514a70abac81362ea41849`, SDK backend
`6cd98e86d7749ff98b82b7f2ae78eb4f01942788`, installer
`d7b4130688bfa348392b921ab04015aa15c4f154`. Preserve source hashes, flags,
bridge/glue/Wasm hashes and runtime notices. A reviewed artifact baseline must
match the build. Compiler6.0.13 was evaluated but its profile runtime emitted raw
format10 while its reader required11; it was not qualified. 5.0.7 passes actual
instrumented Wasm coverage. No Apple tooling or license acceptance is needed.

Use a fresh module worker for each admitted operation. Disable parser stdio,
non-FBX format loading, geometry-cache I/O, dynamic JS evaluation, memory growth
and ambient transport APIs. Wasm is an embedded literal, not an arbitrary remote
payload. The only worker module imports are this package's fixed shared code and
native glue. The host supplies its admitted worker location/factory.

Reuse published runtime0.3.2 for bounded acquisition, integrity and cancellation;
reuse published core0.6.0 for source/document types and private resource/document
verification. Temporary parsed positions cross the worker boundary; untrusted
worker output is bounded/revalidated before core verification. No cached worker
brand or structured-clone shape is accepted as proof of a core document.

The first profile is deliberately small: FBX7400, one static mesh instance with
triangular faces, no additional attributes or element types. Unsupported data
fails; it is never silently represented by an empty model. Normalize authored
geometry-to-world, axes/metres and reflected winding, then floor-centre. Preserve
source units/axes/version/name. Requirements and numeric budgets are in the
[qualification design](../design/fbx-import-qualification.md).

## Alternatives, impact and release

A native SDK would not meet the default browser boundary and remains excluded.
A handwritten parser duplicates a reviewed dependency. A persistent worker/cache
would retain parser heaps and require more lifecycle/identity machinery. Main
thread parsing cannot interrupt an uncooperative parser. Accepting general FBX
while dropping rig/material/hierarchy data would violate fidelity requirements.

Fresh remote evaluation precedes acquisition, worker allocation, canonical
verification and return. Missing/failed decisions deny. Caller abort and the total
deadline terminate workers; progress checks deadline and an optional shared abort
word. Cross-origin isolation is optional. The host remains responsible for its
remote-control evaluator and trusted acquisition ports.

Tests run actual compiled parsing for ASCII/binary/compressed data, adversarial
arrays, bounded allocations and repeated disposal; the bridge is instrumented as
Wasm and contributes real LCOV. Browser checks cover isolated/non-isolated workers,
access rollback, error/abort/deadline disposal and empty persistence. UI/SEO/ACA are
N/A for this package-only API. PR/exact-main CI and main/cd.yml/production release
remain mandatory; registry artifacts, provenance and installed ESM/CJS/declarations
must be verified before Task23 is Done. Rollback disables the stored flag and pins
the last qualified package. No new environment rollout switch is introduced.

The dual build selects the matching published core/runtime module format only
after admission. CJS uses its module loader lazily so private core brands match
the consuming CJS core; ESM keeps dynamic imports and browser code splitting.
A real CJS worker-import regression checks the returned document brand. The
CI SDK and build cache live under runner temporary storage, keeping downloaded
compiler sources outside project lint without excluding package source.
