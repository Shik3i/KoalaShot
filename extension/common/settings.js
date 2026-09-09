export const DEFAULT_SETTINGS = Object.freeze({
  openEditorAfterCapture: false,
  captureTarget: "page",
});

export function normalizeSettings(values = {}) {
  return {
    // Migrate the former combined action: Copy/Save never open the editor.
    openEditorAfterCapture: false,
    captureTarget: ["internal", "visible"].includes(values.captureTarget) ? values.captureTarget : "page",
  };
}
