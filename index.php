<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, maximum-scale=1.0"
    />
    <title>TTRPG Map Creator</title>
    <link rel="stylesheet" href="css/styles.css"/>
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
        <input id="emptyFillColor" type="color" value="#ffffff" /><br/>
        <label for="emptyBorderColor">Border Color: </label>
        <input id="emptyBorderColor" type="color" value="#e0e0e0" /><br/>
        <label for="emptyPattern">Pattern Image: </label>
        <input id="emptyPattern" type="file" accept="image/*" />
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
