export async function renderEditorResultBlob(capture) {
  if (!(capture?.blob instanceof Blob) || capture.blob.type !== "image/png") {
    throw new Error("The editor capture is unavailable.");
  }
  // Phase 2 will composite immutable original pixels and vector annotations here.
  return capture.blob;
}
