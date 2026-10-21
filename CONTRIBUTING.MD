# Contributing

For bugs, [open an issue](https://github.com/Rokoel/Open-Map-Creator/issues) with steps to reproduce, what you expected, what happened, and your browser. A screenshot, console error, or small JSON project can help. For feature requests, explain what you want to do with the map editor.

## Run locally

The app uses plain JavaScript, HTML, CSS, and Canvas 2D. There is no build step.

```bash
git clone https://github.com/Rokoel/Open-Map-Creator.git
cd Open-Map-Creator
python3 -m http.server 8000
```

Open **http://localhost:8000**. Serve the files over HTTP so the JavaScript modules load. PDF export needs the jsPDF script loaded from a CDN.

## Making changes

Keep pull requests focused and describe the problem, the change, and how you checked it. Follow the surrounding code style. Add a regression check for a bug fix when practical.

Most editor state and mouse interactions live in `js/canvas.js`. Interface controls are in `js/hud.js` and `js/main.js`; rendering and lighting are in `js/scene.js`. PDF layout is shared by the exporter and page guides in `js/pdf-layout.js`. Saving is handled by `js/storage.js` and `js/project-store.js`.

## Tests

Set up Python and Playwright, then run the browser suite:

```bash
python3 -m venv .venv
.venv/bin/pip install -r tests/requirements.txt
.venv/bin/playwright install chromium
.venv/bin/python tests/browser_checks.py
```

The tests start their own local server and run in headless Chromium. For code changes, run the suite and try the affected controls in the browser. Documentation-only changes do not need a browser test run.

Contributions use the project's [MIT license](LICENCE). Keep third-party notices in [CREDITS.md](CREDITS.md) up to date when adding or changing dependencies.
