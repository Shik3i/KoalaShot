export function selectClipboardMethod(capabilities) {
  if (capabilities.isFirefox && capabilities.hasFirefoxSetImageData) {
    return "firefox-set-image-data";
  }
  if (capabilities.hasClipboardItem && capabilities.hasNavigatorClipboardWrite) {
    return "clipboard-item";
  }
  return "unsupported";
}

function getCapabilities(api) {
  return {
    isFirefox: typeof api?.runtime?.getBrowserInfo === "function",
    hasFirefoxSetImageData: typeof api?.clipboard?.setImageData === "function",
    hasClipboardItem: typeof globalThis.ClipboardItem === "function",
    hasNavigatorClipboardWrite: typeof globalThis.navigator?.clipboard?.write === "function",
  };
}

export async function copyPngBlob(blob, api) {
  if (!(blob instanceof Blob) || blob.type !== "image/png") {
    throw new Error("The screenshot is not a PNG Blob.");
  }

  const method = selectClipboardMethod(getCapabilities(api));
  if (method === "firefox-set-image-data") {
    const buffer = await blob.arrayBuffer();
    await api.clipboard.setImageData(buffer, "png");
    return;
  }

  if (method === "clipboard-item") {
    const item = new ClipboardItem({ "image/png": blob });
    await globalThis.navigator.clipboard.write([item]);
    return;
  }

  throw new Error("This browser does not provide an image clipboard API.");
}
