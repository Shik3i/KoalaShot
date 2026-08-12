const INVALID_FILENAME_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f]/g;

function pad(value) {
  return String(value).padStart(2, "0");
}

export function formatLocalTimestamp(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + "_" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("-");
}

export function getSafeHostname(sourceUrl) {
  try {
    const hostname = new URL(sourceUrl).hostname;
    return hostname.replace(INVALID_FILENAME_CHARACTERS, "_").replace(/\s+/g, "_") || "page";
  } catch {
    return "page";
  }
}

export function makeFilename(sourceUrl, date = new Date()) {
  const hostname = getSafeHostname(sourceUrl).slice(0, 48);
  const filename = `KoalaShot_${hostname}_${formatLocalTimestamp(date)}.png`;
  return filename.slice(0, 128).replace(/\.png$/i, ".png");
}
