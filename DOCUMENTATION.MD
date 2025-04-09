> This document contains the project's documentation. Its purpose is to help clarify the code structure and provide a high-level overview. For your convenience when viewing on GitHub, a table of contents is automatically generated from the headings in `.md` files; look for the list icon near the top of the page.


# Open Map Creator - CanvasManager Documentation

This document provides documentation for the `CanvasManager` class, which is the core component responsible for managing the map canvas, rendering, user interactions, and data state in the Open Map Creator application.

## Overview

The `CanvasManager` handles:

*   Rendering the grid, layers, objects (grid cells, free-draw, custom), shadows, borders, and selections onto the HTML canvas.
*   Processing user input events like panning (middle mouse), zooming (scroll wheel), drawing (left mouse), and selecting.
*   Managing the map's data structure, including layers and different object types.
*   Maintaining the application state, including view transformations (pan/zoom), active tool, and settings.
*   Implementing undo/redo functionality via a history stack.
*   Providing methods for saving, loading, and exporting map data.

## Key Properties

*   `canvas`: The HTML `<canvas>` element being managed.
*   `ctx`: The 2D rendering context of the canvas.
*   `layers`: An array of layer objects. Each layer contains:
    *   `name` (string): The user-defined name of the layer.
    *   `objects` (Map): A map storing grid cell data (`cellId` -> `cellData`).
    *   `gridShadowOptions` (object): Settings specific to shadows for this layer (enabled, angle, offset, color).
    *   `visible` (boolean): Whether the layer is currently rendered.
*   `freeDrawObjects`: A `Map` storing data for freely drawn objects (`id` -> `objectData`).
*   `customObjects`: A `Map` storing data for placed custom objects (`id` -> `objectData`).
*   `activeLayerIndex`: The index of the currently active layer in the `layers` array.
*   `activeInstrument`: A string identifying the currently selected tool (e.g., "gridDraw", "select").
*   `offsetX`, `offsetY`: The current panning offset of the canvas view (in screen pixels).
*   `scale`: The current zoom level of the canvas view.
*   `currentCellSize`: The current logical size of a grid cell in screen pixels (can be changed by the user).
*   `selectedObjects`: An object containing arrays (`grid`, `free`, `custom`) of the IDs of currently selected objects.
*   `history`: An array storing snapshots (as JSON strings) of the application state for undo/redo.
*   `historyIndex`: An index pointing to the current position within the `history` array.
*   `copiedSelection`: Stores a deep copy of the data for selected objects, ready for pasting.
*   `emptyCellSettings`: Global settings for how empty grid cells are rendered.
*   `gridBorderOptions`: Global settings for rendering patterned borders around filled grid areas.
*   `freeDrawSettings`: Settings for the "Free Draw" tool.
*   `gridDrawSettings`: Settings for the "Grid Draw" tool.
*   `gridImageList`: An array storing image sources (data URIs or URLs) for grid patterns.
*   `customObjectImage`, `customObjectImageSrc`: The currently selected image/source for the "Add Object" tool.

## Methods

### `constructor(canvas)`

*   **Description:** Initializes a new `CanvasManager` instance. Sets up default properties, initializes layers, creates the rendering context, sets up event listeners, saves the initial history state, and performs the first render.
*   **Parameters:**
    *   `canvas` (HTMLCanvasElement): The canvas element to manage.

### `saveHistory()`

*   **Description:** Saves the current state of the canvas (layers, objects, settings) as a JSON string onto the history stack. Handles history limits and branching for redo.
*   **State Details:** Serializes layer data (including per-layer shadow options), object data (converting Image objects to their `src` strings), and global/tool settings.
*   **Side Effects:** Modifies `this.history` and `this.historyIndex`.

### `loadStateData(state)`

*   **Description:** Loads the application state from a provided *parsed* state object (typically from history or an imported file). Reconstructs layers, objects (including recreating `Image` objects from sources), and settings. Resets the selection state.
*   **Parameters:**
    *   `state` (Object): The parsed state object to load.
*   **Side Effects:** Overwrites most `CanvasManager` properties (`layers`, `objects`, `settings`, etc.). Triggers `render()` indirectly via `Image.onload`.

### `loadHistoryState(stateString)`

*   **Description:** Loads a specific state from the history stack. Parses the JSON `stateString` and calls `loadStateData` to apply it. Triggers a re-render.
*   **Parameters:**
    *   `stateString` (string): A JSON string representing a history state.
*   **Side Effects:** Modifies application state via `loadStateData`. Triggers `render()`. Logs errors if parsing fails.

### `undo()`

*   **Description:** Reverts the application state to the previous entry in the history stack.
*   **Side Effects:** Decrements `this.historyIndex`, calls `loadHistoryState()`.

### `redo()`

*   **Description:** Applies the next state from the history stack (re-doing a previously undone action).
*   **Side Effects:** Increments `this.historyIndex`, calls `loadHistoryState()`.

### `updateCellSize(newSize)`

*   **Description:** Sets the `currentCellSize` property and triggers a re-render.
*   **Parameters:**
    *   `newSize` (number): The new size for grid cells in screen pixels.
*   **Side Effects:** Modifies `this.currentCellSize`, triggers `render()`.

### `clearCanvas()`

*   **Description:** Removes all objects (grid cells, free-draw, custom) from all layers and clears the current selection. Does *not* reset history, allowing the clear action to be undone.
*   **Side Effects:** Clears `layer.objects`, `freeDrawObjects`, `customObjects`, `selectedObjects`. Triggers `render()`.

### `resizeCanvas()`

*   **Description:** Resizes the managed canvas element to match the current window dimensions and triggers a re-render.
*   **Side Effects:** Modifies `this.canvas.width` and `this.canvas.height`. Triggers `render()`.

### `screenToWorld(screenX, screenY)`

*   **Description:** Converts screen pixel coordinates (e.g., from mouse events) to world coordinates, accounting for the current pan (`offsetX`, `offsetY`) and zoom (`scale`).
*   **Parameters:**
    *   `screenX` (number): The x-coordinate on the screen.
    *   `screenY` (number): The y-coordinate on the screen.
*   **Returns:** `({x: number, y: number})` An object containing the corresponding world coordinates.

### `worldToScreen(worldX, worldY)`

*   **Description:** Converts world coordinates to screen pixel coordinates, accounting for the current pan (`offsetX`, `offsetY`) and zoom (`scale`).
*   **Parameters:**
    *   `worldX` (number): The x-coordinate in the world space.
    *   `worldY` (number): The y-coordinate in the world space.
*   **Returns:** `({x: number, y: number})` An object containing the corresponding screen coordinates.

### `setupEventListeners()`

*   **Description:** Attaches all necessary event listeners to the canvas (and window where needed) to handle user interactions like panning, zooming, drawing, selecting, and context menu prevention.
*   **Side Effects:** Adds event listeners (`wheel`, `mousedown`, `mousemove`, `mouseup`, `contextmenu`).

### `handleDrawing(worldPos, event)`

*   **Description:** Processes drawing actions based on the `activeInstrument`. Called during mouse drag events when `isDrawing` is true. Handles logic for grid drawing, free drawing (including period), erasing, and adding objects.
*   **Parameters:**
    *   `worldPos` ({x: number, y: number}): The current mouse position in world coordinates.
    *   `event` (Event): The original mouse event (currently unused).
*   **Side Effects:** Modifies `layer.objects`, `freeDrawObjects`, or `customObjects` depending on the tool. Triggers `render()`. Updates `lastFreeDrawPosition`.

### `getObjectAtWorldPos(worldPos)`

*   **Description:** Finds the topmost object (Custom, Free Draw, or Grid Cell on active layer) at the given world coordinates.
*   **Parameters:**
    *   `worldPos` ({x: number, y: number}): The world coordinates to check.
*   **Returns:** `(Object | null)` An object describing the found object (`{type, id, object}`) or `null` if no object is found.

### `isObjectSelected(objInfo)`

*   **Description:** Checks if the object described by `objInfo` is currently in the `selectedObjects` list.
*   **Parameters:**
    *   `objInfo` (Object | null): An object describing the object to check (as returned by `getObjectAtWorldPos`).
*   **Returns:** `(boolean)` `true` if the object is selected, `false` otherwise.

### `finalizeSelection()`

*   **Description:** Determines which objects are selected based on either a click (`selectionStart` equals `selectionEnd`) or a drag rectangle. Updates `this.selectedObjects`. Called on mouse up when `isSelecting` is true.
*   **Side Effects:** Modifies `this.selectedObjects`. Resets `selectionStart`, `selectionEnd`. Calls `window.hudInstance.loadInstrumentSettings()`.

### `moveSelection(dxWorld, dyWorld)`

*   **Description:** Moves currently selected Free Draw and Custom objects by the given world coordinate delta. Grid cells are not moved.
*   **Parameters:**
    *   `dxWorld` (number): The change in the x-coordinate (world space).
    *   `dyWorld` (number): The change in the y-coordinate (world space).
*   **Side Effects:** Modifies the `x`, `y` properties of selected objects. Calls `window.hudInstance.loadInstrumentSettings()`.

### `getSelectionCenter()`

*   **Description:** Calculates the geometric center (average position) of all currently selected objects (Grid, Free Draw, Custom).
*   **Returns:** `({x: number, y: number} | null)` The center point in world coordinates, or `null` if nothing is selected.

### `rotateSelection(deltaDegrees)`

*   **Description:** Rotates selected Free Draw and Custom objects around their collective center by the specified angle. Updates the `rotation` property for Custom objects. Grid cells are not rotated.
*   **Parameters:**
    *   `deltaDegrees` (number): The angle to rotate by in degrees.
*   **Side Effects:** Modifies object positions and `rotation`. Triggers `render()`. Calls `window.hudInstance.loadInstrumentSettings()`. Saves history.

### `resizeSelection(scaleFactor)`

*   **Description:** Resizes selected Free Draw and Custom objects relative to their collective center by the specified factor. Updates `size` for Free Draw and `width`/`height` for Custom objects. Grid cells are not resized.
*   **Parameters:**
    *   `scaleFactor` (number): The factor to scale by (e.g., 1.1 for 10% larger, 0.9 for 10% smaller). Must be > 0.
*   **Side Effects:** Modifies object positions and dimensions. Triggers `render()`. Calls `window.hudInstance.loadInstrumentSettings()`. Saves history.

### `deleteSelection()`

*   **Description:** Deletes all currently selected objects (Grid cells from active layer, Free Draw, Custom). Clears the selection state.
*   **Side Effects:** Removes objects from data structures. Clears `selectedObjects`. Triggers `render()`. Calls `window.hudInstance.loadInstrumentSettings()`. Saves history if objects were deleted.

### `copySelection()`

*   **Description:** Creates deep copies of the data for currently selected objects and stores them in `this.copiedSelection`. Image objects are represented by their source strings.
*   **Side Effects:** Modifies `this.copiedSelection`. Calls `window.hudInstance.loadInstrumentSettings()`.

### `pasteSelection()`

*   **Description:** Pastes the objects stored in `this.copiedSelection` onto the canvas. Calculates paste position based on the current mouse position (`this.mouseX`, `this.mouseY`) relative to the bounding box of the copied items. Recreates Image objects from sources.
*   **Side Effects:** Adds new objects to data structures. Triggers `render()`. Calls `window.hudInstance.loadInstrumentSettings()`. Saves history.

### `render()`

*   **Description:** Schedules a canvas redraw using `requestAnimationFrame`, which calls `_doRender()`. This is the public method to trigger a repaint.

### `_doRender()` (Internal)

*   **Description:** Performs the actual rendering cycle. Clears the canvas, applies view transformations (pan/zoom), calculates visible bounds, and calls specific drawing functions for the grid, layers (including shadows/borders/cells), global objects, and selection visuals. Uses culling based on `viewBounds`.

### `drawGrid(ctx, cellSize, viewBounds)`

*   **Description:** Draws the background grid lines and the appearance of empty cells (color/pattern) within the specified `viewBounds`. Determines emptiness by checking across all visible layers.
*   **Parameters:**
    *   `ctx` (CanvasRenderingContext2D): The context to draw on.
    *   `cellSize` (number): The current cell size in screen pixels.
    *   `viewBounds` (Object): The visible area in world coordinates.

### `drawGridShadows(ctx, cellSize, viewBounds, layerObjects, shadowOptions)`

*   **Description:** Draws shadows cast by the filled cells (`layerObjects`) of a specific layer, using the provided `shadowOptions`. Uses an offscreen buffer to handle overlaps correctly and applies the final result with transparency to the main `ctx`. Only draws shadows within the `viewBounds`.
*   **Parameters:**
    *   `ctx` (CanvasRenderingContext2D): The main context to draw the final shadows onto.
    *   `cellSize` (number): Current cell size in screen pixels.
    *   `viewBounds` (Object): Visible area in world coordinates.
    *   `layerObjects` (Map): The `objects` map from the specific layer casting shadows.
    *   `shadowOptions` (Object): The `gridShadowOptions` from the specific layer.

### `drawGridBorders(ctx, cellSize, viewBounds, layerObjects)`

*   **Description:** Draws patterned borders in empty cells adjacent to filled cells from the specified `layerObjects`. Uses the global `this.gridBorderOptions` for the pattern image and enabled status. Only draws borders within the `viewBounds`.
*   **Parameters:**
    *   `ctx` (CanvasRenderingContext2D): The context to draw on.
    *   `cellSize` (number): Current cell size in screen pixels.
    *   `viewBounds` (Object): Visible area in world coordinates.
    *   `layerObjects` (Map): The `objects` map from the specific layer whose edges determine border placement.

### `drawGridCell(cell)`

*   **Description:** Draws a single filled grid cell (either a color or an image pattern) and its border.
*   **Parameters:**
    *   `cell` (Object): The cell data object containing `x`, `y`, `type`, `fillColor` or `image`, `borderColor`.

### `drawFreeDrawObject(obj)`

*   **Description:** Draws a single free-draw object (either an image or a default circle shape) with its fill and stroke.
*   **Parameters:**
    *   `obj` (Object): The free-draw object data.

### `drawCustomObject(obj)`

*   **Description:** Draws a single custom object (usually an image), applying its translation, rotation, and scaling. Draws a placeholder if the image is missing or invalid.
*   **Parameters:**
    *   `obj` (Object): The custom object data containing `x`, `y`, `width`, `height`, `rotation`, `image`.

### `drawSelectionRect()`

*   **Description:** Draws the dashed rectangle visible during a drag-selection operation. Uses `selectionStart` and `selectionEnd`.

### `drawSelectionHighlights()`

*   **Description:** Draws visual highlights (e.g., outlines) around all objects currently listed in `selectedObjects`. Handles different highlight styles for grid, free-draw, and custom objects.

### `getLogicalBoundingBox()`

*   **Description:** Calculates the smallest rectangle (in logical grid units) that encompasses all drawn content (grid cells, free-draw objects, custom objects) across all layers. Returns a default box if the map is empty. Adds padding.
*   **Returns:** `({minX, minY, maxX, maxY, width, height})` The bounding box in logical coordinates.

### `drawAll(ctx, exportScale)`

*   **Description:** Renders the *entire* map content onto a given context (`ctx`), typically an offscreen canvas for PDF export. Uses logical coordinates and ignores the current view's pan/zoom. Iterates through layers to draw background, grid, shadows, borders, cells, and finally global objects.
*   **Parameters:**
    *   `ctx` (CanvasRenderingContext2D): The target context to draw onto.
    *   `exportScale` (number): The scale factor used for export (pixels per logical unit). *Currently unused within the function itself but passed for potential future use.*

### `drawPdfBackgroundAndGrid(ctx, bbox)`

*   **Description:** Helper function used by `drawAll` to draw the background fill, pattern, and grid lines for the entire map area defined by `bbox` onto the PDF export context. Uses logical coordinates.
*   **Parameters:**
    *   `ctx` (CanvasRenderingContext2D): The PDF export context.
    *   `bbox` (Object): The logical bounding box of the entire map.

### `drawAllGridShadows(ctx, logicalCellSize, layerObjects, shadowOptions)`

*   **Description:** Renders shadows for a specific layer onto the PDF export context (`ctx`). Similar to `drawGridShadows` but operates entirely in the logical coordinate space defined by the PDF context's transform and uses `logicalCellSize` (typically 1).
*   **Parameters:**
    *   `ctx` (CanvasRenderingContext2D): The PDF export context.
    *   `logicalCellSize` (number): The size of one cell in logical units (usually 1).
    *   `layerObjects` (Map): The `objects` map from the specific layer casting shadows.
    *   `shadowOptions` (Object): The `gridShadowOptions` from the specific layer.

### `drawAllGridBorders(ctx, logicalCellSize, layerObjects)`

*   **Description:** Renders patterned borders for a specific layer onto the PDF export context (`ctx`). Similar to `drawGridBorders` but operates in logical coordinates. Uses global border options but checks emptiness against the passed `layerObjects`.
*   **Parameters:**
    *   `ctx` (CanvasRenderingContext2D): The PDF export context.
    *   `logicalCellSize` (number): The size of one cell in logical units (usually 1).
    *   `layerObjects` (Map): The `objects` map from the specific layer.

### `getMapData()`

*   **Description:** Creates and returns a serializable object representing the entire current map state (layers, objects, settings), suitable for saving to JSON. Does *not* modify the history stack.
*   **Returns:** `(Object)` The complete map state data.

### `loadMapData(data)`

*   **Description:** Loads a complete map state from a provided data object. Resets the history stack, saves the loaded state as the initial history entry, triggers a render, and updates the HUD.
*   **Parameters:**
    *   `data` (Object): The map state data object to load.
*   **Side Effects:** Overwrites entire application state. Resets history. Triggers `render()`. Updates HUD via `window.hudInstance`.

### `setActiveLayer(index)`

*   **Description:** Sets the layer at the given `index` as the active one. Clears the current selection and updates the HUD's appearance controls to reflect the newly active layer's settings.
*   **Parameters:**
    *   `index` (number): The index of the layer to activate.
*   **Side Effects:** Modifies `this.activeLayerIndex`, `this.selectedObjects`. Triggers `render()`. Updates HUD via `window.hudInstance`.

### `addLayer()`

*   **Description:** Creates a new layer with default settings (including default shadow options), adds it to the `layers` array, sets it as the active layer, and updates the HUD.
*   **Side Effects:** Modifies `this.layers`, `this.activeLayerIndex`. Triggers `render()`. Updates HUD. Saves history.

### `removeActiveLayer()`

*   **Description:** Removes the currently active layer, unless it's the last layer. Adjusts `activeLayerIndex` and updates the HUD.
*   **Side Effects:** Modifies `this.layers`, `this.activeLayerIndex`. Triggers `render()`. Updates HUD. Saves history. Displays an alert if trying to remove the last layer.

### `setActiveInstrument(instrument)`

*   **Description:** Sets the currently active drawing/interaction tool and updates the canvas cursor style accordingly.
*   **Parameters:**
    *   `instrument` (string): The name of the tool to activate (e.g., "gridDraw", "select").
*   **Side Effects:** Modifies `this.activeInstrument`, `this.canvas.style.cursor`.

### `_cellId(cellX, cellY)` (Internal Helper)

*   **Description:** Generates a unique string ID for a grid cell based on its coordinates.
*   **Parameters:**
    *   `cellX` (number): The x-coordinate (column index) of the cell.
    *   `cellY` (number): The y-coordinate (row index) of the cell.
*   **Returns:** `(string)` The cell ID in the format "X_Y".

### `_isCellFilled(x, y)` (Internal Helper)

*   **Description:** Checks if the cell at the given grid coordinates (`x`, `y`) contains an object in the *currently active* layer.
*   **Parameters:**
    *   `x` (number): The x-coordinate (column index) of the cell.
    *   `y` (number): The y-coordinate (row index) of the cell.
*   **Returns:** `(boolean)` `true` if the cell is filled on the active layer, `false` otherwise.



# Open Map Creator - HUD Documentation

This document provides documentation for the `HUD` (Heads-Up Display) class, which manages the user interface panel containing tools, settings, layer controls, and data management options.

## Overview

The `HUD` class is responsible for:

*   Setting up event listeners for all interactive elements within the HUD panel (buttons, sliders, color pickers, file inputs, etc.).
*   Dynamically updating the "Instrument Settings" section based on the tool selected in the `CanvasManager`.
*   Reflecting the current state of the `CanvasManager` (e.g., active layer, shadow/border settings for the active layer, cell size) in the UI controls.
*   Communicating user changes made in the HUD back to the `CanvasManager` to update the application state and trigger re-renders or history saves.
*   Managing the display of the layer list.

## Key Properties

*   `canvasManager`: A reference to the main `CanvasManager` instance.
*   `storageManager`: A reference to the main `StorageManager` instance.
*   `layerList`: A reference to the `<ul>` element used to display the layer list.

## Methods

### `constructor(canvasManager, storageManager)`

*   **Description:** Initializes a new `HUD` instance. Stores references to the `CanvasManager` and `StorageManager`, calls various setup methods to initialize UI elements and event listeners, and makes the HUD instance globally accessible via `window.hudInstance` (for easier updates from `CanvasManager`).
*   **Parameters:**
    *   `canvasManager` (CanvasManager): The main canvas manager instance.
    *   `storageManager` (StorageManager): The main storage manager instance.
*   **Side Effects:** Adds event listeners to numerous DOM elements. Sets `window.hudInstance`.

### `setupToolbar()`

*   **Description:** Sets up event listeners for the main toolbar buttons. When a tool button is clicked, it calls `canvasManager.setActiveInstrument()`, updates the instrument settings panel via `loadInstrumentSettings()`, and visually highlights the active button.
*   **Side Effects:** Adds click listeners to toolbar buttons. Modifies button styles.

### `setupEmptyCellSettings()`

*   **Description:** Initializes the controls for setting the appearance of empty grid cells (fill color, border color, pattern image) and adds event listeners. Updates `canvasManager.emptyCellSettings` and triggers renders/history saves when values change. Handles pattern image file loading using `FileReader`.
*   **Side Effects:** Adds input/change listeners to empty cell setting controls. Modifies `canvasManager.emptyCellSettings`. Triggers `render()` and `saveHistory()`.

### `setupCanvasSettings()`

*   **Description:** Initializes the cell size slider control and adds an event listener to update the `canvasManager.currentCellSize` when the slider value changes.
*   **Side Effects:** Adds input listener to the cell size slider. Calls `canvasManager.updateCellSize()`.

### `setupLayerControls()`

*   **Description:** Sets up event listeners for the "Add Layer" and "Remove Selected Layer" buttons. Calls the corresponding methods on `CanvasManager` and updates the layer list display via `updateLayerList()`. Includes confirmation prompts for layer removal.
*   **Side Effects:** Adds click listeners to layer control buttons. Calls `canvasManager.addLayer()` or `canvasManager.removeActiveLayer()`. Calls `updateLayerList()`.

### `updateLayerList()`

*   **Description:** Clears and rebuilds the HTML list (`this.layerList`) representing the layers managed by `CanvasManager`. Highlights the currently active layer and adds click listeners to each layer item to allow the user to switch the active layer via `canvasManager.setActiveLayer()`.
*   **Side Effects:** Modifies the DOM within the `#layerList` element. Adds click listeners to list items.

### `setupAppearanceSettings()`

*   **Description:** Initializes controls and sets up event listeners for the appearance effects section (currently Grid Shadows and Grid Borders). Handles enabling/disabling effects, adjusting shadow angle (synchronizing slider and number input), offset, color (RGB), and opacity (alpha). Handles border pattern image uploads and previews. Updates the *active layer's* `gridShadowOptions` or the global `gridBorderOptions` in `CanvasManager` and triggers renders/history saves.
*   **Side Effects:** Adds input/change listeners to appearance setting controls. Modifies `activeLayer.gridShadowOptions` or `canvasManager.gridBorderOptions`. Triggers `render()` and `saveHistory()`. Updates the alpha display span.

### `updateAppearanceControls()`

*   **Description:** Updates the values and states of the appearance controls (shadows, borders) in the HUD to match the settings of the *currently active layer* in `CanvasManager` (for shadows) or the global settings (for borders). Ensures the UI accurately reflects the loaded or current state. Handles parsing the `#rrggbbaa` color format for the separate RGB and Alpha controls.
*   **Side Effects:** Modifies the `value` or `checked` properties of DOM elements within the `#appearanceSettings` section. Updates the alpha display span and border preview image.

### `loadInstrumentSettings(instrument)`

*   **Description:** Dynamically populates the "Instrument Settings" section of the HUD with controls relevant to the specified `instrument`. Clears previous settings first. Creates and configures inputs (color, number, file, checkbox), buttons, labels, and image previews/lists specific to each tool (Grid Draw, Free Draw, Add Object, Select, Erase). Adds event listeners to these dynamic controls to update the corresponding settings objects (`gridDrawSettings`, `freeDrawSettings`, etc.) in `CanvasManager`. Handles image uploads and pattern selection for relevant tools. Disables selection action buttons if nothing is selected.
*   **Parameters:**
    *   `instrument` (string): The name of the instrument whose settings should be loaded.
*   **Side Effects:** Modifies the DOM within the `#instrumentSettings` section. Adds event listeners to dynamically created elements. Calls `canvasManager` methods indirectly via listeners.



# Open Map Creator - StorageManager Documentation

This document provides documentation for the `StorageManager` class, responsible for handling data persistence, including saving, loading, exporting, and importing map data.

## Overview

The `StorageManager` acts as an interface between the `CanvasManager` (which holds the map state) and storage mechanisms (localStorage, file downloads/uploads). Its responsibilities include:

*   Exporting the current map state to a downloadable JSON file.
*   Importing map state from a user-selected JSON file.
*   Automatically saving the map state to the browser's localStorage at regular intervals and before page unload.
*   Automatically loading the map state from localStorage when the application starts.
*   Exporting the map to a multi-page, print-ready PDF file with user-configurable settings.

## Key Properties

*   `canvasManager`: A reference to the main `CanvasManager` instance.

## Methods

### `constructor(canvasManager)`

*   **Description:** Initializes a new `StorageManager` instance. Stores a reference to the `CanvasManager`.
*   **Parameters:**
    *   `canvasManager` (CanvasManager): The main canvas manager instance.

### `exportMap()`

*   **Description:** Retrieves the current map data from `CanvasManager` using `getMapData()`, adds versioning information, converts it to a formatted JSON string, and initiates a file download for the user. Includes basic error handling.
*   **Side Effects:** Creates and clicks a temporary download link.

### `importMap()`

*   **Description:** Creates a temporary file input element, allowing the user to select a JSON map file. Reads the file, parses the JSON content, performs basic validation, confirms overwrite with the user, and then calls `canvasManager.loadMapData()` to load the state. Includes error handling for file reading and parsing.
*   **Side Effects:** Creates and clicks a temporary file input. Can potentially call `canvasManager.loadMapData()`. Displays alerts on error or confirmation prompts.

### `autoSaveMap()`

*   **Description:** Retrieves the current map data from `CanvasManager`, adds versioning info, converts it to JSON, and saves it to `localStorage` using the key defined in `constants.localStorageKey`. Includes error handling, particularly for `QuotaExceededError`.
*   **Side Effects:** Writes data to `localStorage`.

### `autoLoadMap()`

*   **Description:** Attempts to load map data from `localStorage` using the predefined key. If data exists, it parses the JSON, performs basic validation, and calls `canvasManager.loadMapData()`. If loading fails or data is invalid, it removes the item from `localStorage`. Logs status messages to the console.
*   **Side Effects:** Reads from `localStorage`. Can potentially call `canvasManager.loadMapData()`. Can potentially remove data from `localStorage`.

### `exportPDF()`

*   **Description:** Orchestrates the process of exporting the map to a multi-page PDF suitable for printing.
    1.  Prompts the user for configuration settings (page size, orientation, DPI, physical cell size).
    2.  Calculates the necessary export resolution (`exportScale`) and pixel dimensions for the full map and individual PDF pages.
    3.  Determines the map's logical bounding box using `canvasManager.getLogicalBoundingBox()`.
    4.  Creates a large offscreen canvas matching the total export pixel dimensions.
    5.  Renders the *entire* map onto the offscreen canvas using logical coordinates by calling `canvasManager.drawAll()`.
    6.  Initializes a `jsPDF` document with the calculated page dimensions.
    7.  Tiles the rendered image from the offscreen canvas onto individual pages of the PDF document. Each tile is drawn onto a temporary canvas first to generate a PNG data URL, which is then added to the PDF page.
    8.  Optionally adds page number annotations.
    9.  Initiates the download of the generated PDF file.
*   **Side Effects:** Creates multiple temporary canvas elements. Uses significant memory for the offscreen canvas depending on map size and DPI. Initiates a file download. Displays alerts on error. Uses the external `jsPDF` library.



# Open Map Creator - Main Script Documentation (`main.js`)

This document describes the `main.js` script, which serves as the entry point and central coordinator for the Open Map Creator application.

## Overview

The `main.js` script performs the following key functions:

*   Imports necessary modules (`CanvasManager`, `HUD`, `StorageManager`, `constants`).
*   Waits for the DOM to be fully loaded before initializing the application.
*   Creates instances of the core manager classes (`CanvasManager`, `StorageManager`, `HUD`).
*   Initiates the auto-loading of saved map data from localStorage.
*   Sets up global event listeners for:
    *   Data control buttons (Export JSON, Import JSON, Export PDF, Clear Canvas, Restart).
    *   Keyboard shortcuts (Undo, Redo, Delete Selection, Copy Selection, Paste Selection).
    *   Automatic saving to localStorage (periodically and before page unload).
*   Handles confirmation dialogs for potentially destructive actions (Clear Canvas, Restart).
*   Coordinates updates between managers and the HUD after certain actions (e.g., loading data, undo/redo, restart).

## Execution Flow

1.  **Imports:** Modules are loaded.
2.  **`DOMContentLoaded` Listener:** Waits for the HTML page to be ready.
3.  **Initialization:**
    *   Gets the main canvas element.
    *   Creates `CanvasManager`.
    *   Creates `StorageManager`.
    *   Creates `HUD`.
    *   Calls `storageManager.autoLoadMap()` to load any previously saved state. This might trigger updates in `CanvasManager` and subsequently the HUD via `loadMapData`.
    *   Calls HUD update methods (`updateLayerList`, `updateAppearanceControls`, `loadInstrumentSettings`) to ensure the UI reflects the initial state (either default or loaded).
4.  **Event Listener Setup:** Attaches listeners to buttons in the "Data Controls" section and global `keydown` / `beforeunload` listeners.
5.  **Auto-Save Timer:** Starts an interval timer using `setInterval` to call `storageManager.autoSaveMap()` periodically.

## Key Event Handlers

*   **Data Control Buttons:** Delegate actions to the appropriate methods in `StorageManager` or `CanvasManager`. Include confirmation prompts where necessary. The "Restart" handler performs a full reset of `CanvasManager` state, clears localStorage, and updates the HUD to defaults.
*   **`keydown` Listener:**
    *   Handles `Ctrl+Z` / `Cmd+Z` for Undo, calling `canvasManager.undo()` and updating the HUD.
    *   Handles `Ctrl+Shift+Z` / `Cmd+Shift+Z` for Redo, calling `canvasManager.redo()` and updating the HUD.
    *   Handles `Delete` / `Backspace` (when not focused on an input) for deleting the current selection via `canvasManager.deleteSelection()`.
    *   Handles `Ctrl+C` / `Cmd+C` for copying the selection via `canvasManager.copySelection()`.
    *   Handles `Ctrl+V` / `Cmd+V` for pasting the selection via `canvasManager.pasteSelection()`.
    *   Includes checks to prevent interference with text input fields.
*   **`beforeunload` Listener:** Calls `storageManager.autoSaveMap()` to attempt saving the latest changes before the user leaves the page.
*   **`setInterval` Timer:** Calls `storageManager.autoSaveMap()` at the interval defined in `constants.autoSaveInterval`.

## Global Dependencies

*   Relies on the DOM elements defined in `index.php`/`index.html` having the correct IDs.
*   Uses `window.hudInstance` (set by `HUD`) to trigger HUD updates after certain actions like loading or undo/redo.
*   Uses the `constants` object for configuration values.
*   Uses the external `jsPDF` library (expected to be available globally via `<script>` tag).



# Open Map Creator - Constants Documentation (`constants.js`)

This document describes the constants defined in `js/constants.js`, used for configuration throughout the Open Map Creator application.

## Overview

The `constants.js` file exports a single object (`constants`) containing various configuration values to ensure consistency and ease of modification. These constants cover default appearances, behaviour settings, file naming, storage keys, and PDF export parameters.

## Constants

*   **Default Colors:**
    *   `defaultEmptyCellFillColor` (string): Default background color for empty grid cells (`#ffffff`).
    *   `defaultEmptyCellBorderColor` (string): Default border color for empty grid cells (`#e0e0e0`).
    *   `defaultGridDrawFillColor` (string): Default fill color for the Grid Draw tool (`#000000`).
    *   `defaultGridDrawBorderColor` (string): Default border color for the Grid Draw tool (`#aaaaaa`).
    *   `defaultFreeFillColor` (string): Default fill color for the Free Draw tool (`#000000`).
    *   `defaultFreeBorderColor` (string): Default stroke color for the Free Draw tool (`#000000`).
    *   `attentionColor` (string): Color used for placeholders or non-critical warnings (`#ffcc00`).
    *   `errorColor` (string): Color used to indicate errors, e.g., failed image loading (`#ff00ff`).
    *   `selectionRectColor` (string): Color of the dashed rectangle shown during drag selection (`#0000ff`).
    *   `selectionHighlightColor` (string): Color of the outline drawn around selected objects (`#00ffff`).

*   **Default Settings:**
    *   `baseCellSize` (number): The initial size of grid cells in pixels when the application loads (`32`).
    *   `autoSaveInterval` (number): The interval in milliseconds for automatically saving the map to localStorage (`10000`).
    *   `historyLimit` (number): The maximum number of undo steps to store (`50`).

*   **File Names & Storage:**
    *   `mapBackupFileName` (string): The base filename used for exported JSON map files (`ttrpg_map_export`).
    *   `mapPDFFileName` (string): The base filename used for exported PDF map files (`ttrpg_map_print`).
    *   `localStorageKey` (string): The key used to store map data in the browser's localStorage (`ttrpgMapCreatorData`).
    *   `saveFileVersion` (string): A version string embedded in saved/exported files to potentially handle future format changes (`1.2.0`).

*   **PDF Export Page Sizes:**
    *   `pageSizesMM` (object): An object containing standard paper sizes with their dimensions in millimeters.
        *   `A4`: `{ width: 210, height: 297 }`
        *   `A3`: `{ width: 297, height: 420 }`

*   **Default Shadow Options:**
    *   `defaultGridShadowOptions` (object): Default settings applied to new layers for grid shadows.
        *   `enabled` (boolean): `false`
        *   `angle` (number): `45` (degrees)
        *   `offset` (number): `0.5` (in cells)
        *   `color` (string): `"#00000080"` (semi-transparent black in #RRGGBBAA format)
