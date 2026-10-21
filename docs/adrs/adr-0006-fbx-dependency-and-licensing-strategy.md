# ADR 0006: FBX dependency and licensing strategy

- Status: accepted for implementation planning, 2026-10-21.
- Delivery: site bootstrap [1167](https://github.com/Plasius-LTD/plasius-ltd-site/issues/1167), package [22](https://github.com/Plasius-LTD/gpu-model-fbx/issues/22).
- Parent: site Feature [1151](https://github.com/Plasius-LTD/plasius-ltd-site/issues/1151), Epic 1147, architecture [ADR 0094](https://github.com/Plasius-LTD/plasius-ltd-site/blob/main/docs/adrs/adr-0094-gpu-model-family-and-canonical-proxy-conversion.md).

## Problem

The existing repository and npm package contain identity/rollout metadata, not an
FBX converter. Import, DCC fidelity, export, and browser execution need an explicit
dependency decision before parser implementation. A permissive reader license
does not establish an exporter, browser build, fixture rights, or lossless mapping.

## Evidence reviewed

Primary sources were read on 2026-10-21. Immutable source links identify the review
baseline, not an installed dependency or an automatic future version selection.

| Option | License and distribution | Platform/browser viability | Import/export and maintenance implications |
| --- | --- | --- | --- |
| Autodesk FBX SDK | Vendor EULA; the official page calls the SDK free subject to its accompanying agreement. No SDK redistribution or browser rights are inferred. | Vendor C++ builds for Windows, macOS, iOS and Linux. The reviewed page supplies no supported browser/WASM distribution. | Vendor import/export is an interoperability reference. Native tooling, EULA review and deployment requirements make it unsuitable for the default browser/npm dependency. |
| ufbx | Dual MIT/public-domain alternatives; select **MIT**, preserving copyright, permission and disclaimer notices with distributed source/compiled derivatives. | Portable C; upstream documents native and WASI/WASM testing. This is evidence of feasibility, not qualification of our browser worker/build. | Reader supports binary/ASCII FBX, skinning, blend shapes, embedded resources and animation evaluation. Its pre-1.0 minor releases may break compatibility; pin and test the source/compiler/artifact. It is not the exporter. |
| ufbx-write | Separate dual-license project; select **MIT** if adopted, retain its own notices. | Portable C99/C++11 source; no OS-specific code in the reviewed setup. Browser/WASM compilation remains a local acceptance gate. | Separate export API; upstream explicitly warns of work in progress and breaking changes. Qualify supported fidelity and deterministic output before adoption. |
| Assimp | BSD 3-clause main license with notice/non-endorsement requirements; inventory bundled component licenses separately. Test assets have their own rights. | Native C++ and a broader build surface. A bounded browser/WASM configuration would require its own measured build and dependency inventory. | FBX exporter source provides binary/ASCII output and scene mapping. Its timestamp generation requires investigation for deterministic bytes. Extra scene-model translation and build scope add maintenance risk. |

Sources:

- Autodesk [SDK/platform/download overview](https://aps.autodesk.com/developer/overview/fbx-sdk) and [2020.3 accompanying-license notice](https://damassets.autodesk.net/content/dam/autodesk/www/adn/fbx/2020-3-2/fbx-sdk-2020-3-about-box.pdf).
- ufbx [v0.23.1 README](https://github.com/ufbx/ufbx/blob/26a482ae66871d7de36eb722aa060bce95bce274/README.md), [license](https://github.com/ufbx/ufbx/blob/26a482ae66871d7de36eb722aa060bce95bce274/LICENSE), [API/options](https://github.com/ufbx/ufbx/blob/26a482ae66871d7de36eb722aa060bce95bce274/ufbx.h).
- ufbx-write [README](https://github.com/ufbx/ufbx-write/blob/2b65caaaa7fada7db9a2d25cd924997838169056/README.md), [license](https://github.com/ufbx/ufbx-write/blob/2b65caaaa7fada7db9a2d25cd924997838169056/LICENSE), [API](https://github.com/ufbx/ufbx-write/blob/2b65caaaa7fada7db9a2d25cd924997838169056/ufbx_write.h).
- Assimp [license/component/fixture exceptions](https://github.com/assimp/assimp/blob/c3f68d29c4237435652ec242e00928d5dd2b3011/LICENSE), [FBX exporter](https://github.com/assimp/assimp/blob/c3f68d29c4237435652ec242e00928d5dd2b3011/code/AssetLib/FBX/FBXExporter.cpp).

## Decision

1. Use ufbx under MIT as the default import implementation direction. Before
   integrating it, task 23 must select a supported immutable revision after a
   fresh advisory review, retain notices, and qualify our compiled browser worker.
   Prefer a reproducible source build owned by this existing package over an
   unreviewed npm wrapper or additional public package.
2. Evaluate ufbx-write under MIT first for export in task 29. This is a candidate
   decision, not approval of an unqualified runtime dependency. Pin the selected
   revision and prove the declared profile. If it fails, document an Assimp
   fallback decision and component inventory before introducing that dependency.
   If neither meets acceptance, keep export incomplete with a linked decision
   blocker. Do not substitute an SDK, silently lose data, or claim full FBX export.
3. Exclude Autodesk SDK binaries, headers and development libraries from the
   default source/npm/browser artifact. Any future optional native integration
   needs a separate tracked deployment and exact-version EULA/distribution review;
   this decision neither accepts that agreement nor installs the SDK.
4. Retain Apache-2.0 for this package's own code. Upstream notices keep their own
   licenses. Compiler runtimes, compression/formatting helpers and fixture assets
   require separate notice/provenance inventories at adoption. No upstream code
   or compiled binary is copied by this documentation release.
5. Reuse published canonical core contracts and bounded runtime acquisition.
   Public conversion flows source adapter -> canonical model -> target adapter;
   no renderer/site parser ownership or direct public format-to-format shortcuts.
   Extend and release core first if faithful metadata cannot be represented.
6. Inherit the remote `gpu.model.conversion.enabled` decision. Missing/disabled
   authorization must fail before parser allocation/resource I/O when implemented.
   No capability applies to this package-only layer. Rollback disables the remote
   feature and pins the last qualified release; no build-time flag replacement.

## Consequences and alternatives

The importer and exporter can evolve independently while the public canonical
boundary remains stable. We take responsibility for WASM reproducibility,
licensing inventory, bounds, cancellation, adapters and fidelity fixtures.
Upstream features and testing are not local correctness/security evidence.

A proprietary native SDK cannot be assumed browser-compatible merely because it
supports desktop export. Assimp remains viable but introduces a second scene
model and broader dependency surface. A new handwritten FBX parser duplicates
existing work and is rejected. Export uncertainty is explicit future task 29
scope; it does not prevent completing this pre-implementation bootstrap review.

## Tests and release

[TDR 0001](../tdrs/tdr-0001-fbx-implementation-and-qualification.md) defines the
work packages and acceptance matrix. This change preserves the metadata-only API
and manifest/lock dependency graph. Run the existing test/coverage/type/lint/build,
full audit, artifact and pack checks, plus documentation/source/link review.
Release documentation through normal PR/CI and `main`/`cd.yml`/`production`, then
verify registry/provenance and installed ESM/CJS metadata. No site/backend release
or ACA secret mapping is involved. Bootstrap completion does not complete the
adapter coordinator, implementation tasks or parent Feature.
