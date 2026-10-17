# Contributing to Open Map Creator

Contributions are welcome, including bug reports, feature ideas, documentation fixes, example maps, and code changes.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.MD).

## Development setup

Open Map Creator is a static browser application built with JavaScript, HTML, CSS, and Canvas 2D.

```bash
git clone https://github.com/Rokoel/Open-Map-Creator.git
cd Open-Map-Creator
python3 -m http.server 8000
```

Open **http://localhost:8000**.

There is no build step.

## Code structure

The main files are:

- `js/canvas.js` — editor state and interactions.
- `js/scene.js` — shared rendering and lighting.
- `js/geometry.js` — geometry, hit testing, visibility, and contours.
- `js/borders.js` — procedural border generation.
- `js/hud.js` — interface controls.
- `js/storage.js` and `js/project-store.js` — local persistence.

Try to keep new logic in the most relevant module rather than expanding `canvas.js` unless it directly belongs to editor state or interaction handling.

## Testing

Set up the browser integration tests with:

```bash
python3 -m venv .venv
.venv/bin/pip install -r tests/requirements.txt
.venv/bin/playwright install chromium
.venv/bin/python tests/browser_checks.py
```

For code changes, run the integration suite and manually test the behavior you changed when practical.

## Pull requests

For non-trivial changes:

1. Create a branch.
2. Make the change and keep it focused.
3. Add or update tests when the behavior can be covered reliably.
4. Run the existing test suite.
5. Open a pull request describing what changed and why.

Please follow the existing code style. Comments are most useful around non-obvious geometry, rendering, persistence, and browser-behavior decisions.

## Bug reports

A useful bug report includes:

- steps to reproduce;
- expected behavior;
- actual behavior;
- browser and operating system;
- screenshots or console errors when relevant.

## Feature ideas

Feature requests are welcome. Describe the use case first, then the proposed behavior. Mockups or example maps are useful for UI and rendering changes.

## License

By contributing, you agree that your contribution is licensed under the same [MIT license](LICENCE) as the project.
