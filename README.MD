# Open Map Creator

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENCE)
[![Release: v1.4.0](https://img.shields.io/badge/release-v1.4.0-blue.svg)](https://github.com/Rokoel/Open-Map-Creator/releases/tag/v1.4.0)

A free, open-source map editor for tabletop RPGs. Draw dungeons, add textures and objects, place lights, and export maps as images or printable PDFs with a chosen physical cell size. Your editable projects stay in your browser unless you export them.

**[Open the app](https://rokoel.github.io/Open-Map-Creator/)** · **[Release notes](RELEASE_NOTES.md)** · **[Example PDF](docs/examples/open-map-creator-example.pdf)**

![Open Map Creator in dark mode, showing layer controls and a dungeon illuminated by several light sources](docs/media/editor-layers-lighting.png)

## Implemented features

| Area | Available in v1.4.0 |
| --- | --- |
| Canvas | Pan, zoom, reset view, customizable background and grid lines. |
| Grid cells | Solid colors or uploaded textures, opacity down to full transparency, and optional cell outlines. |
| Tilesets | Upload several textures and randomly select from checked tiles for each cell. Add horizontal/vertical mirroring, quarter-turn rotation, hue/saturation variation, and brightness/contrast variation. |
| Brushes | Adjustable size baseline and spacing, spread, rotation and size randomness, and random mirroring. SVG brushes support tinting, original-color preservation, and optional backgrounds. |
| Objects | Upload PNG/JPEG/SVG artwork; select, move, resize, rotate, mirror, copy, paste, delete, or move it between layers. Resize with bounding-box handles and edit a side's length by double-clicking it. |
| Groups | Group image objects, brush stamps, and lights on one layer. Move them together and rotate them around a shared, visible pivot. |
| Layers | Create, rename, reorder, hide, and delete layers. Border textures and global light/shadow settings belong to each layer. |
| Border textures | Generate pencil hatching, stippled dots, or varied pencil rocks around the connected grid's exterior. Upload paired edge and corner images for custom patterns. |
| Lighting | Layer-positioned colored lights with brightness, range, ray-cast shadows, and up to three approximate rebounds. Adjust ambient illumination or preserve the map's original brightness. |
| Shadows | Separate controls for casting shadows, receiving global shadows, and receiving light-source shadows. Global shadows have direction, length, color, opacity, and softness settings. |
| Lighting bake | Cache illumination for navigation and export. Decorative object edits preserve the bake, including undo/redo. |
| Editing history | Undo/redo without changing the camera, additive Shift-selection, and protection against moving grid cells onto occupied cells. |
| Local saves | IndexedDB autosaves with deduplicated image assets, ordered writes, recovery backups, and migration from older localStorage saves. |
| Export | Editable JSON, PNG, and tiled PDF. Set paper, orientation, DPI, physical cell size, padding, and color mode. Grayscale and black-and-white exports use a white background. |
| Interface | Pastel/dark blue palettes, light/dark mode, a floating instrument panel on the left, and a separate Map panel on the right that starts minimized. |

## Gallery and example downloads

### Editor and tileset controls

The same map with texture controls, placed artwork, and light-source objects. Instrument settings stay on the left while Map settings can be minimized on the right.

![Open Map Creator showing tileset selection, texture variation controls, placed objects, and dungeon lighting](docs/media/editor-tileset-tools.png)

### Two PNG exports of the same map

| Textured map with objects and lighting | Lighting-focused version |
| --- | --- |
| [![Textured dungeon PNG export with stone floors, a placed object, torch artwork, and cast shadows](docs/media/map-textured.png)](docs/media/map-textured.png) | [![PNG export of the same dungeon showing light falloff, cast shadows, and exterior rock borders](docs/media/map-lighting-only.png)](docs/media/map-lighting-only.png) |

Click either image to open the original PNG.

### Printable PDF and physical result

**[Open or download the four-page example PDF](docs/examples/open-map-creator-example.pdf).** The PDF example and both PNGs above show versions of the same map.

PDF export generates pages from the requested physical cell size. The supplied print photographs show a **2.5 cm cell beside a ruler** and the **complete map assembled from four sheets of paper**.

| Printed 2.5 cm cell | Four-sheet map assembled |
| --- | --- |
| [![Close-up of the printed map with a ruler showing a cell measuring 2.5 cm](docs/media/printed-cell-2-5cm.jpg)](docs/media/printed-cell-2-5cm.jpg) | [![The printed dungeon map assembled from four sheets of paper](docs/media/printed-map-four-sheets.jpg)](docs/media/printed-map-four-sheets.jpg) |

The screenshots, exports, and photographs were supplied for this release. The PDF is the original supplied export; photograph publication copies retain the original image pixels with camera/GPS metadata removed.

## Getting started

Use the **[hosted app](https://rokoel.github.io/Open-Map-Creator/)**, or run a local copy:

```bash
git clone https://github.com/Rokoel/Open-Map-Creator.git
cd Open-Map-Creator
python3 -m http.server 8000
```

Open **http://localhost:8000**. No build step or UI framework is required. Serve the project over HTTP because the editor uses JavaScript modules.

The editor uses plain JavaScript, HTML, CSS, and Canvas 2D. PDF creation uses jsPDF from a CDN; the optional web font has system-font fallbacks. There is no React or Vue dependency. Third-party attributions and licence notices are in [CREDITS.md](CREDITS.md).

## Usage

### Tools and navigation

| Shortcut | Tool/action |
| --- | --- |
| V / G / B / E | Select / Grid / Brush / Erase |
| O / L / K | Image object / Light / Layers |
| Middle mouse drag / scroll | Pan / zoom |
| Shift-drag in Select | Add to the selection, including when starting on a cell |
| Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z | Undo / redo |
| Ctrl/Cmd+C / Ctrl/Cmd+V | Copy / paste at the cursor |
| Ctrl/Cmd+G / Ctrl/Cmd+Shift+G | Group / ungroup objects |
| Delete / Escape | Delete selection / deselect |
| Alt+scroll, or [ / ] | Adjust the Brush size baseline |

The floating left panel contains settings for the active tool or selection. Choose **Layers** to manage layers, border textures, lighting, and shadows. Expand **Map** on the right for canvas appearance, project files, and export settings.

The top layer in the list is the front of the map. Click its name to activate it; double-click the name or use its rename button to edit it. **Enter** saves a name and **Escape** cancels. Selection and erasing affect the active visible layer. **Move to layer** transfers the selection, and pasting assigns objects to the active layer.

### Cells, tilesets, and brushes

- Use **Opacity** for partially or completely transparent cells. **Show cell outline** applies to both solid-color and textured cells; uploaded textures default to no outline.
- **Add tileset textures** accepts multiple image files. Checked thumbnails form the active set. Each cell chooses one tile and stores its variations, so redraws, undo, save/load, and exports keep the same result. Reentering a cell within one stroke does not reroll it.
- Tile rotation uses quarter turns so the images fill their cells. Mirroring and hue, saturation, brightness, and contrast variations are independently adjustable.
- **Brush → Size baseline** sets stamp diameter before size variation. Its slider, Alt+scroll, and bracket shortcuts control the same value. A circle previews the diameter when changing size; this helper is excluded from exports.
- Brush spacing controls the distance between stamps. Spread, rotation randomness, size randomness, and random mirroring vary their placement and appearance.
- SVG brush artwork follows the brush's **Fill** color unless **Keep original SVG colors** is enabled. **SVG background** adds an optional chosen color; leaving it off removes conventional full-canvas background rectangles and retains transparency. Existing stamps keep the settings used when they were painted.

### Object transforms and groups

Drag square handles to resize an image object and its round handle to rotate it. Hold **Shift** to preserve proportions or snap rotation to 15° increments. Double-click a side to enter its length in cells. **Lock proportions** links the width and height controls. Selected image objects and brush stamps also have horizontal and vertical mirror switches.

Select at least two image objects, brush stamps, or lights on the same layer and choose **Group objects**. Clicking a member selects the group. Its round handle and **Group rotation (°)** rotate all members around the marked shared pivot while preserving relative positions and orientations. Ungrouping keeps their current transforms. Groups survive save/load and undo; pasted groups receive separate identities. Grid cells retain their grid positions and are not part of object groups.

### Lighting and baking

The Light tool's **Placement layer** chooses where a new light belongs. Lights affect their own layer and visible layers beneath it; higher layers cover the result. Selected lights can be moved to another layer. Hidden layers hide their lights, and editor light markers do not appear in exports.

Use **Blocks light** for walls and opaque objects; switch it off for floors. A light placed inside an opaque blocker is occluded. **Cast shadows**, **Receive global shadows**, and **Receive light-source shadows** are separate controls. Global shadow receiving is opt-in, while local light-source shadow receiving defaults on.

**Keep global lighting** preserves the map's original brightness when adding local lights. Otherwise, ambient brightness and shade color set the darker base illumination. Each layer also has global light color/intensity and directional shadow settings. Local rebounds are sampled, diminishing reflections, with a maximum of three.

**Bake lighting** creates reusable lightmaps for navigation and export. Grid occluder edits, light/ambient changes, and layer changes that affect lighting invalidate the cache. Adding, moving, resizing, rotating, mirroring, grouping, or deleting decorative objects and brush stamps preserves it, including undo/redo. Object-occlusion changes are incorporated when you explicitly bake again. **Use live lighting** clears the cache. Bakes are session caches; editable light settings are saved with the project.

### Border textures and custom artwork

Generated textures follow the connected grid's exterior on each visible layer. Internal cell seams and enclosed holes stay clear. Topology updates after a complete grid stroke, and border ink retains its color under lighting and shadows.

Choose pencil hatching, dots, or rocks. Hatching uses straight parallel strokes in connected patches with adjustable angle, randomness, strokes per block, approximate stacks, and block density. Defaults are width **0.75 cells**, **9 strokes**, **2 stacks**, block density **0.3**, and randomness **0.5**. Dots and varied rock marks become denser near the border; corners share the edge density.

For **Layers → Upload edge + corner patterns**, supply both images:

- **Edge:** a horizontal strip with the dungeon along its bottom and shading above. Make the left/right ends repeat seamlessly.
- **Corner:** a square for an outside top-left turn, with the dungeon vertex at its bottom-right point. Match its right/bottom sides to the edge artwork.
- Use transparent PNG/SVG files. Match the edge strip's height to the corner square's size. The editor handles repeating, rotation, convex corners, and mirrored concave corners; transparent joins avoid doubled opacity.

Start with the [edge example](assets/border-patterns/edge-example.svg) and [corner example](assets/border-patterns/corner-example.svg). Both uploaded assets are included in saves and exports. Older single-image borders retain their edge artwork and request a companion corner image.

### Saving and export

**JSON** keeps the editable map, all layers, light settings, groups, variations, and image assets. **PNG** exports a single image at 64 pixels per cell. **PDF** tiles the map into pages using the chosen paper, orientation, DPI, and physical cell size in centimeters.

Export bounds follow visible cells and placed artwork, including rotated objects and directional shadows. Invisible light markers and illumination ranges do not enlarge the export. **Padding (cells)** controls the extra margin. Both PNG and PDF offer **Color**, **Grayscale on white**, and **Black & white on white** modes. Monochrome backgrounds remain white even when the editor background or ambient lighting is dark.

### Local autosave

Edits trigger a save after a 0.6-second debounce, with periodic saves and a flush when the page becomes hidden. Autosaves use transactional IndexedDB storage and deduplicate repeated image/SVG data. A compact localStorage journal protects final edits during page closing and provides a fallback for small projects if IndexedDB is unavailable.

Older localStorage projects migrate only after a durable save succeeds. Ordered writes prevent an older snapshot from replacing a newer one. Failed writes retain the previous save, and unreadable saves are preserved rather than silently deleted. The header reports save status. JSON export provides a portable project backup.

## Testing

```bash
python3 -m venv .venv
.venv/bin/pip install -r tests/requirements.txt
.venv/bin/playwright install chromium
.venv/bin/python tests/browser_checks.py
```

The suite starts a temporary HTTP server and runs real Chromium interactions and pixel checks. Coverage includes groups and transforms, layer-aware lights, procedural/uploaded borders, stable tile variation, bake preservation, monochrome PNG/PDF exports, and autosave quota failures, deduplication, reload, immediate-close recovery, write ordering, and migration. PDF download checks run when the jsPDF CDN is reachable.

## Roadmap

Implemented in this release: grouped transforms, mirror controls, procedural borders, layer-aware lighting and baking, randomized tilesets/brushes, physical-size PDF export, monochrome export, reliable local saves, and the redesigned interface.

Still planned:

- Layer locking.
- Alignment and snapping tools.
- More built-in textures and symbols.
- VTT-oriented export formats.
- Brush path connection, measurement tools, and saved color palettes.
- Further performance work for very large maps.

## Contributing and documentation

Bug reports, example maps, feature requests, documentation improvements, and code contributions are welcome. See [CONTRIBUTING.MD](CONTRIBUTING.MD) and the [Code of Conduct](CODE_OF_CONDUCT.MD).

The current user guide is above. [DOCUMENTATION.MD](DOCUMENTATION.MD) retains the earlier class reference and points to the current renderer. [Release notes](RELEASE_NOTES.md) describe v1.4.0; [CREDITS.md](CREDITS.md) records third-party usage.

## License

Open Map Creator is released under the [MIT license](LICENCE).
