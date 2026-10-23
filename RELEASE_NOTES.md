# TTRPG Map Creator v2.0.0

Released October 21, 2026.

This release makes object editing and layer work easier, replaces browser dialogs with in-app pop-ups, and fixes export settings that could fall out of sync.

## Object editing

- Move selections with the arrow keys: one cell per press, or ten cells with Shift. Movement supports undo/redo and keeps the existing grid collision protection.
- Resize groups with square handles, numeric width and height fields, or a double-click on an edge. Members and their spacing scale together, preserving proportions. Rotation still uses the shared pivot.
- Uploaded images stay in the Object menu as named thumbnails. Choose one to place it again. The library and selected image are saved with the project; older projects recover images from their placed objects.
- Opening Layers, switching layers, renaming, and reordering keep the current drawing tool active.
- Right-click or right-drag to erase cells, brush marks, images, polygons, and lights on the active visible layer. Each stroke can be undone. The separate Eraser tab and its E shortcut have been removed.

## Dialogs and export

- Alerts, confirmations, and object-size prompts now appear inside the app. Dialogs support keyboard navigation, cancellation, inline number validation, and queued messages.
- PDF resolution defaults to 300 DPI. Existing projects keep their saved resolution.
- Sheet margins, padding, page guides, and export-area fields stay in sync across edits, project loading, undo/redo, and resets. Reset everything restores 300 DPI and 5 mm sheet margins.

## Documentation

- Shortened the README, contributing guide, and credits, keeping setup instructions, usage details, and third-party notices.
- Removed the code of conduct and its references.

## Compatibility and checks

Existing JSON projects continue to load. New exports identify version 2.0.0 and include the reusable object library.

The full Chromium browser suite passes, including new checks for group resizing, image-library save/reload, tool preservation, per-layer right-drag erasing, in-app dialogs, and export-setting synchronization. Existing PDF, VTT, rendering, touch, and autosave checks also pass.

---

# TTRPG Map Creator v1.6.0

Released October 20, 2026.

Export maps for virtual tabletops and print full-size maps on printers that need white margins on each sheet.

**[Open the app](https://rokoel.github.io/TTRPG-Map-Creator/)** · **[Printing guide](README.MD#printing-on-sheets-with-margins)** · **[VTT guide](README.MD#virtual-tabletop-exports)**

## Added

- **VTT export:** D&D Beyond Maps image presets (JPG, PNG, WebP), Roll20 Universal VTT files with embedded map images, grid resolution, blocking walls, and light sources, plus generic VTT presets. Configure resolution, grid visibility, lighting, alignment, and file-size budgets.
- **Per-sheet PDF margins:** Set top, right, bottom, and left margins in millimeters, with 5 mm defaults. Margins reserve white paper on every sheet, separately from map-wide padding.
- **Margin-aware page layout:** Increasing margins reduces the map area on each page and can add pages. The editable export area's dashed divisions and PDF page count follow the same printable-area calculation.
- **Printing explanations:** The PDF dialog, page-guide settings, and README explain the difference between export margins, map padding, and print-app margins. Print at Actual size / 100% to preserve physical cell size.

## Fixed

- PDF pages use physical millimeter coordinates. Every raster pixel keeps its DPI-derived print size; partial final tiles retain their size. Page splitting covers the complete export area without lost or duplicated pixels.
- PDF creation stops if a map tile cannot render, instead of downloading an incomplete map.

## Cleanup

- Removed the obsolete class-reference document and its references.
- Removed eight unreferenced images, GIFs, and raster icons (about 11.2 MB). Current gallery images, example exports, and the active SVG icon remain available.

## Validation

The full Chromium suite covers VTT encoders and geometry, actual downloads, 24 paper/orientation/DPI/margin combinations, asymmetric margins, physical PDF page dimensions, pixel-perfect reconstruction from PDF tiles, matching page guides, and saved margin settings. Existing polygon, mobile, lighting, group, border, tileset, and autosave checks remain included. Signed-in third-party VTT imports and physical printer output are not automatically tested.

---

# TTRPG Map Creator v1.5.0

Released October 20, 2026.

Draw textured polygons, edit maps with touch controls, and choose exactly which area to export. The editor remains a static browser application with no build step.

**[Open the app](https://rokoel.github.io/TTRPG-Map-Creator/)** · **[Usage guide](README.MD#polygons-touch-controls-and-export-framing)**

## Added

- **Polygon tool (`P`):** Place vertices one at a time and close the shape by tapping its first vertex, pressing Enter, or choosing Finish polygon. Remove the last vertex or cancel a draft. Concave polygons use their actual shape for selection and light occlusion.
- **Polygon materials:** Separate fill and outline colors, overall opacity, and uploaded textures with tiling, scale, rotation, fit-to-polygon mode, and texture opacity. Select a polygon to edit its appearance and transforms or move it to another layer.
- **Polygon lighting and persistence:** Polygons receive layer lighting and cast local-light and directional shadows. Polygon geometry changes invalidate baked lighting. Polygons remain editable through JSON, autosave, undo/redo, grouping, and copy/paste.
- **Mobile controls:** One-finger drawing and selection, two-finger panning and pinch zoom, and a Pan tool (`H`) for one-finger or mouse navigation. Starting a pinch cancels the uncommitted stroke to prevent accidental painting.
- **Responsive interface:** A horizontally scrollable tool rail, collapsible inspectors, larger touch targets, and floating Finish/Cancel actions for polygon drawing and export-area editing.
- **Editable export area:** In Map, choose Edit export area and move or resize the frame using its corners or numeric position/dimension fields. The saved frame controls PNG and PDF bounds. Fit area to artwork restores automatic bounds and padding.
- **PDF page guides:** Dashed overlay guides match paper size, orientation, physical cell size, and DPI. Guide settings and the PDF export dialog share the same saved settings.

## Validation

The full Chromium integration suite passes, including polygon texture clipping, concave hit testing, material roundtrips, lighting/shadows, opacity compositing, export-frame movement/resizing, PNG dimensions, PDF downloads, and simulated mobile touch drawing, pinch zoom, panning, and stroke cancellation. Existing rendering, layers, groups, lighting/bakes, tilesets, and durable autosave checks also pass.

## Upgrade notes

- Existing projects continue to load. New JSON exports identify version 1.5.0 and retain editable polygon and export-area settings.
- Export padding applies to automatic bounds; a custom export frame defines the exact output bounds.
- PDF creation still loads jsPDF from its CDN. No build step is required; use the hosted app or serve the project over HTTP.

---

# TTRPG Map Creator v1.4.0

Released October 17, 2026.

TTRPG Map Creator v1.4.0 adds layer-aware lighting, procedural borders, object groups, randomized tilesets and brushes, and more reliable saving and export. The editor remains a static browser application built with JavaScript, HTML, CSS, and Canvas 2D, with no React/Vue or build step.

**[Use TTRPG Map Creator](https://rokoel.github.io/TTRPG-Map-Creator/)** · **[Guide and gallery](README.MD)** · **[Four-page example PDF](docs/examples/ttrpg-map-creator-example.pdf)**

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
