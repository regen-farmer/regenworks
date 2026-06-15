# RegenWorks Layout Geometry Backend Notes

Last updated: 2026-06-15. Branch context: `browser-wasm-layout`.

This is an internal RegenWorks decision note. The public `geometry-kernel`
package documentation should stay generic and package-focused; this file records
why RegenWorks has multiple layout backends and why the web app now defaults to
the `geometry-kernel` WASM path.

## Current Decision

The browser layout default is `geometry-kernel`.

`packages/frontend/src/util/layoutService.ts` selects the browser backend from
`VITE_LAYOUT_BACKEND`:

- unset or `geometry-kernel`: use the RegenWorks layout adapter backed by the
  published `geometry-kernel` package.
- `turf-js`: use the TypeScript/Turf implementation as the baseline and
  fallback implementation.
- `geos-wasm-geo`: use the earlier Rust/WASM implementation that combines
  Rust `geo` with a GEOS-WASM bridge.

Fallback is intentionally opt-in through `VITE_LAYOUT_BACKEND_FALLBACK=true`.
That keeps backend failures visible during the geometry-kernel rollout instead
of silently masking them with Turf output.

Desktop builds still enter through their native IPC paths. The modelling package
keeps Node-side backend runners for comparison and regression checks:

- `turf-js`
- `geometry-kernel`
- `geos-wasm-geo`
- `native-geos`

## Why This Exists

The layout output is sensitive to small geometry differences. A minor buffer or
intersection change can move row endpoints enough to change row counts, tree
counts, strip areas, or ground-cover areas.

Turf is not one geometry engine. In Turf 7.3.5, important operations come from
different libraries:

- `@turf/buffer` uses JSTS `BufferOp`.
- `@turf/difference` uses `polyclip-ts`.

JSTS and GEOS are both in the JTS algorithm family, which is why Turf buffering
often agrees with native GEOS. Rust `geo` is a separate implementation. It is
valuable, portable, and small, but it did not behave closely enough on the
offset-sensitive parts of this model when used as the only geometry engine.

The long-term target is a compact Rust/WASM-compatible backend with behavior
close enough to the Turf/GEOS baseline for RegenWorks layout output. That is the
role of `geometry-kernel`.

## Backend Comparison

| Backend | Runtime | Role in RegenWorks | Compatibility notes | Bundle/performance notes |
| --- | --- | --- | --- | --- |
| `geometry-kernel` | Browser WASM and native Rust adapter | Current browser default and long-term target | Built to preserve the layout behavior that matters to RegenWorks while avoiding a GEOS-WASM dependency in the default browser path. | Smaller browser payload than the GEOS-WASM bridge path; avoids process-spawn overhead in Node by loading the WASM module directly. |
| `turf-js` | Browser/Node TypeScript | Baseline and fallback | Existing source-of-truth implementation for browser behavior. Good reference for semantic compatibility. | Pure JS path is convenient but slower on large layouts. Turf remains useful for comparison and emergency fallback. |
| `native-geos` | Native Rust + GEOS | Native reference backend | Closest to JTS/GEOS semantics and useful for checking parity. | Not directly browser-portable; no browser bundle impact. |
| `geos-wasm-geo` | Browser WASM + JS bridge | Previous browser Rust/WASM candidate | Good parity for the margin-buffer-sensitive path, but mixes Rust `geo` and GEOS-WASM through a bridge. | Adds a large GEOS-WASM payload, mostly from the embedded GEOS runtime and wrappers. |
| Rust `geo` only | Browser WASM/native Rust | Rejected as a drop-in layout backend | Portable and useful for local operations, but buffer/offset behavior differed enough to change model output. | Attractive bundle size, but not acceptable for this regression-sensitive path by itself. |
| Clipper-style offsetting | Browser WASM/native Rust | Rejected as a drop-in layout backend | Good polygon clipping/offsetting family, but not JTS/GEOS-compatible enough for this model. | Promising for compact geometry tools, not for the layout backend without further compatibility work. |
| All geometry through GEOS-WASM | Browser WASM + JS bridge | Possible fallback design, not current target | Would preserve GEOS-like semantics, but the current bridge is too coarse for frequent geometry calls. | Payload and serialization overhead are worse than the geometry-kernel target. |

## Why Not Use GEOS-WASM For Everything

GEOS-WASM can provide GEOS-like behavior in the browser, but the bridge used in
the spike serialized geometry through JSON:

```text
Rust geometry -> JSON -> JS -> GEOS-WASM -> JSON -> Rust geometry
```

That is acceptable for a small number of expensive operations. It is not a good
shape for every row clip, segment intersection, area calculation, and helper
operation in the layout flow.

A better all-GEOS browser design would need a proper geometry-handle bridge:
stable GEOS contexts, opaque geometry handles or typed-array transfer, and
explicit lifetime management. That is a larger integration project than keeping
the default path in pure Rust/WASM.

## Practical Guidance

Use `geometry-kernel` as the default browser backend.

Keep `turf-js` available as a baseline and fallback. It is still the easiest way
to answer whether a geometry-kernel change preserves current browser behavior.

Keep `native-geos` available for native comparison. It is useful when checking
whether Turf and GEOS agree on an operation, especially around buffering.

Keep `geos-wasm-geo` as historical comparison and emergency fallback while
geometry-kernel is settling in. It should not be the default unless a specific
regression makes the GEOS-WASM payload worth the cost.

Do not replace parity-sensitive layout operations with Rust `geo` or
Clipper-style offsets just because they are smaller. In this model, preserving
layout output matters more than local geometry similarity.

## What Belongs In Public Geometry-Kernel Docs

The `geometry-kernel` repo should document:

- the public Rust and WASM APIs
- supported geometry operations
- package installation and build instructions
- broad comparisons to GEOS, Turf/JSTS, Rust `geo`, and GEOS-WASM

It should not document RegenWorks layout behavior, private fixture names,
private acceptance counts, or product-specific rollout decisions. Those belong
in this repo.

## References

- Turf releases: https://github.com/Turfjs/turf/releases
- Turf buffer package: https://www.npmjs.com/package/@turf/buffer
- Turf JSTS package: https://www.npmjs.com/package/@turf/jsts
- GEOS-WASM: https://www.npmjs.com/package/geos-wasm
- Clipper2 Rust docs: https://docs.rs/clipper2-rust/latest/clipper2_rust/
