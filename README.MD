# Open Map Creator

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENCE)
[![Release: v1.5.0](https://img.shields.io/badge/release-v1.5.0-blue.svg)](https://github.com/Rokoel/Open-Map-Creator/releases/tag/v1.5.0)

A browser-based map editor for tabletop RPGs. Draw dungeons, add textures and objects, place lights, and export maps as images or printable PDFs with a chosen physical cell size.

**[Open the app](https://rokoel.github.io/Open-Map-Creator/)** · **[Release notes](RELEASE_NOTES.md)** · **[Example PDF](docs/examples/open-map-creator-example.pdf)**

![Open Map Creator in dark mode](docs/media/editor-layers-lighting.png)

## Highlights

- Infinite canvas with pan, zoom, grid drawing, polygons, brushes, image objects, and layers.
- Mobile touch drawing, pinch zoom, two-finger pan, and collapsible settings.
- Randomized tilesets with rotation, mirroring, and color variation.
- Object selection, resize/rotate handles, copy/paste, grouping, and layer transfer.
- Layer-aware lights, ray-cast shadows, ambient lighting, and optional baked lightmaps.
- Procedural dungeon borders and custom edge/corner artwork.
- Undo/redo and local autosave with IndexedDB.
- Editable JSON, PNG, and tiled PDF export with a movable, resizable export frame.
- VTT export presets for D&D Beyond Maps and Roll20, including Universal VTT walls and lights.
- PDF export supports a chosen physical cell size for printing battle maps at scale.
- Plain JavaScript, HTML, CSS, and Canvas 2D. No framework or build step.

## Gallery

### Editor and tileset controls

![Open Map Creator showing tileset controls and lighting](docs/media/editor-tileset-tools.png)

### PNG exports

| Textured map | Lighting-focused version |
| --- | --- |
| [![Textured dungeon PNG](docs/media/map-textured.png)](docs/media/map-textured.png) | [![Dungeon lighting PNG](docs/media/map-lighting-only.png)](docs/media/map-lighting-only.png) |

### Printed map

The PDF exporter can tile a large map across several pages while keeping the requested cell size.

| 2.5 cm cell | Four-sheet map |
| --- | --- |
| [![Printed map cell beside a ruler](docs/media/printed-cell-2-5cm.jpg)](docs/media/printed-cell-2-5cm.jpg) | [![Printed dungeon map assembled from four sheets](docs/media/printed-map-four-sheets.jpg)](docs/media/printed-map-four-sheets.jpg) |

See the **[four-page example PDF](docs/examples/open-map-creator-example.pdf)**.

## Getting started

Use the **[hosted app](https://rokoel.github.io/Open-Map-Creator/)**, or run a local copy:

```bash
git clone https://github.com/Rokoel/Open-Map-Creator.git
cd Open-Map-Creator
python3 -m http.server 8000
```

Then open **http://localhost:8000**.

The project uses JavaScript modules, so serving it over HTTP is recommended. PDF creation uses jsPDF from a CDN. Third-party attributions are listed in [CREDITS.md](CREDITS.md).

## Controls

| Shortcut | Action |
| --- | --- |
| V / G / B / E | Select / Grid / Brush / Erase |
| O / L / K | Image object / Light / Layers |
| P / H | Polygon / Pan |
| Enter (Polygon tool) | Finish polygon |
| Two-finger drag / pinch | Touch pan / zoom |
| Middle mouse drag / scroll | Pan / zoom |
| Shift-drag | Add to selection |
| Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z | Undo / redo |
| Ctrl/Cmd+C / Ctrl/Cmd+V | Copy / paste |
| Ctrl/Cmd+G / Ctrl/Cmd+Shift+G | Group / ungroup |
| Delete / Escape | Delete / deselect |
| Alt+scroll or [ / ] | Change brush size |

## Main tools

### Cells, tilesets, and brushes

Grid cells can use solid colors or uploaded textures. Tilesets can randomly choose from several textures and apply rotation, mirroring, hue, saturation, brightness, and contrast variation.

The Brush tool supports spacing, spread, size/rotation randomness, mirroring, and SVG tinting. Variations are stored with the created cells and brush stamps, so redraws, undo/redo, saves, and exports stay stable.

### Objects, groups, and layers

Uploaded PNG/JPEG/SVG objects can be moved, resized, rotated, mirrored, copied, grouped, and moved between layers. Groups rotate around a shared pivot and survive save/load and undo.

Layers can be reordered, hidden, renamed, or deleted. Lights and border settings are layer-aware as well.

### Lighting and borders

Lights have color, intensity, range, shadow occlusion, and up to three approximate rebounds. Baked lighting can cache the result for faster navigation and export.

Procedural borders follow the exterior of connected grid regions. Built-in styles include pencil hatching, dots, and rocks. Custom border artwork can be supplied as matching edge and corner images.

### Saving and export

Projects autosave locally in IndexedDB, with older localStorage saves migrated when possible.

- **JSON** keeps the editable project.
- **PNG** exports a single image.
- **PDF** tiles the map over pages and supports paper size, orientation, DPI, padding, color mode, and physical cell size.

## Polygons, touch controls, and export framing

Choose **Polygon** (`P`), then tap or click to place vertices. The preview connects them in order. Tap the first vertex, press Enter, or use **Finish polygon** to close the shape. **Remove last vertex** corrects a point; Cancel or Escape discards the draft. New polygons belong to the active visible layer.

Set the fill, outline, and opacity in the Polygon inspector. Upload a separate polygon texture, choose **Tile** with a scale or **Fit entire polygon**, and adjust texture rotation and opacity. Select an existing polygon to change its material, size, rotation, mirrors, or layer. Polygon outlines participate in local-light occlusion and layer shadows, and polygon surfaces receive layer lighting. Polygons stay editable through JSON, autosave, copy/paste, grouping, and undo/redo.

On phones and tablets, use one finger for the chosen tool and two fingers to pan and pinch to zoom. The **Pan** tool (`H`) also moves the map with one finger or a mouse drag. A pinch cancels any uncommitted stroke. The tool rail scrolls horizontally; tap the inspector title or **Map** to expand or collapse settings. Finish/Cancel controls remain available above the canvas while drawing a polygon.

In **Map → Export area**, use **Edit export area** to overlay the output frame. Drag inside the frame to move it, drag a corner to resize it, or enter its position and dimensions in cells. **Finish editing area** returns to drawing. Dashed page guides follow the paper size, orientation, physical cell size, and DPI under **PDF page guides**, which share the PDF dialog’s settings. The chosen frame applies to both PNG and PDF exports and is saved in the project. **Fit area to artwork** restores automatic bounds, including padding and shadows; padding applies only to automatic bounds.

## Virtual tabletop exports

Open **Map → Export for VTT**. Choose a platform and format, then download the map. These exports use the current export area and color mode; the editable map stays unchanged.

| Target | Output | Import workflow |
| --- | --- | --- |
| D&D Beyond Maps | JPG, PNG, or WebP; preset 100 pixels/cell | Upload a custom map image, then calibrate its grid using the cell dimensions shown in the dialog and filename. |
| Roll20 | Universal VTT (`.uvtt`); preset 70 pixels/cell | Open **Create Page → Upload Background**, then select the file. Roll20 reads the background, grid scale, blocking walls, and light sources. Dynamic Lighting use depends on your subscription. |
| Roll20 image / other VTT | JPG, PNG, WebP, or Universal VTT | Upload the image on the map/background layer and set its size in cells, or use your VTT’s Universal VTT importer. |

**Include grid lines** defaults off so the VTT can draw its own grid. **Align frame to whole cells** expands the frame outward without moving artwork or changing the saved export area. UVTT always uses whole-cell alignment. Image exports can retain an exact fractional frame; the dialog reports the pixel offset needed for grid alignment. Resolution remains fixed at your chosen pixels/cell, even when image quality is reduced.

**Include editor lighting in image** preserves the map’s lighting in a static image. For UVTT, leave it off to let the VTT light the map dynamically. When it is on, light sources are omitted from the UVTT data to avoid lighting the same image twice. The **File budget** is configurable to match your account’s upload allowance; 0 disables the budget. JPG/WebP quality is reduced as needed. If a file still exceeds the budget, export stops with guidance instead of silently resizing the grid.

UVTT blocking walls follow visible solid cells, polygons, and image-object rectangles with **Blocks light** enabled. Adjacent solid grid cells share an exterior outline; internal seams are omitted. Disable blocking on floors or disable wall export if the map should stay open. Walls are clipped to the export area, hidden layers are excluded, and light sources inside the frame retain their position, color, range, and intensity. Layers are flattened into one scene; UVTT cannot reproduce the editor’s per-layer lighting or sampled rebounds. There are no inferred doors or windows. Review imported walls and lighting in your VTT.

D&D Beyond support here is an image import workflow, with walls and lighting configured in Maps separately. These are downloadable files, not a direct account integration. The downloads are validated by browser tests; imports inside signed-in third-party VTT sessions have not been tested automatically.

Platform references: [D&D Beyond supported image formats](https://dndbeyond-support.wizards.com/hc/en-us/articles/46363725057556-What-file-formats-work-for-uploading-images-and-videos), [Roll20 native UVTT upload](https://blog.roll20.net/posts/page-menu-updates/), [Roll20’s UVTT importer source](https://github.com/Roll20/roll20-api-scripts/tree/master/UniversalVTTImporter).

## Testing

Browser integration tests use Python and Playwright:

```bash
python3 -m venv .venv
.venv/bin/pip install -r tests/requirements.txt
.venv/bin/playwright install chromium
.venv/bin/python tests/browser_checks.py
```

The suite runs the editor in Chromium and checks core interactions, polygon materials and lighting, touch drawing and navigation, VTT encoders/walls/lights, export framing and page scaling, groups, layers, borders, and local save/reload behavior.

## Project structure

```text
js/
  canvas.js        main editor state and interaction logic
  polygons.js      polygon geometry, materials and shadows
  editor-controls.js touch navigation and export framing
  vtt-export.js    VTT images, UVTT geometry and serialization
  vtt-ui.js        platform presets and VTT export dialog
  scene.js         shared rendering and lighting
  geometry.js      hit testing, visibility and contour geometry
  borders.js       procedural border generation
  hud.js           interface controls
  storage.js       autosave and migration
  project-store.js IndexedDB project storage

css/               interface styles
tests/             Playwright browser integration checks
docs/              screenshots, examples and additional documentation
```

[DOCUMENTATION.MD](DOCUMENTATION.MD) contains older class-level documentation and notes about the previous renderer. [RELEASE_NOTES.md](RELEASE_NOTES.md) describes the current v1.5.0 release in more detail.

## Roadmap

Planned ideas include:

- Layer locking.
- Alignment and snapping tools.
- More built-in textures and symbols.
- Brush path connections and measurement tools.
- Further performance work for very large maps.

## Contributing

Bug reports, feature ideas, documentation fixes, and code contributions are welcome. See [CONTRIBUTING.MD](CONTRIBUTING.MD).

## License

Open Map Creator is released under the [MIT license](LICENCE).
