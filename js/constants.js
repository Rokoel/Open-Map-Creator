const constants = {
    defaultEmptyCellFillColor: "#ffffff",
    defaultEmptyCellBorderColor: "#e0e0e0",
    defaultGridDrawFillColor: "#000000",
    defaultGridDrawBorderColor: "#aaaaaa",
    defaultFreeFillColor: "#000000", // Black
    defaultFreeBorderColor: "#000000", // Black
    attentionColor: "#ffcc00", // Yellowish for placeholders/warnings
    errorColor: "#ff00ff", // Magenta for errors
    selectionRectColor: "#0000ff", // Blue dashed line
    selectionHighlightColor: "#00ffff", // Cyan solid line

    // Default Settings
    baseCellSize: 32, // Default cell size in pixels on screen load
    autoSaveInterval: 10000, // Auto-save every 10 seconds (milliseconds)
    historyLimit: 50, // Max number of undo steps

    // File Names & Storage
    mapBackupFileName: "ttrpg_map_export",
    mapPDFFileName: "ttrpg_map_print",
    localStorageKey: "ttrpgMapCreatorData", // Key for local storage
    saveFileVersion: "1.0.0", // Version for save file format

    // PDF Export Page Sizes (in mm)
    pageSizesMM: {
        A4: { width: 210, height: 297 },
        A3: { width: 297, height: 420 },
        // Add Letter, Legal etc. if needed
        // Letter: { width: 215.9, height: 279.4 },
        // Legal: { width: 215.9, height: 355.6 }
    },
    defaultGridShadowOptions: {
        enabled: false,
        angle: 45, // degrees
        offset: 0.5, // in cells
        color: "#00000080", // semi-transparent black
    },
};

export {constants};