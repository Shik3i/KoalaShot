export const DEFAULT_SETTINGS = Object.freeze({
  openEditorAfterCapture: false,
  captureTarget: "page",
});

export function normalizeSettings(values = {}) {
  return {
    openEditorAfterCapture: Boolean(values.openEditorAfterCapture),
    captureTarget: values.captureTarget === "internal" ? "internal" : "page",
  };
}
