# Open Map Creator v1.4.0

Released October 17, 2026.

Open Map Creator v1.4.0 adds layer-aware lighting, procedural borders, object groups, randomized tilesets and brushes, and more reliable saving and export. The editor remains a static browser application built with JavaScript, HTML, CSS, and Canvas 2D, with no React/Vue or build step.

**[Use Open Map Creator](https://rokoel.github.io/Open-Map-Creator/)** · **[Guide and gallery](README.MD)** · **[Four-page example PDF](docs/examples/open-map-creator-example.pdf)**

## Added

- **Layer-aware lights:** Choose a placement layer and edit color, brightness, range, and up to three sampled rebounds. Lights and their markers follow layer visibility and order. Ambient illumination and per-layer global light/shadow controls are included in PNG/PDF rendering.
- **Lighting baking:** Reuse cached lightmaps when panning, zooming, or exporting. Decorative object and brush edits preserve the bake, including undo/redo. Grid occluder and lighting changes still invalidate it.
- **Procedural outer borders:** Pencil hatching, dots, and varied pencil rocks follow each layer's connected exterior contour. Internal seams and enclosed holes stay clear; topology updates after a whole grid stroke. Border ink is independent of lighting.
- **Custom border pairs:** Upload edge and corner artwork with previews and preparation instructions. Repeating, rotation, convex/concave joins, and transparent corner assembly are automatic.
- **Object groups and transforms:** Group images, brush stamps, and lights around a shared pivot. Rotate through one handle or an angle field; ungroup without changing placement. Resize image objects with handles, lock proportions, edit side lengths, and mirror horizontally/vertically. Groups remain independent after copying and pasting.
- **Tilesets:** Choose multiple textures for per-cell random selection, quarter-turn rotation, mirroring, hue/saturation variation, brightness, and contrast. Random choices are stored on the cells and remain stable across redraws, undo, saves, and exports.
- **Brush controls:** Size baseline slider and Alt+scroll/bracket shortcuts with a circular preview; spacing, spread, rotation/size randomness, and random mirroring. SVG brushes have tinting, original-color preservation, and optional backgrounds.
- **Cell appearance and shadows:** Cell opacity includes full transparency. Outlines can be disabled for both solid and textured cells; uploaded textures default to no outline. Shadow casting, global shadow receiving, and local light-source shadow receiving are independent controls.
- **Interface:** Blue light/dark palettes, a floating left instrument inspector, a Layers instrument, and a separate right Map panel that is minimized by default.
- **Export modes:** Adjustable padding and color, grayscale-on-white, or pure black-and-white-on-white output for PNG and PDF. PDF export retains paper, orientation, DPI, physical cell size, and multi-page tiling controls.

## Fixed

- Grid fill/outline color controls continue editing the live settings after undo/redo, including native color-picker change events.
- Keyboard undo works with focused non-text controls and skips unchanged history entries; camera zoom and pan stay in place.
- Shift-drag adds to a selection rather than moving or overwriting cells. Moves into occupied grid cells are blocked.
- Layer rename supports Enter, Escape, and undo; object/light ownership and layer transfer are preserved on save/load.
- Disabling shadow casting no longer implicitly enables shadow receiving. Directional shadow geometry stays attached to its source cells.
- Export bounds no longer grow to include invisible light ranges. Bounds follow visible grid/artwork, directional shadows, and configured padding.
- Autosave no longer depends on fitting repeated base64 images into localStorage. IndexedDB snapshots deduplicate assets, serialize writes, preserve the previous save on failure, and recover final edits after closing. Existing localStorage saves migrate after a successful durable write; unreadable saves are retained.

## Examples in this release

The [README gallery](README.MD#gallery-and-example-downloads) includes two editor screenshots, textured and lighting-focused PNG exports of the same map, and two photographs of the physical print. One photo shows the requested **2.5 cm cell** beside a ruler; the other shows the map assembled from **four sheets**.

The original four-page PDF, both PNGs, both screenshots, and both photographs are also attached to the GitHub release. Photo publication copies retain the original decoded image pixels with camera/GPS metadata removed.

## Upgrade and behavior notes

- Use the hosted app or serve a local checkout over HTTP. JavaScript modules require an HTTP origin; no build is needed.
- Older projects without object layer assignments place those objects on the first layer. Older map-wide lighting and border settings migrate to independent per-layer settings. Single-image border uploads retain their edge image and request a companion corner.
- Bakes are session caches. Re-bake explicitly to incorporate decorative object-occlusion changes, or switch back to live lighting. Editable lighting settings are saved with the project.
- Reflections use sampled, diminishing rebounds rather than a full global illumination simulation. Image objects and grid cells provide the occlusion geometry.
- PDF creation loads jsPDF from its CDN. Other editor features do not require that PDF library; the optional font has system-font fallbacks.

## Validation

The Chromium integration suite covers actual pointer and keyboard actions, geometry and pixel rendering, groups, layers, lighting/bakes, tilesets, borders, PNG/JSON/PDF downloads, and save/reload behavior. Autosave regression tests reproduce a quota failure with an approximately **18.3 MB** textured-map snapshot, reduce its packed autosave to approximately **89 KB**, and verify reload, immediate-close recovery, failed-write preservation, write ordering, migration, and fallback recovery.

Third-party usage and licence notices are recorded in [CREDITS.md](CREDITS.md).
