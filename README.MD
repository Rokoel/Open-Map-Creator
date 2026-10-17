# Open Map Creator

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENCE)
[![Release: v1.4.0](https://img.shields.io/badge/release-v1.4.0-blue.svg)](https://github.com/Rokoel/Open-Map-Creator/releases/tag/v1.4.0)

A browser-based map editor for tabletop RPGs. Draw dungeons, add textures and objects, place lights, and export maps as images or printable PDFs with a chosen physical cell size.

**[Open the app](https://rokoel.github.io/Open-Map-Creator/)** · **[Release notes](RELEASE_NOTES.md)** · **[Example PDF](docs/examples/open-map-creator-example.pdf)**

![Open Map Creator in dark mode](docs/media/editor-layers-lighting.png)

## Highlights

- Infinite canvas with pan, zoom, grid drawing, brushes, image objects, and layers.
- Randomized tilesets with rotation, mirroring, and color variation.
- Object selection, resize/rotate handles, copy/paste, grouping, and layer transfer.
- Layer-aware lights, ray-cast shadows, ambient lighting, and optional baked lightmaps.
- Procedural dungeon borders and custom edge/corner artwork.
- Undo/redo and local autosave with IndexedDB.
- Editable JSON, PNG, and tiled PDF export.
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

## Testing

Browser integration tests use Python and Playwright:

```bash
python3 -m venv .venv
.venv/bin/pip install -r tests/requirements.txt
.venv/bin/playwright install chromium
.venv/bin/python tests/browser_checks.py
```

The suite runs the editor in Chromium and checks core interactions, rendering, groups, layers, lighting, borders, exports, and local save/reload behavior.

## Project structure

```text
js/
  canvas.js        main editor state and interaction logic
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

[DOCUMENTATION.MD](DOCUMENTATION.MD) contains older class-level documentation and notes about the previous renderer. [RELEASE_NOTES.md](RELEASE_NOTES.md) describes the current v1.4.0 release in more detail.

## Roadmap

Planned ideas include:

- Layer locking.
- Alignment and snapping tools.
- More built-in textures and symbols.
- VTT-oriented export formats.
- Brush path connections and measurement tools.
- Further performance work for very large maps.

## Contributing

Bug reports, feature ideas, documentation fixes, and code contributions are welcome. See [CONTRIBUTING.MD](CONTRIBUTING.MD).

## License

Open Map Creator is released under the [MIT license](LICENCE).
