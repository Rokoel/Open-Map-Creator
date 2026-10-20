import { constants } from "./constants.js";

export const sheetMarginDefaults = { top: 5, right: 5, bottom: 5, left: 5 };

// Keep page guides, raster slicing, and PDF placement on one physical layout.
// Whole-pixel tiles may leave less than one pixel of extra white paper at the
// right/bottom edge. Every source pixel still prints at exactly 25.4 / DPI mm.
export function pdfLayout(settings = {}) {
  const paper = constants.pageSizesMM[settings.paper] || constants.pageSizesMM.A4;
  const orientation = settings.orientation === "portrait" ? "portrait" : "landscape";
  const widthMM = orientation === "landscape" ? paper.height : paper.width;
  const heightMM = orientation === "landscape" ? paper.width : paper.height;
  const dpi = Math.max(36, Math.min(600, Number(settings.dpi) || 150));
  const cellSizeCM = Math.max(.1, Math.min(10, Number(settings.cellSize) || 2.5));
  const margins = { ...sheetMarginDefaults, ...settings.sheetMargins };
  for (const side of Object.keys(sheetMarginDefaults)) {
    margins[side] = Number(margins[side]);
    if (!Number.isFinite(margins[side]) || margins[side] < 0 || margins[side] > 100)
      throw Error("Sheet margins must be between 0 and 100 mm.");
  }
  const pixelsPerMM = dpi / 25.4, exportScale = cellSizeCM * 10 * pixelsPerMM;
  const contentWidthPx = Math.floor((widthMM - margins.left - margins.right) * pixelsPerMM + 1e-9);
  const contentHeightPx = Math.floor((heightMM - margins.top - margins.bottom) * pixelsPerMM + 1e-9);
  if (contentWidthPx < 1 || contentHeightPx < 1)
    throw Error("Sheet margins leave no printable area. Reduce the margins or choose larger paper.");
  return { orientation, widthMM, heightMM, dpi, cellSizeCM, margins, pixelsPerMM,
    exportScale, contentWidthPx, contentHeightPx,
    widthCells: contentWidthPx / exportScale, heightCells: contentHeightPx / exportScale };
}

export function* pdfTiles(layout, width, height) {
  const columns = Math.ceil(width / layout.contentWidthPx);
  const rows = Math.ceil(height / layout.contentHeightPx);
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const sx = column * layout.contentWidthPx, sy = row * layout.contentHeightPx;
    const sourceWidth = Math.min(layout.contentWidthPx, width - sx);
    const sourceHeight = Math.min(layout.contentHeightPx, height - sy);
    yield { row, column, sx, sy, sourceWidth, sourceHeight,
      xMM: layout.margins.left, yMM: layout.margins.top,
      widthMM: sourceWidth / layout.pixelsPerMM, heightMM: sourceHeight / layout.pixelsPerMM };
  }
}
