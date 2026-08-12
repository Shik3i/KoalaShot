export const DEFAULT_SETTINGS = Object.freeze({
  openEditorAfterCapture: false,
});

export function normalizeSettings(values = {}) {
  return {
    openEditorAfterCapture: Boolean(values.openEditorAfterCapture),
  };
}
