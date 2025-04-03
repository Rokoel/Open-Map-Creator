<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, maximum-scale=1.0"
    />
    <title>TTRPG Map Creator</title>
    <link rel="stylesheet" href="css/styles.css" />
    <!-- Basic styling for thumbnails and active layer -->
    <style>
      .image-thumbnail {
        width: 32px;
        height: 32px;
        border: 1px solid #ccc;
        cursor: pointer;
        object-fit: cover;
        margin: 2px;
      }
      .image-thumbnail:hover {
        border-color: #888;
      }
      #layerList li.active {
        font-weight: bold;
        background-color: #e0e0e0;
      }
      #hud { /* Basic HUD styling */
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid #ccc;
        padding: 15px;
        border-radius: 5px;
        max-height: 95vh;
        overflow-y: auto;
        width: 300px; /* Adjust as needed */
        box-shadow: 2px 2px 10px rgba(0,0,0,0.2);
        z-index: 10;
      }
      #mapCanvas {
        display: block; /* Remove extra space below canvas */
      }
      body {
        margin: 0;
        overflow: hidden; /* Prevent body scrolling */
      }
      label {
        display: inline-block;
        margin-bottom: 5px;
        margin-top: 5px;
      }
      input[type="color"] {
        vertical-align: middle;
        margin-left: 5px;
      }
      input[type="range"], input[type="number"] {
        width: 150px;
        vertical-align: middle;
      }
      button {
        margin: 3px;
        padding: 5px 10px;
      }
      h3, h4 {
        margin-top: 15px;
        margin-bottom: 5px;
        border-bottom: 1px solid #eee;
        padding-bottom: 3px;
      }
      #layerList {
        list-style: none;
        padding: 0;
        margin: 5px 0;
        max-height: 150px;
        overflow-y: auto;
        border: 1px solid #eee;
      }
      #layerList li {
        padding: 3px 5px;
        border-bottom: 1px solid #eee;
      }
      #layerList li:last-child {
        border-bottom: none;
      }
    </style>
  </head>
  <body>
    <!-- Main canvas container -->
    <canvas id="mapCanvas"></canvas>

    <!-- Floating HUD Popup -->
    <div id="hud">
      <h2>Map Creator Tools</h2>
      <div id="toolbar">
        <button data-instrument="gridDraw">Grid Draw</button>
        <button data-instrument="freeDraw">Free Draw</button>
        <button data-instrument="erase">Erase</button>
        <button data-instrument="addObject">Add Object</button>
        <button data-instrument="select">Select</button>
      </div>

      <!-- Canvas Settings Panel -->
      <div id="canvasSettings">
        <h3>Canvas Settings</h3>
        <label for="cellSize">Cell Size (16–256 px): </label>
        <input type="range" id="cellSize" min="16" max="256" value="32" />
      </div>

      <div id="emptyCellSettings">
        <h3>Empty Cell Appearance</h3>
        <label for="emptyFillColor">Fill Color: </label>
        <input id="emptyFillColor" type="color" value="#ffffff" /><br />
        <label for="emptyBorderColor">Border Color: </label>
        <input id="emptyBorderColor" type="color" value="#e0e0e0" /><br />
        <label for="emptyPattern">Pattern Image: </label>
        <input id="emptyPattern" type="file" accept="image/*" />
      </div>

      <!-- Appearance Effects Settings -->
      <div id="appearanceSettings">
        <h3>Appearance Effects</h3>

        <!-- Grid Shadows -->
        <h4>Grid Shadows</h4>
        <label for="shadowsEnabled">Enable Shadows: </label>
        <input type="checkbox" id="shadowsEnabled" /><br />
        <label for="shadowAngle">Angle (0-360): </label>
        <input type="range" id="shadowAngle" min="0" max="360" value="45" /><br />
        <label for="shadowOffset">Offset (cells): </label>
        <input
          type="number"
          id="shadowOffset"
          min="0"
          max="5"
          step="0.1"
          value="0.5"
        /><br />
        <label for="shadowColor">Color: </label>
        <input type="color" id="shadowColor" value="#00000080" /><br />

        <!-- Grid Borders -->
        <h4>Grid Borders</h4>
        <label for="bordersEnabled">Enable Borders: </label>
        <input type="checkbox" id="bordersEnabled" /><br />
        <label for="borderPattern">Border Pattern: </label>
        <input type="file" id="borderPattern" accept="image/*" /><br />
        <img
          id="borderPatternPreview"
          src="#"
          alt="Border Preview"
          style="max-width: 50px; max-height: 50px; display: none;"
        />
      </div>

      <!-- Instrument Settings -->
      <div id="instrumentSettings">
        <h3>Instrument Settings</h3>
        <!-- Instrument‑specific controls will be loaded here -->
      </div>

      <!-- Layer Controls -->
      <div id="layerControls">
        <h3>Layers</h3>
        <ul id="layerList"></ul>
        <button id="addLayer">Add Layer</button>
        <button id="removeLayer">Remove Selected Layer</button>
      </div>

      <!-- Export/Import/Restart Controls -->
      <div id="dataControls">
        <h3>Data</h3>
        <button id="exportMap">Export Map (JSON)</button>
        <button id="importMap">Import Map (JSON)</button>
        <button id="exportPDF">Export to PDF</button>
        <button id="clearCanvas">Clear Canvas</button>
        <button id="restart">Restart</button>
      </div>
    </div>

    <!-- Include jsPDF for PDF export -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>

    <!-- Main JS File -->
    <script type="module" src="js/main.js"></script>
  </body>
</html>