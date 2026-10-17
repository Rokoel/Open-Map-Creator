// Locally vendored Iconoir SVG paths. See assets/iconoir/LICENSE.txt.
export function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS(svg.namespaceURI, "use");
  use.setAttribute("href", `assets/iconoir/sprite.svg#${name}`);
  svg.append(use);
  return svg;
}
